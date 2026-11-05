use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, serde::Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
enum RuntimeStatus {
    Offline { message: String },
    Starting { message: String },
    Ready { version: String, message: String },
    Faulted { message: String },
}

#[derive(Clone)]
struct RuntimeManager {
    status: Arc<Mutex<RuntimeStatus>>,
    connection: Arc<Mutex<Option<Arc<RuntimeConnection>>>>,
    generation: Arc<AtomicU64>,
}

struct RuntimeConnection {
    stdin: Arc<Mutex<ChildStdin>>,
    child: Mutex<Child>,
    pending: Arc<Mutex<HashMap<String, SyncSender<Result<Value, String>>>>>,
    next_id: AtomicU64,
}

impl Default for RuntimeManager {
    fn default() -> Self {
        Self {
            status: Arc::new(Mutex::new(RuntimeStatus::Offline {
                message: "尚未连接 Harness".into(),
            })),
            connection: Arc::new(Mutex::new(None)),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }
}

impl RuntimeManager {
    fn publish_status(&self, app: &AppHandle, status: RuntimeStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status.clone();
        }
        let _ = app.emit("desktop:runtime-status", status);
    }

    fn current_connection(&self) -> Result<Arc<RuntimeConnection>, String> {
        self.connection
            .lock()
            .map_err(|_| "运行时连接状态不可用".to_string())?
            .clone()
            .ok_or_else(|| "请先连接 Harness".to_string())
    }

    fn connect(
        &self,
        app: AppHandle,
        node_path: String,
        dsh_path: String,
        dsh_home: Option<String>,
        patch_path: Option<String>,
        workspace: Option<String>,
        provider: String,
        model: String,
    ) -> Result<RuntimeStatus, String> {
        let mut current = self
            .connection
            .lock()
            .map_err(|_| "运行时连接状态不可用".to_string())?;
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        current.take();
        drop(current);

        self.publish_status(
            &app,
            RuntimeStatus::Starting {
                message: "正在启动 Harness".into(),
            },
        );

        let result = self.connect_inner(
            app.clone(),
            node_path,
            dsh_path,
            dsh_home,
            patch_path,
            workspace,
            provider,
            model,
            generation,
        );

        match result {
            Ok(status) => {
                let current = self
                    .connection
                    .lock()
                    .map_err(|_| "运行时连接状态不可用".to_string())?;
                if self.generation.load(Ordering::Acquire) != generation {
                    return Err("连接已被新的操作替换".into());
                }
                self.publish_status(&app, status.clone());
                Ok(status)
            }
            Err(error) => {
                let mut current = self
                    .connection
                    .lock()
                    .map_err(|_| "运行时连接状态不可用".to_string())?;
                if self.generation.load(Ordering::Acquire) != generation {
                    return Err("连接已被新的操作替换".into());
                }
                current.take();
                let status = RuntimeStatus::Faulted {
                    message: error.clone(),
                };
                self.publish_status(&app, status);
                Err(error)
            }
        }
    }

    fn connect_inner(
        &self,
        app: AppHandle,
        node_path: String,
        dsh_path: String,
        dsh_home: Option<String>,
        patch_path: Option<String>,
        workspace: Option<String>,
        provider: String,
        model: String,
        generation: u64,
    ) -> Result<RuntimeStatus, String> {
        let node_path = node_path.trim();
        if node_path.is_empty() {
            return Err("请填写 Node.js 命令或程序路径".into());
        }

        let dsh_bin = resolve_dsh_entry(Path::new(dsh_path.trim()))?;
        let workspace = resolve_workspace(workspace.as_deref())?;
        let patch_path = resolve_patch_path(patch_path.as_deref(), &workspace)?;
        let mut command = Command::new(node_path);
        command
            .arg(dsh_bin)
            .arg("--profile")
            .arg("sdk");
        if let Some(patch_path) = patch_path {
            command.arg("--patch").arg(patch_path);
        }
        command
            .current_dir(&workspace)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        if let Some(home) = dsh_home.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            command.env("DSH_HOME", home);
        }

        let mut child = command.spawn().map_err(|error| {
            format!("无法启动 Harness。请检查 Node.js 和 Harness 路径：{error}")
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "无法打开 Harness 输入通道".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "无法打开 Harness 输出通道".to_string())?;
        let pending = Arc::new(Mutex::new(HashMap::new()));
        let connection = Arc::new(RuntimeConnection {
            stdin: Arc::new(Mutex::new(stdin)),
            child: Mutex::new(child),
            pending: pending.clone(),
            next_id: AtomicU64::new(1),
        });

        let mut current = self
            .connection
            .lock()
            .map_err(|_| "运行时连接状态不可用".to_string())?;
        if self.generation.load(Ordering::Acquire) != generation {
            return Err("连接已被新的操作替换".into());
        }
        *current = Some(connection.clone());
        drop(current);

        let status = self.status.clone();
        let generation_state = self.generation.clone();
        let request_stdin = connection.stdin.clone();
        let app_for_reader = app.clone();
        thread::spawn(move || read_runtime_output(stdout, pending, status, generation_state, generation, request_stdin, app_for_reader));

        let init = connection.request(
            "initialize",
            json!({
                "cwd": workspace.to_string_lossy(),
                "provider": provider.trim(),
                "model": model.trim(),
                "approvalRequests": true,
                "capabilities": {"userQuestions": true}
            }),
            Duration::from_secs(15),
        )?;
        let version = init
            .get("serverInfo")
            .and_then(|info| info.get("version"))
            .and_then(Value::as_str)
            .unwrap_or("未知版本")
            .to_string();

        Ok(RuntimeStatus::Ready {
            version,
            message: "Harness 已连接".into(),
        })
    }

    fn disconnect(&self, app: &AppHandle) {
        if let Ok(mut connection) = self.connection.lock() {
            self.generation.fetch_add(1, Ordering::AcqRel);
            if let Some(connection) = connection.take() {
                let _ = connection.request("shutdown", Value::Null, Duration::from_secs(1));
                drop(connection);
            }
        }
        self.publish_status(
            app,
            RuntimeStatus::Offline {
                message: "已断开 Harness".into(),
            },
        );
    }
}

impl RuntimeConnection {
    fn request(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let key = id.to_string();
        let (sender, receiver) = mpsc::sync_channel(1);
        self.pending
            .lock()
            .map_err(|_| "Harness 请求状态不可用".to_string())?
            .insert(key.clone(), sender);

        let payload = if params.is_null() {
            json!({"jsonrpc": "2.0", "id": id, "method": method})
        } else {
            json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params})
        };
        let write_result = self
            .stdin
            .lock()
            .map_err(|_| "Harness 输入通道不可用".to_string())
            .and_then(|mut stdin| {
                serde_json::to_writer(&mut *stdin, &payload)
                    .map_err(|error| error.to_string())?;
                stdin.write_all(b"\n").map_err(|error| error.to_string())?;
                stdin.flush().map_err(|error| error.to_string())
            });

        if let Err(error) = write_result {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&key);
            }
            return Err(format!("无法发送 Harness 请求：{error}"));
        }

        match receiver.recv_timeout(timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if let Ok(mut pending) = self.pending.lock() {
                    pending.remove(&key);
                }
                Err(format!("Harness 请求超时：{method}"))
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                Err("Harness 连接已关闭".into())
            }
        }
    }

    fn respond(&self, id: Value, result: Value) -> Result<(), String> {
        let payload = json!({"jsonrpc": "2.0", "id": id, "result": result});
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| "Harness 输入通道不可用".to_string())?;
        serde_json::to_writer(&mut *stdin, &payload).map_err(|error| error.to_string())?;
        stdin
            .write_all(b"\n")
            .and_then(|_| stdin.flush())
            .map_err(|error| format!("无法回复 Harness 请求：{error}"))
    }
}

impl Drop for RuntimeConnection {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn resolve_dsh_entry(path: &Path) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("请填写 Harness 启动文件或 @deepseek-ai/dsh 文件夹".into());
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("找不到 Harness 路径：{error}"))?;
    let entry = if path.is_dir() {
        let manifest_path = path.join("package.json");
        let manifest_text = fs::read_to_string(&manifest_path)
            .map_err(|error| format!("无法读取 Harness package.json：{error}"))?;
        let manifest: Value = serde_json::from_str(&manifest_text)
            .map_err(|error| format!("Harness package.json 格式无效：{error}"))?;
        let bin = manifest
            .get("bin")
            .and_then(|value| value.get("dsh").or(Some(value)))
            .and_then(Value::as_str)
            .ok_or_else(|| "这个目录没有 dsh 命令入口".to_string())?;
        path.join(bin)
    } else {
        path
    };

    if !entry.is_file() {
        return Err("找不到 Harness 的 dsh 启动文件".into());
    }
    Ok(entry)
}

fn resolve_workspace(workspace: Option<&str>) -> Result<PathBuf, String> {
    let candidate = workspace
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "无法确定工作目录".to_string())?;
    let absolute = candidate
        .canonicalize()
        .map_err(|error| format!("工作目录不可用：{error}"))?;
    if !absolute.is_dir() {
        return Err("工作目录必须是一个文件夹".into());
    }
    Ok(absolute)
}

fn resolve_patch_path(patch_path: Option<&str>, workspace: &Path) -> Result<Option<PathBuf>, String> {
    let Some(patch_path) = patch_path.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let candidate = PathBuf::from(patch_path);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        workspace.join(candidate)
    };
    let resolved = candidate
        .canonicalize()
        .map_err(|error| format!("找不到 Harness 配置文件：{error}"))?;
    if !resolved.is_file() {
        return Err("Harness 配置路径必须指向一个文件".into());
    }
    Ok(Some(resolved))
}

fn read_runtime_output(
    stdout: ChildStdout,
    pending: Arc<Mutex<HashMap<String, SyncSender<Result<Value, String>>>>>,
    status: Arc<Mutex<RuntimeStatus>>,
    active_generation: Arc<AtomicU64>,
    generation: u64,
    stdin: Arc<Mutex<ChildStdin>>,
    app: AppHandle,
) {
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let Ok(line) = line else { break };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };

        if let Some(method) = message.get("method").and_then(Value::as_str) {
            if let Some(id) = message.get("id") {
                match method {
                    "approval/request" | "user-question/ask" => {
                        let _ = app.emit(
                            "desktop:host-request",
                            json!({"id": id, "method": method, "params": message.get("params").cloned().unwrap_or(Value::Null)}),
                        );
                    }
                    _ => {
                        let payload = json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": {"code": -32601, "message": "Unsupported Harness host request"}
                        });
                        if let Ok(mut child_stdin) = stdin.lock() {
                            if serde_json::to_writer(&mut *child_stdin, &payload).is_ok() {
                                let _ = child_stdin.write_all(b"\n");
                                let _ = child_stdin.flush();
                            }
                        }
                    }
                }
            } else {
                match method {
                    "session.event" => {
                        if let Some(event) = map_session_event(&message["params"]) {
                            let _ = app.emit("desktop:session-event", event);
                        }
                    }
                    "session.status" => {
                        let params = &message["params"];
                        if params.get("sessionId").and_then(Value::as_str).is_some()
                            && params.get("status").and_then(Value::as_str).is_some()
                        {
                            let _ = app.emit("desktop:session-status", params);
                        }
                    }
                    "user-question.cancelled" => {
                        if let Some(request_id) = message["params"].get("requestId").and_then(Value::as_str) {
                            let _ = app.emit("desktop:host-request-cancelled", json!({"requestId": request_id}));
                        }
                    }
                    _ => {}
                }
            }
            continue;
        }

        let Some(id) = message.get("id").and_then(rpc_id_key) else {
            continue;
        };
        let sender = pending.lock().ok().and_then(|mut map| map.remove(&id));
        if let Some(sender) = sender {
            let result = if let Some(error) = message.get("error") {
                Err(error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Harness 返回错误")
                    .to_string())
            } else {
                Ok(message.get("result").cloned().unwrap_or(Value::Null))
            };
            let _ = sender.send(result);
        }
    }

    if active_generation.load(Ordering::Acquire) == generation {
        if let Ok(mut status) = status.lock() {
            *status = RuntimeStatus::Offline {
                message: "Harness 连接已关闭".into(),
            };
            let _ = app.emit("desktop:runtime-status", status.clone());
        }
    }
    if let Ok(mut pending) = pending.lock() {
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err("Harness 连接已关闭".into()));
        }
    }
}

fn rpc_id_key(id: &Value) -> Option<String> {
    match id {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn map_session_event(params: &Value) -> Option<Value> {
    let session_id = params.get("sessionId")?.as_str()?;
    let event = params.get("event")?;
    let event_type = event.get("type")?.as_str()?;
    let sequence = event.get("seq")?.as_u64()?;
    let occurred_at = event.get("time")?.as_u64()?;
    let data = event.get("data")?;
    let event_id = format!("{session_id}:{sequence}");

    match event_type {
        "user/message" | "assistant/message" => {
            let message = if event_type == "user/message" {
                if data.get("source").and_then(|source| source.get("kind")).and_then(Value::as_str) != Some("user") {
                    return None;
                }
                data
            } else {
                data.get("message")?
            };
            let content = message.get("content").unwrap_or(&Value::Null);
            let text = content_text(content);
            if text.trim().is_empty() {
                return None;
            }
            let role = if event_type == "user/message" {
                "user"
            } else {
                "assistant"
            };
            Some(json!({
                "eventId": event_id,
                "sessionId": session_id,
                "sequence": sequence,
                "occurredAt": occurred_at,
                "type": "message.completed",
                "payload": {"messageId": event_id, "role": role, "text": text}
            }))
        }
        "tool/call" => {
            let call_id = data.get("callId")?.as_str()?;
            Some(json!({
                "eventId": event_id,
                "sessionId": session_id,
                "sequence": sequence,
                "occurredAt": occurred_at,
                "type": "tool.started",
                "payload": {
                    "callId": call_id,
                    "toolName": data.get("name").cloned().unwrap_or(Value::String("工具".into())),
                    "summary": data.get("arguments").map(value_summary).unwrap_or_default()
                }
            }))
        }
        "tool/result" => {
            let message = data.get("message")?;
            let call_id = message.get("source")?.get("callId")?.as_str()?;
            let is_error = data.get("error").is_some_and(|error| !error.is_null())
                || message.get("isError").and_then(Value::as_bool) == Some(true);
            let summary = data
                .get("error")
                .and_then(|error| error.get("reason"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| message.get("content").map(content_text).unwrap_or_default());
            Some(json!({
                "eventId": event_id,
                "sessionId": session_id,
                "sequence": sequence,
                "occurredAt": occurred_at,
                "type": "tool.completed",
                "payload": {
                    "callId": call_id,
                    "outcome": if is_error { "error" } else { "success" },
                    "summary": summary
                }
            }))
        }
        _ => None,
    }
}

fn value_summary(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        _ => serde_json::to_string_pretty(value).unwrap_or_default(),
    }
}

fn content_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    let Some(blocks) = content.as_array() else {
        return String::new();
    };
    blocks
        .iter()
        .filter_map(|block| {
            if block.get("type").and_then(Value::as_str) == Some("text") {
                block.get("text").and_then(Value::as_str).map(str::to_string)
            } else if block.get("type").and_then(Value::as_str) == Some("image") {
                Some("[图片]".into())
            } else {
                None
            }
        })
        .collect::<Vec<_>>()
        .join("")
}

#[tauri::command]
fn runtime_status(state: State<'_, RuntimeManager>) -> RuntimeStatus {
    state
        .status
        .lock()
        .map(|status| status.clone())
        .unwrap_or(RuntimeStatus::Faulted {
            message: "运行时状态不可用".into(),
        })
}

#[tauri::command]
fn connect_runtime(
    app: AppHandle,
    state: State<'_, RuntimeManager>,
    node_path: String,
    dsh_path: String,
    dsh_home: Option<String>,
    patch_path: Option<String>,
    workspace: Option<String>,
    provider: String,
    model: String,
) -> Result<RuntimeStatus, String> {
    state.connect(
        app,
        node_path,
        dsh_path,
        dsh_home,
        patch_path,
        workspace,
        provider,
        model,
    )
}

#[tauri::command]
fn session_query(
    state: State<'_, RuntimeManager>,
    session_id: String,
    content_blocks: Vec<Value>,
) -> Result<(), String> {
    if content_blocks.is_empty() {
        return Err("请输入消息或添加图片".into());
    }
    let mut has_content = false;
    for block in &content_blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("text") => {
                let text = block
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "消息文本格式无效".to_string())?;
                has_content |= !text.trim().is_empty();
            }
            Some("image") => {
                let data = block.get("data").and_then(Value::as_str).unwrap_or_default();
                let mime_type = block.get("mimeType").and_then(Value::as_str).unwrap_or_default();
                if data.is_empty()
                    || !matches!(mime_type, "image/png" | "image/jpeg" | "image/webp" | "image/gif")
                {
                    return Err("图片内容无效，请重新选择图片".into());
                }
                has_content = true;
            }
            _ => return Err("消息包含不支持的内容".into()),
        }
    }
    if !has_content {
        return Err("请输入消息或添加图片".into());
    }
    let connection = state.current_connection()?;
    let result = connection.request(
        "session/query",
        json!({
            "sessionId": session_id,
            "contentBlocks": content_blocks
        }),
        Duration::from_secs(15),
    )?;
    if result.get("kind").and_then(Value::as_str).is_some() {
        Ok(())
    } else {
        Err("Harness 返回了无法识别的会话结果".into())
    }
}

#[tauri::command]
fn resume_session(state: State<'_, RuntimeManager>, session_id: String) -> Result<(), String> {
    let result = state.current_connection()?.request(
        "session/resume",
        json!({"sessionId": session_id}),
        Duration::from_secs(15),
    )?;
    if result.is_object() {
        Ok(())
    } else {
        Err("Harness 返回了无法识别的恢复结果".into())
    }
}

#[tauri::command]
fn set_working_directory(
    state: State<'_, RuntimeManager>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let result = state.current_connection()?.request(
        "session/working-directory/set",
        json!({"sessionId": session_id, "path": path}),
        Duration::from_secs(15),
    )?;
    result
        .get("cwd")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| "Harness 没有返回工作文件夹".into())
}

#[tauri::command]
fn respond_host_request(
    state: State<'_, RuntimeManager>,
    id: Value,
    result: Value,
) -> Result<(), String> {
    state.current_connection()?.respond(id, result)
}

#[tauri::command]
fn disconnect_runtime(app: AppHandle, state: State<'_, RuntimeManager>) {
    state.disconnect(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RuntimeManager::default())
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            connect_runtime,
            session_query,
            resume_session,
            set_working_directory,
            respond_host_request,
            disconnect_runtime
        ])
        .run(tauri::generate_context!())
        .expect("error while running dsh-desktop-delta");
}

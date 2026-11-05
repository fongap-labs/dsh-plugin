# Desktop Host API v1.1

## 状态

这是 Delta 前端与桌面 Host 之间的目标接口合同，不是对 Harness 当前全部能力的描述。完整会话目录的上游现状、传输缺口和接口要求见[会话目录接口提案](SESSION_DIRECTORY_API_PROPOSAL.md)；精确停止任务的接口见[精确取消接口提案](RUN_CANCELLATION_API_PROPOSAL.md)；设置与凭据接口的缺口见[设置接口提案](SETTINGS_API_PROPOSAL.md)。`src/lib/desktop-host-contract.ts` 定义 renderer 使用的产品 DTO。当前 Tauri adapter 已通过用户指定的 Node.js 与 Harness CLI 启动官方 `sdk` profile，并接通文本和编码图片输入、消息／状态／工具事件、一次性工具审批、用户提问、会话恢复和工作目录切换；用户可选提供配置补丁路径，adapter 通过 Harness 官方 `--patch` 参数传递；其他接口仍未实现。

桌面端不得用模拟会话填充界面。运行时不支持某项能力时，Host 应省略相应 capability，UI 显示不可用原因。

## 边界

```text
Delta React UI
  ↕ DesktopHostPort（本文件定义的 DTO 与能力）
Tauri Host adapter（进程生命周期、权限与协议映射）
  ↕ Harness 官方 SDK／受支持的本地协议
DeepSeek Harness（唯一运行内核）
```

Renderer 不依赖 Harness SDK 类型、Cordis 服务或私有文件。Tauri adapter 只转换类型和管理桌面进程，不实现 Agent 循环、模型选择、工具执行、审批策略或会话存储。`dsh-suite-delta` 可继续作为 Harness 插件并行运行；桌面包不需要加载 Harness Web UI。

## 无 Web GUI 运行方式

Harness 已有受支持的长期运行 `sdk` profile。Tauri 启动 `dsh --profile sdk`，通过 stdin/stdout 连接 JSON-RPC；官方 SDK profile 不启动 Web Server，也不打开 Harness 浏览器界面。Delta 自己的界面仍由 Tauri WebView 提供。

`headless` 是另一种单次任务 profile：运行一个新任务、输出最终答案后退出，不适用于持续会话和桌面交互。当前 adapter 已使用 `sdk`，不需要新增或私有化启动入口。

官方依据：[SDK profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md)、[CLI profile 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)、[headless profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)。

## 握手与版本

本次实现的是 **Delta renderer ↔ Tauri Host** 协议 v1.1。连接 Harness SDK 的 `initialize` 成功后，renderer 调用 `desktop_host_handshake({ protocolVersion: {major:1,minor:1} })`；主版本不同拒绝，次版本按可选字段和 capability 兼容。断线、重新连接和桌面刷新后清除旧协商结果，重新握手。

**Harness 上游 SDK 目前没有协议版本协商或完整 capability 握手。** Tauri 返回的能力来自当前 adapter 已实现、且官方 SDK 文档声明的功能子集；`upstream.protocol=sdk-stdio-unversioned`、`capabilitySource=adapter-supported-methods` 明确来源，不代表 Harness 运行时逐项协商完成。

默认返回 `sessions.resume`、`sessions.prompt`、`sessions.wait`、`sessions.events`、`approvals.respond`、`questions.respond`、`workspace.cwd`。用户明确指定本机文件夹且 Harness 已连接时，Tauri 才额外提供本地 `workspace.files` 只读浏览能力；这不是 Harness SDK 的工作区文件接口。Delta 本机目录不是 Harness 全量会话目录，不能因此返回 `sessions.list`。Harness 公开的 Session Controller Remote API 虽有 `session.list`、`session.search`、`session.create`，但当前官方 `sdk` stdio profile 未提供 API Gateway 的远程传输入口，不能由当前 adapter 调用；未返回的 capability 不启用 UI 功能。当前不返回 `sessions.cancel`，且 `upstream.runCancellation=false`；`AbortSignal` 与 `shutdown` 不能模拟单次运行取消。


Host 在任何会话操作前执行握手，返回 `DesktopHostHandshake`：

- `protocolVersion`：主版本不一致时停止连接；次版本只允许增加可选字段和 capability。
- `runtime`：Harness 名称和版本，用于诊断；不得仅根据版本号推断功能。
- `capabilities`：当前运行时实际支持的功能集合，作为所有操作的准入依据。

UI 对每项操作先检查对应 capability。缺少能力返回 `unsupported_capability`，而不是改读 Harness 内部存储、调用私有 Host 服务或切换到原生 Web UI。

## 操作域

`DesktopHostPort` 是 UI 看到的稳定接口。实现可采用不同的内部命令名，但不得把 Harness 原始类型透传到 UI。

| 操作域 | 目标能力 | 约束 |
|---|---|---|
| 会话 | 列表分页、搜索、创建、恢复、提示、等待完成、取消、事件订阅和历史回放 | 当前 SDK stdio 仅接通提示、恢复、等待和实时通知；Session Controller 的公开 Remote API 有列表、搜索和创建，但未通过当前 `sdk` profile 暴露；列表分页、目录变更订阅和 SDK 历史回放仍缺可用合同 |
| 审批与提问 | 回复工具审批、回答用户问题 | 取消与拒绝分开表达；任何断线或超时都不能隐式批准 |
| 工作区 | 列出、选择工作区，浏览相对路径文件 | SDK 支持读取与切换会话工作目录 `workspace.cwd`；用户选定本机目录后，Tauri 另外提供受限只读文件浏览；Harness 正式工作区列表和文件树仍缺 SDK stdio 合同 |
| 设置 | 获取和更新设置 | 这是目标合同；当前 sdk stdio 未提供 Settings Controller 传输，Delta 不启用读写能力。缺口见[设置接口提案](SETTINGS_API_PROPOSAL.md) |
| 模型与扩展 | 查询模型、插件、技能目录 | 修改技能等写操作必须单独协商 capability 与权限 |
| 终端 | 创建、输入、调整尺寸、关闭和订阅输出 | 终端进程由受支持的 Host 服务管理；Delta 不实现第二套工具运行器 |

## 事件和错误

Tauri 调用在 TypeScript adapter 统一收敛为 `DesktopHostError`，保留 `code`、`retryable`、`outcomeUnknown`。原始 SDK 仍会返回不带类型码的错误字符串；未知错误统一记为 `runtime_error`，不猜测权限、修订版本冲突类别。客户端请求设有超时并支持 `AbortSignal`；**超时或取消只结束本地等待**，不代表已经撤销 Harness 消息、审批、提问或运行任务。未取得最终回执时 `outcomeUnknown=true`，不能自动重试有副作用的操作。Rust 当前仍采用有界阻塞 RPC 请求；未来真正的跨层取消信号传播须依赖 Harness 正式合同。

Tauri 为未映射的 SDK 会话事件发出不包含原始载荷的 `session.advanced` 序号标记，避免正常忽略的 SDK 事件造成误报警。renderer 按稳定会话 ID 丢弃重复/旧序号，对真实跳号显示缺口提醒。发送消息后，renderer 还会调用官方 `session/wait`；根 Agent 的 `idle` 通知不会提前结束等待，只有根 Agent 与受管子 Agent 均完成后才清除运行状态。明确的 SDK RPC 错误会结束等待并保留已提交消息；等待超时或连接中断时，结果保持未知，不恢复原消息以免重复提交。**Harness `session/resume` 不会回放旧事件**，SDK 暂无 `events.replay` 或状态快照接口，不能完整重同步；`sessions.events.resync` 不在当前协商能力中。断线后运行中任务结果仍为未知，界面不得显示“已恢复全部事件”。未来需要 Harness 增加按稳定 session ID 和事件序号分页回放/快照、游标缺口处理与重新订阅的公开接口。


会话事件包含 `eventId`、`sessionId`、每个会话单调递增的 `sequence`、`occurredAt`、类型与类型化 payload。重复事件可用 `eventId` 去重；序号间断时 UI 显示缺口警告，不执行尚未实现的历史事件重新同步。

Host 将错误归一为 `DesktopHostError`：`protocol_mismatch`、`unsupported_capability`、`permission_denied`、`not_found`、`conflict`、`invalid_request`、`runtime_unavailable`、`timeout`、`cancelled`、`runtime_error`。错误可标记 `retryable`；重试必须由操作语义决定，不能假定请求超时代表 Harness 没有执行。

## 工作区与文件合同

Harness 的官方 SDK stdio 公开 `session/working-directory/get` 与 `session/working-directory/set`，Tauri Host 分别以 `get_working_directory` 和 `set_working_directory` 暴露，并通过现有 `workspace.cwd` capability 启用。官方 SDK 对未知会话的工作目录查询也可能懒创建会话，因此读取仅在提示被接纳、明确恢复或设置目录成功后执行，不作为全量工作区发现方法。

官方 `@deepseek-ai/dsh-api-workspace-controller` 的 `workspace` Remote namespace 提供工作区注册、重命名、移除、排序和状态跟随；`@deepseek-ai/dsh-api-workspace-files` 的 `workspaceFiles` Remote namespace 提供 `stat`、`read`、`readBytes`、`list` 和 `changes`，属于只读文件预览。两者通过 API Gateway 提供，尚未接入当前无 Web GUI 的 SDK stdio；不能把本机文件读取、猜测 `cwd` 或扫描 Harness 私有目录当作替代。

详细接口与安全边界见[工作区与文件接口提案](WORKSPACE_FILES_API_PROPOSAL.md)。

### 本机工作区只读浏览

作为 **Tauri 本机能力**，`workspace.files` 仅在 Harness 连接就绪、用户明确选择并授权本机工作文件夹时返回。它不代表 Harness 提供了 `workspaceFiles.list` / `workspaceFiles.read`。工作目录变更后重新握手；断线则撤销能力。

- `list_workspace_files({ relativePath })` 和 `preview_workspace_file({ relativePath })` 只接受选定目录下的相对路径。
- 拒绝绝对路径、父目录穿越、隐藏和受限制的目录、符号链接以及规范化后越界的路径；不会尝试读取 Harness 私有会话、设置、数据库、凭据或安装目录。
- 最多展示 200 项，每次扫描上限 3000；预览仅允许常见文本扩展名、UTF-8 且最多 64 KiB。不会发送到 Harness，不支持修改或执行文件。
- 文件名、文件内容仅供本机展示；该功能不授予任意绝对路径读取或独立的 Harness 文件工具权限。
- 文件系统可被其他程序并发修改时，路径检查和读取之间存在 TOCTOU 风险。对不可信工作区和高度敏感数据，应禁用本地预览，并等待 Harness 上游提供更强的受支持文件授权合同。

## 当前 SDK 覆盖与缺口

Harness 已公开的 [SDK client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/client/README.zh.md)、[协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.zh.md) 和 [SDK server](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.zh.md) 适合进程外提示、查询、会话恢复和等待、工作目录操作，以及审批／用户提问请求和事件通知。它依赖组合好的 Harness runtime profile；SDK server 不包含 Agent、持久化或工具内核。当前 Delta adapter 直接实现公开 stdio JSON-RPC 的已接通子集，没有把 `@deepseek-ai/dsh` 或依赖它的 SDK client 打入桌面包。Delta 的会话侧栏只记录本机由 Delta 创建的会话，不代表 Harness 的完整会话目录。

SDK 的会话事件通知会覆盖同一运行时中的所有会话。Delta 只处理本机记录里存在、且符合 Delta 会话 ID 格式的会话事件与审批／提问请求；未知会话事件不会加入历史记录，未知会话的审批会被拒绝，提问会被取消，以免外部会话等待 Delta 回答。

当前 SDK stdio 协议尚未提供完整桌面需要的会话目录分页、搜索和显式创建；单独取消会话、设置 CRUD、工作区与文件清单、插件／技能管理和终端控制也未接入。另有公开的 `@deepseek-ai/dsh-api-session-controller` Remote API，通过 API Gateway 提供 `session.list`、`session.search` 和 `session.create`，但该通道未暴露在当前无 Web GUI 的 `sdk` profile 中，不能假定 Delta 可直接调用。SDK stdio 没有单会话取消请求。Harness 公开 Session Controller Remote API 虽有 `session.cancel({ sessionId })`，但只作用于活动的普通 Agent，且未通过当前 `sdk` profile 暴露；该请求还没有指定 `turnId` 的原子核验。关闭 SDK 进程会影响该进程承载的全部会话，因此 Delta 不提供单次运行停止按钮。补齐这些功能需要扩展官方 SDK 或提供受支持的 Desktop Host API；无 Web GUI 启动方式已由官方 `sdk` profile 提供。Delta 不修改 `app.asar`、Harness 私有目录或全局用户设置来填补缺口。

## 会话目录接口缺口

当前公开 API 的边界如下：

- SDK stdio 协议只声明 `initialize`、`session/prompt`、`session/query`、`session/resume`、`session/wait`、工作目录读写和 `shutdown`；没有 `session/list`、`session/search` 或 `session/create`。
- SDK 客户端的 `session(id?)` 只在客户端生成或接收 ID，运行时在首次提示或工作目录操作时才创建会话；它不是已保存会话目录。
- Harness 的公开 `@deepseek-ai/dsh-api-session-controller` 通过 API Gateway 提供 `session.list`、`session.search`、`session.create`。但该客户端包声明为 Web 平台，当前 SDK profile 不启动 Web Server，也没有把该 Remote 通道接入 stdio。
- 该 Remote API 的 `session.list` 当前返回完整可见列表，虽有保留的 `cursor` 请求字段，但实现未使用它，也不返回下一页游标；`session.search` 最多返回 20 条并提供 `hasMore`，没有继续搜索游标，且依赖可选的 Session Query 搜索服务。
- Session Controller 还提供历史页和 follow 类 Remote 操作；SDK stdio 目前只推送实时 `session.event` 通知。SDK 的 `session/resume` 不会重新推送历史事件，因此不能把它当作断线后的事件补齐机制。

上述 Remote API 是公开的 Harness Host API，不等于当前桌面连接已经具备该传输。Delta 不直接调用 Harness 私有 Context 服务、未公开模块或 Web UI 内部接口，也不读取 Harness 私有会话文件或数据库。

## 所需上游合同

优先由 Harness 在现有 SDK stdio 协议中公开下列能力；若维护者选择 API Gateway 方案，则必须提供受支持的本机 API-only profile，明确认证、端口绑定、生命周期和版本合同，并且不启动 SPA 或原生 Web UI。

| 方法／能力 | 请求 | 返回与语义 |
|---|---|---|
| `session/list` | `{ cursor?, limit?, workspaceId?, includeSubagents? }` | `{ items, nextCursor?, snapshotRevision }`；返回调用者可见的已保存和活动会话，不激活冷会话；游标不透明、绑定筛选条件和快照，稳定排序，不漏项、不重复 |
| `session/search` | `{ query, cursor?, limit?, fields? }` | `{ items: [{ sessionId, snippet, field? }], nextCursor?, hasMore }`；只返回有权查看的会话，搜索能力单独协商；索引未启用时明确返回 unsupported |
| `session/create` | `{ sessionId?, workspaceId?, cwd?, agentPreset? }` | `{ sessionId, agentPreset? }`；显式创建或按合同复用空白会话，不把恢复失败静默转换成新会话 |
| `session/directory/follow` | `{ afterRevision? }` | 先确认订阅基线，再推送带单调递增 `revision` 的 `upsert/remove` 变更；游标过期时明确要求重新获取列表快照 |
| `session/events` | `{ sessionId, afterSeq?, limit? }` | 返回该会话的有序历史事件页、下一游标和当前序号；用于补齐重复、乱序或缺失事件 |
| `session/follow` | `{ sessionId, afterSeq? }` | 在明确的事件游标后订阅实时消息、状态、工具、审批和提问事件；断线后可从游标恢复或收到明确的重同步要求 |

会话摘要至少应提供稳定 `sessionId`、标题、更新时间、运行状态、是否空白、工作目录或工作区标识、是否有活动 Agent，以及必要的子会话来源信息。敏感路径和消息内容应按 Host 权限策略最小化返回。

能力名建议为 `sessions.list`、`sessions.search`、`sessions.create`、`sessions.directory.follow` 和 `sessions.events.replay`。错误至少区分 `unsupported_capability`、`permission_denied`、`not_found`、`invalid_cursor`、`cursor_expired`、`migration_required` 和 `runtime_unavailable`。

## Delta 接入规则

1. 在 Harness 提供上述公开传输前，Tauri handshake 不得声明这些 capability，renderer 不显示可执行的 Harness 全量会话操作。
2. 本机 Delta 历史仍单独显示并明确标注来源；不得把本机记录、缓存或已知 session ID 推断成 Harness 全量目录。
3. 获得官方接口后，先订阅目录变更，再读取带快照 revision 的列表；按 `sessionId` 关联事件，使用序号去重和排序，缺口时按公开游标补齐。
4. 恢复只对 Host 返回的稳定 session ID 调用；恢复失败时保留原记录和错误，不自动创建替代会话。
5. 搜索不可用时显示 Host 返回的原因，不回退到扫描 Harness 私有存储。

## 接入顺序

1. Harness 提供可版本化的会话目录、分页、搜索、显式创建、目录变更和历史事件重同步合同。
2. Tauri adapter 只接入 Harness 官方 SDK stdio 或受支持的 API-only transport，并将能力映射到 `DesktopHostPort`。
3. renderer 按握手 capability 显示完整 Harness 会话目录；本机 Delta 备份与 Harness 会话保持来源区分。
4. 通过真实 Harness 验证分页、搜索、创建、恢复、切换、事件重放和权限后，再开放对应 UI。

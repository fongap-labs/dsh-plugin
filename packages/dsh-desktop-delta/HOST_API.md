# Desktop Host API v1

## 状态

这是 Delta 前端与桌面 Host 之间的目标接口合同，不是对 Harness 当前全部能力的描述。`src/lib/desktop-host-contract.ts` 定义 renderer 使用的产品 DTO。当前 Tauri adapter 已通过用户指定的 Node.js 与 Harness CLI 启动官方 `sdk` profile，并接通文本和编码图片输入、消息／状态／工具事件、一次性工具审批、用户提问、会话恢复和工作目录切换；用户可选提供配置补丁路径，adapter 通过 Harness 官方 `--patch` 参数传递；其他接口仍未实现。

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

## 握手与版本

Host 在任何会话操作前执行握手，返回 `DesktopHostHandshake`：

- `protocolVersion`：主版本不一致时停止连接；次版本只允许增加可选字段和 capability。
- `runtime`：Harness 名称和版本，用于诊断；不得仅根据版本号推断功能。
- `capabilities`：当前运行时实际支持的功能集合，作为所有操作的准入依据。

UI 对每项操作先检查对应 capability。缺少能力返回 `unsupported_capability`，而不是改读 Harness 内部存储、调用私有 Host 服务或切换到原生 Web UI。

## 操作域

`DesktopHostPort` 是 UI 看到的稳定接口。实现可采用不同的内部命令名，但不得把 Harness 原始类型透传到 UI。

| 操作域 | 目标能力 | 约束 |
|---|---|---|
| 会话 | 列表、搜索、创建、恢复、提示、取消、事件订阅 | 游标分页；会话事件按 session 提供稳定 ID 和递增序号 |
| 审批与提问 | 回复工具审批、回答用户问题 | 取消与拒绝分开表达；任何断线或超时都不能隐式批准 |
| 工作区 | 列出、选择工作区，浏览相对路径文件 | 由 Tauri 权限控制；禁止把任意绝对路径交给 renderer 直接读取 |
| 设置 | 获取和更新设置 | 更新携带 revision；过期 revision 返回冲突，不能静默覆盖 |
| 模型与扩展 | 查询模型、插件、技能目录 | 修改技能等写操作必须单独协商 capability 与权限 |
| 终端 | 创建、输入、调整尺寸、关闭和订阅输出 | 终端进程由受支持的 Host 服务管理；Delta 不实现第二套工具运行器 |

## 事件和错误

会话事件包含 `eventId`、`sessionId`、每个会话单调递增的 `sequence`、`occurredAt`、类型与类型化 payload。重复事件可用 `eventId` 去重；序号间断时 UI 请求重新同步，不猜测丢失内容。

Host 将错误归一为 `DesktopHostError`：`protocol_mismatch`、`unsupported_capability`、`permission_denied`、`not_found`、`conflict`、`invalid_request`、`runtime_unavailable`、`timeout`、`cancelled`、`runtime_error`。错误可标记 `retryable`；重试必须由操作语义决定，不能假定请求超时代表 Harness 没有执行。

## 当前 SDK 覆盖与缺口

Harness 已公开的 [SDK client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/client/README.zh.md)、[协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.zh.md) 和 [SDK server](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/README.zh.md) 适合进程外提示、查询、会话恢复和等待、工作目录操作，以及审批／用户提问请求和事件通知。它依赖组合好的 Harness runtime profile；SDK server 不包含 Agent、持久化或工具内核。当前 Delta adapter 直接实现公开 stdio JSON-RPC 的已接通子集，没有把 `@deepseek-ai/dsh` 或依赖它的 SDK client 打入桌面包。Delta 的会话侧栏只记录本机由 Delta 创建的会话，不代表 Harness 的完整会话目录。

SDK 的会话事件通知会覆盖同一运行时中的所有会话。Delta 只处理本机记录里存在、且符合 Delta 会话 ID 格式的会话事件与审批／提问请求；未知会话事件不会加入历史记录，未知会话的审批会被拒绝，提问会被取消，以免外部会话等待 Delta 回答。

公开 SDK 尚未提供完整桌面需要的会话目录查询、单独取消会话、设置 CRUD、工作区与文件清单、插件／技能管理和终端控制，也未定义统一的桌面能力协商。SDK 没有单会话取消请求；关闭 SDK 运行进程会影响该进程承载的所有活动，因此 Delta 不提供单条对话的停止按钮。要补齐这些功能，Harness 需要扩展官方 SDK 或提供受支持的 Desktop Host API，并提供跳过原生 Web GUI 的启动 profile。Delta 不修改 `app.asar`、Harness 私有目录或全局用户设置来填补缺口。

## 接入顺序

1. Harness 发布可版本协商的公开 API 与无 Web GUI 启动 profile。
2. Tauri adapter 连接该公开接口并实现 `DesktopHostPort`；先接入会话和事件，再接入工作区、设置与其他 capability。
3. UI 按握手能力启用功能，并对不支持的能力显示明确状态。
4. 集成验证通过后，桌面 profile 才作为默认前端入口；Harness Web UI 仍可由维护者的诊断 profile 显式启动。

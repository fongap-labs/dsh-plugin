# Harness 终端控制接口提案

## 当前情况

Harness 已有公开的 `@deepseek-ai/dsh-api-terminal-controller` Remote API。Web profile 通过 API Gateway 提供按 Session 限定的终端环境与 Shell 查询、列表、创建、保留、附接、重命名和关闭。终端通过 Harness Subprocess Provider 建立，能够恢复屏幕、传送有序输入和尺寸变化，并清理所属进程。

当前官方 `sdk` profile 使用 stdio JSON-RPC，但没有挂载 Terminal Controller、API Gateway 或对应 SDK 协议方法。Delta 因而不能通过当前连接启动或管理 Harness 终端。Terminal Controller 的公开能力会以 Harness Host 用户权限运行，且独立于 Agent sandbox 与审批策略；它不能被当作普通聊天工具的安全沙箱操作。

Delta 目前没有终端页面，也不自行生成 PTY、启动 Shell、运行命令、读取终端输出或把终端输出发送给 Agent。桌面 Host 的目标 DTO 虽保留 `terminals.manage` 与 `terminals.events`，当前 Tauri adapter 不返回这些 capability，也没有终端命令。

## 所需的受支持传输

请通过 SDK stdio 暴露 Terminal Controller 现有语义，或提供不启动 Harness Web UI、具备明确本机访问边界的 API-only profile。新传输需复用 Harness Terminal Controller 与 Subprocess Provider，不能由 Delta 建第二套进程管理器。

1. 按已连接 Session 隔离终端；创建时使用 Harness 返回且已验证的 Shell 与工作目录。
2. 提供终端环境、可用 Shell 和受限运行参数；创建前向用户展示 Shell 与工作目录并明确启动。
3. 保留 `list`、`create`、`retain`、`attach`、`rename`、`close` 的类型化结果。每个终端 ID、Session ID 和附件代次须绑定，避免重连错误地创建或关闭别的终端。
4. 通过单一有序双工通道传输屏幕输出、输入、尺寸调整、确认、退出和错误；定义有界缓冲、慢客户端处理、UTF-8 边界和断线恢复语义。
5. 关闭时确认完整进程树清理；清理失败保留可重试状态，不伪报成功。窗口关闭和 Delta 退出时明确哪些终端保留、结束或由 Harness 回收。
6. 明确用户终端的权限：它以 Host 用户权限执行，不能继承聊天 Agent 的沙箱假设；每次创建需用户主动操作，后台任务不得静默启动。
7. 终端输出默认只显示在终端内；如未来允许发送到 Agent，必须由用户逐项选择内容。
8. 公布 `terminals.manage` 和 `terminals.events` capability，支持连接重置、事件顺序、资源上限、输入背压以及可识别的拒绝和重启结果。

在受支持传输到位前，Delta 不显示可操作的终端控件，不调用 Harness Web UI DOM 或私有服务，也不使用本地 Shell 作为替代实现。

## Harness 参考文档

- [Terminal Controller 中文说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/terminal-controller/README.zh.md)：Remote API、工作目录、Shell 发现、进程权限、双工传输及回收行为。
- [SDK stdio profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/package.json) 与 [SDK protocol](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)：当前 SDK profile 未挂载 Terminal Controller，也没有终端 RPC 方法。
- [Web Terminal Client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-terminal/README.md)：用户终端的会话、窗口恢复和关闭行为。

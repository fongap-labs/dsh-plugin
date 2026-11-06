# Delta Suite: P0 独立页面完整协议验证

这是**实验原型**，默认关闭。验证插件能否提供完全独立的网页并与现有 Harness Gateway 交互，不接管 `root` Slot、不运行 Tauri、不替换 Agent 或 Session 持久化。

## 运行方式（仅隔离测试 Profile）

在**测试用** Harness Profile 的 Delta Suite 条目中设置 `config.standalonePoc: true`；保留现有插件 id、inject 和业务配置。正式 Bundle 不启用这个开关。

1. 先通过 Harness 的正常启动 URL `/?token=...` 完成**官方** Cookie 交换。
2. 在相同 Host、协议、端口的浏览器打开 `/dsh-ui-delta/poc`。不要在 PoC URL 上携带 token。
3. 页面应先通过 `/dsh-ui-delta/poc/status` 同源认证，再接通 `/api/remote.mux` 的 `$events` Gateway 逻辑流，读取 `session/list`。
4. 点击“创建测试会话”，选择会话并手动发送普通测试消息，检查 `session/follow` 能收到 opening snapshot 和后续事件。重新加载页面时，地址中的 `?session=...` 应恢复同一会话。
5. 仅在受控的、无破坏性的工具测试中触发 `approval/request`，由页面明确点击“允许一次”或“拒绝”；请求中断时不自动决定。
6. 禁用插件后应删除测试页面路由，Harness 原生界面应正常可用。

**注意**：必须使用隔离的测试账户、测试会话及非敏感内容；发送消息将真实调用 Harness Agent，可能产生费用或触发工具执行。不要同时让原生 Harness 标签页与此实验页共同回答同一工具审批请求。测试权限不等同于允许真实敏感操作。

## 能力与边界

| 维度 | 本原型实现 | 判定限制 |
| --- | --- | --- |
| 页面与认证 | 官方 `connection.admit`，CSP nonce，独立 DOM | 需在真实 Harness 环境确认 |
| Gateway | 原生 HTTP RPC envelope 和官方 mux wire | 为诊断使用的**临时协议探针**，非正式客户端 SDK |
| 会话 | `session/list`、`session/create`、`session/prompt` | 需真实运行通过，禁止自动发送 |
| 流 | `session/follow` opening snapshot、增量事件、重新连接 | 仅显示有限事件类型和摘要；不是正式消息呈现器 |
| 审批 | `$events` 的 `approval/request`、`$events/result` 人工允许/拒绝 | 不自动批准；仅处理当前选中会话 |
| 用户提问 | 仅检测未支持的交互并提示 | **尚未提供回答 UI，不可宣称全功能闭环** |
| 构建卸载 | 路由与资源由 Cordis effect 生命周期管理 | 需要在 Harness 上验证卸载后无残留 |
| 生产 Adapter | 无 | 不能原样移植此探针到正式 Delta UI |

上述 wire 形状直接依据 Harness 官方 `packages/client/connection/src/client/rpc.ts`、
`packages/api/gateway/src/stream-protocol.ts`、
`packages/api/session-controller/src/types.ts`、
`packages/api/gateway/src/client/remote-events.ts`；
它们**并非承诺长期稳定的外部 JS SDK**，因此本原型不会直接成为生产实现。

## 验证与发布门禁

```sh
node --test tests/delta-standalone-poc.test.mjs
pnpm typecheck
pnpm test
```

单元测试包括 HTML/JS 静态语法、模拟 HTTP 授权、方法限制和路由回收。它们不替代真实 Host 集成测试。

必须由实际运行证据证明 Gateway 启动、创建会话、发送消息、事件流、审批、刷新恢复和卸载后复原均正常，才能把 P0 标成通过。P0 不通过时不允许跳过认证、读取私有数据库或直接接管 Harness 根 Slot。保留 Draft PR，未经正常 Action Worker 门禁不得合并或 Release。

## 生命周期回归（P0 加固）

探针每 5 秒通过原认证路由核查插件是否仍启用。验证页已经打开时停用 Suite，探针须自动关闭 Gateway WebSocket，禁用发消息和创建会话，且不能在停用后再次调用模型。

对于不属于当前测试会话、未实现的用户提问或无法处理的 Remote waterfall，探针发送 `kind: next` 将交互交回其他处理者，不自动批准。注意：多网页客户端仍可能同时收到事件；此 PoC 不能证明跨客户端独占审批。

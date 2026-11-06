# Delta Desktop: P0 独立页面完整协议验证

这是**实验原型**，默认关闭。验证插件能否提供完全独立的网页并与现有 Harness Gateway 交互，不接管 `root` Slot、不运行 Tauri、不替换 Agent 或 Session 持久化。

## 运行方式（仅隔离测试 Profile）

在**测试用** Harness Profile 的 Delta Desktop 条目中设置 `config.standalonePoc: true`；保留现有插件 id、inject 和业务配置。正式 Bundle 不启用这个开关。

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

## Real-Host acceptance runner (P0 verification)

The repository now includes a separate **read-only by default** runner, not just mock wire tests:

```sh
node scripts/verify-delta-poc-host.mjs --help
node scripts/verify-delta-poc-host.mjs --url http://127.0.0.1:3080 --cdp http://127.0.0.1:9222
```

Only run against a local, disposable Harness Profile with `standalonePoc: true`. The browser debugging port must be bound to loopback. Open the official Harness launch URL in **that browser context** to establish the signed Cookie first. The runner does not handle login tokens and rejects remote URLs, credentials, paths and query strings in its target URL.

The default mode verifies independently served document, Cookie admission, Gateway event-source readiness, and Session list RPC without changing sessions. The optional `--session TEST_SESSION_ID` verifies a **real `session/follow` opening snapshot and snapshot recovery after page refresh**. `--create-session` permits creating a disposable blank session, and sending a test message additionally requires `--allow-agent --send-text "..." --create-session`. That last operation executes a real Agent and may cost tokens; no automatic tool approval is ever sent.

`--output /private/report.json` writes a **new**, mode 0600, redacted pass/fail report (no cookie, auth token, text, URL or Session IDs). Output files are not uploaded to CI or committed. A failed or missing real-Host run is not a pass. Tool approval and the entire end-to-end process remain separate gates: human-approved, non-destructive interaction must be observed in a real Harness before declaring P0 successful.

**CI scope**: the centralized normal CI runs the runner's CLI safety/validation unit tests. It does **not** claim that a live Harness was launched or that the real-Host acceptance tests passed.

## One-command isolated Host (Release beta.1)

The current `dsh-desktop-delta-v0.1.0-beta.1` Release tag targets source commit
`87af8102e83b405113e5f162a418d83bb92742dd`, which already contains the
standalone PoC. This experimental page is **off by default**. Normal chat in
Delta Desktop does not prove its Remote Gateway contract.

For a disposable test environment, without touching the installed Desktop
profile or copying model/account credentials, run:

```powershell
node scripts/run-delta-poc-isolated.mjs --dry-run
node scripts/run-delta-poc-isolated.mjs --port 3081
```

Requires: the official `dsh` CLI on PATH and network access to the pinned
GitHub Release. The launcher creates a fresh temporary `DSH_HOME`, initializes
its private `delta-poc` profile from the official Web template, installs the
pinned `.tgz`, and enables `standalonePoc: true` only in that test profile.
It prints the official Harness launch output and runs on the specified local
port. Open the full launch URL supplied by Harness in your browser to establish
the official signed Cookie, then browse **on the same origin** to:

```text
http://127.0.0.1:3081/dsh-ui-delta/poc
```

This is a P0 acceptance page, not a production chat UI. First confirm the
status, event stream, and session list. If required, create an empty disposable
session and test its snapshot/reload. **No model credentials are migrated**;
a real prompt needs manually configured test-model credentials and explicitly
clicking Send. Approval must remain manual and is not automatically tested.

Ctrl+C stops the isolated Host and deletes its temporary data. For scripted
browser/CDP acceptance, run the existing
`scripts/verify-delta-poc-host.mjs` against this Host with a local CDP
browser already authenticated through the official launch URL.

The full P0 Go/No-Go remains **pending real Host evidence**. A successful
mock test, a published Release, or a running native Harness chat is not enough.

## 自动化真实 Host 验收（CI）

`tests/delta-poc-real-harness-ci.test.mjs` 在 GitHub Actions 的隔离临时目录安装固定版本的官方 Harness CLI，构建独立 Web Profile 并挂载当前编译的 Suite Host。它通过真实 HTTP 和 WebSocket 验证：未认证 401、官方 Cookie 签发、独立 HTML/status 页面、Session 列表/创建、Gateway 事件 ready、`session/follow` opening snapshot 和重新连接恢复。

仅当 CI/GitHub Actions 环境标志均存在时运行这组真实 Host 测试；本地普通单元测试保持跳过。测试不携带用户凭据，不发送模型请求，不操作真实工具，不读取现有 Harness Profile。任何真实 Host 失败都必须保留红叉，不能回退到模拟成功。

**仍未覆盖**：真实模型的增量文本输出、复杂工具审批与跨客户端竞争、用户提问交互、页面视觉验收、Host 运行中卸载/更新后的行为。它们不能因真实 Host 的基础连接测试通过而标记验收完成。

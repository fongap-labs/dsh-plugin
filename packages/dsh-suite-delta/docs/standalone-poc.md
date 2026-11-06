# Delta Suite: P0-A 独立网页/认证探针（实验版）

本探针用于判断 Delta 是否能够以 **单个 Harness 插件** 提供一个独立 HTML 文档，而不接管 Harness 的 `root` Slot 或运行独立的 Tauri 应用。默认禁用；不迁移、覆盖或清除现有 Suite UI、Session、Agent、配置与数据。

## 启用方式

仅在**隔离的本地测试 Profile** 内，将插件 `@fongap-labs/dsh-suite-delta` 的 Cordis 条目配置为：

```yaml
- id: dsh-suite-delta
  config:
    standalonePoc: true
```

具体应在测试 Profile 的后置 patch 中覆盖配置，保留原条目及其依赖，不要将这个配置写入生产的默认 Bundle。

1. 启动 Harness Web，**先使用 Harness 正常启动网址中的 token 打开根页面并完成 Cookie 交换**。不复制、存储或泄露 token。
2. 在**同一浏览器、同一协议、同一 Host 和端口**访问 `/dsh-ui-delta/poc`。
3. 页面自动检查 `/dsh-ui-delta/poc/status` 的授权访问，并尝试 `/api/remote.mux` 的 WebSocket 握手。
4. 停用插件、刷新探针页面：自有路由应消失，Harness 原生页面仍可使用。

注意：直接访问 `/dsh-ui-delta/poc?token=...` **不会**认证；官方只允许在 Harness 根路由交换启动 token。不要绕过签名 Cookie，也不要改变 Harness 的 Host/Origin 检查。

## 本阶段只验证 P0-A

| 检查点 | 解释 |
| --- | --- |
| 新的独立 HTML 文档 | 页面不是原生 AppFrame/Slot 树的覆盖层 |
| Cookie 和可信来源 | 直接调用官方 `ctx.connection.admit()`，不实现第二套认证 |
| HTTP 授权与 WebSocket 握手 | 测试同源会话能通过官方 HTTP 和升级入口 |
| 卸载清理 | 注册路由由 Cordis effect 管理 |
| 功能默认关闭 | 生产 Bundle 不启用 |

**不代表已经通过的检查**：独立加载 `ctx.remote`、完整客户端引导、Session RPC、消息流、工具审批、用户提问、断线恢复、刷新恢复。这些属于 **P0-B**，必须经过实际 Harness 测试后才能作出 Go/No-Go 决策。

特别注意：官方 `/api/remote.mux` 即使 WebSocket 握手成功，也**不等于**完成 Gateway 逻辑握手或建立 Remote RPC 会话；探针在握手后立即关闭，以免发送不符合官方协议的消息。

## 验证与停止规则

静态及模拟测试：`node --test tests/delta-standalone-poc.test.mjs`（需在仓库安装项目依赖）。

只有在 P0-A 页面鉴权正常、未经授权返回 401/403、停用路由及时卸载并且宿主页面不受影响后，才进入 P0-B。

P0-B 将重点调查能否通过受支持的方式独立装配官方 Connection + Gateway + Session 客户端服务，而非复制 `__DSH_BOOT__` 或调用内部私有模块。任何不支持的环节应明确判定，不通过削弱认证、重写 Session 存储或新建 Agent 运行时来规避。

# Harness 设置与凭据接口提案

## 当前情况

Harness 已有公开的 `@deepseek-ai/dsh-api-settings-controller` 与凭据 Controller。它们能提供脱敏设置描述、Schema 校验、带修订号的写入、冲突错误，以及只返回密钥配置状态的凭据接口。设置变化会通过 Remote 事件通知客户端。

这些公开能力目前走 API Gateway。官方 `sdk` profile 使用 stdio JSON-RPC，但没有挂载 API Gateway；SDK 协议也没有设置和凭据方法。Delta 不能在当前连接上调用这些 Remote API，也不应读取或修改 Harness 私有配置文件。

Provider 和模型是另一个范围：Delta 可把选择作为 SDK `initialize` 参数传入，Harness 会在启动时校验；这不会读取 Harness 当前设置，也不能修改已运行实例的模型。

## 所需的受支持传输

请通过 SDK stdio 暴露现有公开 Controller 语义，或提供不启动 SPA/Web UI、带明确本机访问边界的 API-only profile。客户端需要：

1. `settings.describe`：返回 schema、脱敏后的有效值、可写状态和 revision。
2. `settings.update` 与路径级 `settings.mutate`：复用 Harness 的验证和持久化；必须携带 `expectedRevision`，冲突时返回当前 revision，不静默覆盖。
3. `credentials.describe`、`credentials.set`、`credentials.unset`：只传引用和已设置状态；密钥不得出现在读取结果、错误详情或日志中。
4. 设置变更通知：至少携带 namespace 与新 revision；断线重连后客户端可重新读取。
5. 明确的 capability、协议版本和错误结果；缺少 provider 或设置只读时必须返回可识别错误。
6. 传输不得启动 Harness Web UI、开放未认证的远程监听端口，或要求客户端访问 Harness 私有文件。

## Delta 当前行为

在上述官方传输可用前，Delta 只展示不可用说明，不声明设置或凭据读写能力。连接路径、工作目录和 Provider/模型输入保存在 Delta 本机；Provider/模型只在重新启动 SDK 时传入。Delta 不缓存密钥，也不把本机对话数据库当作 Harness 设置存储。


## Harness 参考文档

- [Settings Controller 中文说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/settings-controller/README.zh.md)：描述脱敏读取、配置写入、修订冲突和凭据引用接口。
- [SDK stdio profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md) 与 [SDK profile 依赖](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/package.json)：当前 stdio 组合未挂载 Settings Controller。

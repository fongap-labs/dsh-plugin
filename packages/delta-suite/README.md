# Delta Suite

Delta Suite 是 Delta 与 DeepSeek Harness 共用的独立 Cordis 插件。它提供统一核心、可插拔 Provider、能力模块、组合管线、模型目录、外挂视觉证据和本地 API 路由。

## 架构边界

Delta Suite 使用“小内核、大框架”的组合方式：

- `Core` 只负责模块注册、生命周期、依赖排序、故障隔离、事件、能力注册、权限策略和运行状态；不包含服务商或具体能力的业务逻辑。
- `Provider` 只负责用户授权的模型服务连接、发现、元数据、请求适配和流式输出。Duck.ai、ChatGPT 适配端点和 Custom API 通过同一公开 OpenAI-compatible 合同接入。
- `Capability` 通过 `CapabilityModule` 注册，声明输入模态、匹配条件和转换结果；能力模块不依赖任何 Provider 的内部实现。
- `Pipeline` 按优先级组合已启用能力，再把变换后的请求交给目标 Provider；未来可增加文档、音频、视频能力而无需修改 Core 或现有 Provider。
- `behavior-enhancement` 是可关闭的行为增强模块，默认只增加模型指令遵循和证据边界提示，不接管宿主 Agent，也不建立第二套运行时。

运行状态可通过本地 API 的 `/delta-suite/v1/status` 查看，包含模块、能力、权限和 Provider 模型数量；状态只反映当前插件实例，不代表真实 Harness 或服务商验收。

## 当前实现

- `core`：模块生命周期、依赖检查、故障隔离、事件、模型注册表、能力注册表、统一权限和运行状态。
- `duckai`、`chatgpt`、`custom-api`：统一使用公开、用户配置的 OpenAI-compatible 端点；配置只保存 `credentialRef`，真实密钥由宿主凭据服务解析。
- `model-discovery`：读取服务商提供的 `/models` 元数据；能力无法验证时保持 `unknown`，不从模型名称猜测。
- `vision`：只有目标模型明确声明 `input.image === true` 时才保留原生图片请求；未知、未声明或声明为非图片输入时，默认尝试使用已验证的视觉模型生成结构化 JSON 证据。视觉模型不可用时返回明确错误。
- `api-service`：通过宿主公开的 `webServer` 服务注册 `/delta-suite/v1/models`、`/delta-suite/v1/status` 和 `/delta-suite/v1/chat/completions`。插件本身不打开额外监听端口，且拒绝未经宿主认证合同保护的外部暴露配置。

## 配置

插件 Bundle 默认不包含任何服务商配置，不会自动读取订阅文件、系统密钥链或宿主私有数据。

在 Harness 的原生设置中打开 **Delta Suite** 后，按页面提示完成三步：

1. 添加服务商，选择 Duck.ai、ChatGPT 适配端点或自定义 API。
2. 填写服务商提供的 API 地址和 API Key，点击“保存配置”。API Key 输入框是密码框；密钥只交给 Host 凭据服务，不写入插件配置。
3. 点击“测试连接 / 刷新模型”，确认模型数量后再开始使用。

首次使用通常不需要展开“高级设置”。只有服务商要求自定义认证头，或需要调整刷新、视觉备用模型、模型行为提示和本地 API 路径时才需要展开。默认行为增强可直接保留，不需要理解提示词或协议细节。

等价的 Profile 配置示例：

```yaml
providers:
  - id: my-api
    kind: custom-api
    endpoint: https://example.invalid/v1
    auth:
      mode: host-secret
      credentialRef: my-api-key
```

`duckai` 和 `chatgpt` 也必须由用户提供服务商公开允许的端点及宿主凭据引用；Delta Suite 不把会员订阅自动转换为 API 权益，不绕过登录、访问限制、额度或使用条款。

## 明确的首期边界

本包不实现私有登录流程、订阅账户扫描、DOM 注入、宿主源码 Patch、远程代理守护进程或未经授权的备用模型切换。ChatGPT 订阅适配器只有在用户配置了明确授权的公开适配端点后才会工作；真实订阅权益是否允许该端点接入由服务商和用户授权决定。

本地单元测试覆盖配置边界、动态模型发现、流式 SSE、视觉证据缓存、明确多模态原生门控、未知能力默认视觉桥接、能力组合管线、行为增强、运行状态、模块故障隔离和卸载清理。真实 Harness Profile、服务商账户及外部网络未在仓库测试中伪造为已验收。

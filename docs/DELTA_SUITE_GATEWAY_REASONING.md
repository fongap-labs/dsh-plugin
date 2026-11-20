# Delta Suite · Gateway Reasoning Effort 公开契约

本文件为 #280 的阶段性代码交付与集成边界，不是自动同步或完整验收报告。Delta Suite 始终是 Harness 插件，模型选择与请求调度仍由 Harness 官方服务负责。

## 已核实的上游公开接口

- DeepSeek Harness 的 `@deepseek-ai/dsh-client-ui-model-selection` 经 `ctx.modelDirectories` 维护每个会话的可选模型目录、持久选择、`reasoning.efforts/defaultEffort`，并通过 `session.selectModel` 写入。UI 提供原生 Effort 菜单；无能力声明时不显示选项。
  [官方包文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-model-selection/README.md)。
- 官方模型配置使用 `llm-pi-ai` 的 `providers.*.models[].reasoningEfforts`；官方 “Settings → Models” 管理这些声明。但 **`off` 是特例**：当前 `llm-pi-ai/src/adapter.ts` 的 `profileOptions` 把 `off` 转成省略 `reasoning` 选项。对默认 High 的 Gateway，这仍可能触发思考，不能把 `off: none` 当作已实现的 Host 关闭语义。[官方适配器源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/src/adapter.ts)。
  [官方提供商文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)。
- AI Gateway #493 在**已认证且按访问 Key 过滤的** `GET /v1/models` 模型项中声明
  `reasoningEfforts`、`reasoning_efforts`、`reasoning_policy`。
  `reasoning_policy.default=high, mode=best_effort` 表示默认目标 High，而非所有真实推理节点均支持 High。
  [网关 PR](https://github.com/fongap-labs/ai-gateway/pull/493)。

上述接口在上游源码中存在，不表示任何已安装的 Harness 版本均已包含它们。插件不读私有模型 Store、不修改打包 JS、不捕获 DOM 事件，也不重复注册原生 Effort 菜单。

## 本次实现

`packages/dsh-delta-suite/src/delta-suite-adapter/gateway-reasoning.ts` 提供三项纯函数：

- `decodeGatewayReasoningCatalog(value)`：仅解析调用方已经获取的 `/v1/models` 完整 JSON 结果。拒绝非列表、无等级、矛盾的驼峰/下划线能力声明、非法线路值与重复模型项。不会自行发送请求、读取 Key 或跨账户缓存。
- `toHarnessReasoningEfforts(model)`：生成可在当前官方 `llm-pi-ai` 模型配置中**明确审核后**采用的安全等级声明。仅输出 Gateway 已声明的 Low/Medium/High/Max；**始终省略 `off`**，因为当前 Host 适配器无法把这个选择转成 Gateway 可区分的显式关闭请求。它不凭空生成 High/Max，也不修改配置。
- `mapGatewayReasoningChoice(model, choice, protocol)`：验证 Default 与 Off 的不同线路语义，仅作为适配器的纯契约测试（不是请求拦截钩子）。
- `previewGatewayReasoningSync(authenticatedCatalog, hostProviderModels, modelId, selectedEffort)`：**只读、单模型** Effort 同步预览；从调用方已认证、当前访问 Key 范围内的完整 `/v1/models` 响应与官方 Host 当前模型列表计算 `added/removed/remapped`，不读取凭证、不联网、不写入设置。用户已选等级在新目录不支持时拒绝预览，选中 Off 时拒绝通过现有 Host 适配器保存；遇到重复 Host 模型、非法当前配置或不存在的模型同样拒绝，绝不自动回退为 Default。只返回推理等级字段，其他提供商配置及敏感字段不会进入结果。

`conversation.input.model.label` 继续由 Harness 声明和提供 Slot owner props。Delta 的模型标签仅以 tooltip 展示官方 catalog 中已公开的等级名称；未声明时不显示，不读取模型服务外的数据，模型选项、键盘事件和持久选择归 Harness。

## Default 与显式 Off

| 用户选择 | OpenAI 兼容请求意图 | Anthropic 请求意图 |
| --- | --- | --- |
| Default/Auto | 省略 `reasoning_effort`，Gateway 自行软默认 High | 省略 `thinking` |
| Off（仅明确支持） | `reasoning_effort: none` | `thinking: {type: disabled}` |
| Low/Medium/High/Max | 仅使用当前模型目录真实声明的 `reasoningEfforts` 线路值 | 不从列表猜测 Adaptive/Budget，保留原生适配器 |

这些只是**协议映射说明**；Delta 此阶段不劫持会话请求，也不会从浏览器向 Gateway 主动读取目录。尤其不能把 Off 写成空值，否则对于默认思考的模型会被 Gateway 解释成 Default。当前 Harness 的 `llm-pi-ai` **正好省略 Off 的底层字段**：因此这些表格中的显式 Off 只适用于真正支持显式写出该参数的未来 Host / 协议适配器，**不能通过现有 `reasoningEfforts.off` 配置获得**。缺少已验证的公开 Host 发送契约时必须隐藏/不提供该等级；保留 Default 和其他已验证等级。

## 通过已发布的 Harness 官方设置进行人工验证

针对 Gateway 返回且当前访问 Key 有权使用的具体模型，可在 Harness “Settings → Models” 自定义提供商模型选项中配置 `reasoningEfforts`。例如 Gateway 确实声明 `low, medium, high, max` 时：

```yaml
- id: llm-pi-ai
  config:
    providers:
      my-gateway:
        models:
          - id: Max
            reasoningEfforts:
              # 暂不声明 off: 当前 llm-pi-ai 会把 Off 序列化为省略字段
              low: low
              medium: medium
              high: high
              max: max
```

示例仅说明等级字段，需保留现有提供商的实际凭证、URL、协议以及其他模型设置；不要用该片段覆盖整个配置。只配置该访问 Key 返回的等级，未知真实节点并不保证执行效果。

## 同步预览的使用边界

同步预览仅接受官方配置已存在的 `providers.<route>.models` 数组中的**准确模型 ID**，不会添加路由、创建模型或触碰其他模型。其结果为 `blocked`、`unchanged` 或 `review`；`review` 只生成候选 `reasoningEfforts` 与增删、线路值变化清单，**并非一次已保存的变更**。调用者需要在正式的 Host 设置 API 授权、确认当前访问 Key 一致、重新读取原生配置并检查期间没有发生版本变化后，才能由用户明确确认应用；这一提交没有提供自动提交入口。

当会话当前选择是 Off、当前模型不在 Key 范围中，或原生已选 Low/Medium/High/Max 在更新后的目录被撤销时，返回拒绝而不是猜测备用等级，避免静默转成 Gateway 的默认 High。该预览也不代替 Host 官方的配置格式验证。若缺少 Host 目录则只返回阻塞状态，不影响原生聊天。

## 官方 Host 配置写入（需明确批准）

经上游源码确认：Harness 官方 Models 页面调用 `remote.settings.describe()` 读取已脱敏配置视图及 `revision`，并调用 `remote.settings.mutate(ns, ops, expectedRevision)` 执行路径级写入。Host 自身处理 Schema、持久化、并发冲突（`settings/conflict`）与成功后的配置回读。[源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/settings-controller/src/index.ts)。

新增 `applyApprovedGatewayReasoningSync` 公共集成接口，**只有显式 `approved: true` 才能执行**：需要调用者先通过可信 Host 授权渠道取得当前 Key 的模型目录、已读的原生配置 revision 与用户审阅的 preview；再由官方 `remote.settings.describe()` 二次读取，拒绝 revision 变更、读写权限不足、原生模型不唯一、credential *引用* 与审阅时不匹配、Effort 差异变化，以及不能原生可靠关闭的 Off。最终仅提交 `['providers', providerId, 'models', index, 'reasoningEfforts']` 一条 `set` 路径操作，同时携带 `expectedRevision`；验证 Host 回执中确认后的精确等级、模型与凭据引用，不因远端返回 HTTP 成功就直接报告已生效。遇到冲突或未知提交结果不会重试写入。

**目前这仍是一个供可信调用方接线的操作能力，而不是已上线的端到端自动同步界面。** Delta 不会自行获取密钥、请求 Gateway、从浏览器探测接口或未经用户确认触发写入。Host 脱敏视图中的 `apiKeyEnv` 仅是凭据引用，不能证明该引用的密钥是否在模型目录读取后被替换；因此真正的自动化路径仍需上游公开的、按 Credential 版本绑定的授权模型目录读取契约，并在用户批准前确认来源一致。未满足时不应暴露一键自动同步。不存在自动接管原生模型菜单、写入原生 Off 或修改请求参数的行为。

## 公开 Models 页面交互与 Credential 绑定（本次实现）

Host 侧通过 Cordis 正式注入的 `settings`、`credentials`、`llm` 和 `connection.fetch` 注册两个插件自有端点（旧 Host 缺少服务时不注册，原生模型界面保持正常）：

- `POST /api/delta-suite/gateway-effort/preview`：由 Harness 官方 Models 页的公开 `settings.models.footer` 扩展区域中的按钮**主动触发**；用户只需指定已安装 Provider 设置命名空间；Provider ID、模型 ID 和 Effort 从 Harness 公开的 `modelDirectories.directoryFor(activeSessionId)` 当前 Session 读取。目录仅在用户点击预览时加载，禁止用户手工伪造当前 Session 选择；模型不可路由、正在选择、缺失或 Off 无法安全映射均拒绝预览。用户预览及应用前还需再次核对会话选择以防误改。只接受 LLM 公开配置目录声明、且与已保存 Host 配置完全一致的 OpenAI-compatible Provider；只对用户已有的 HTTPS Gateway 地址请求 `{baseURL}/models`，不允许跳转、Loopback/IP、带凭据 URL 或超大响应（256 KiB）。只在 Host 内用 `credentials.resolve` 读取当前引用，`Authorization` 不进入浏览器、UI、日志或持久化文件。确认当前模型配置修订号、凭据摘要及地址在网络返回后未变化，返回对应的单模型 Effort 增删改预览。
- `POST /api/delta-suite/gateway-effort/apply`：只接受 UI 第二步勾选并点击确认后的一次性 48 位随机预览令牌，令牌保留在 Host 内存两分钟，消费后不可重放或失败重试。再次通过 Host Credential 解析和密钥摘要校验当前 Key 未被轮换，检查设置 revision，并通过此前已验证的 `applyApprovedGatewayReasoningSync` 执行单模型、单字段的正式 Host CAS 写入。任何失败保持原生 Settings 继续可用，不调用私有状态存储。插件卸载或官方 Host 服务重挂载时均撤销旧预览并中断进行中的请求；迟到的发现结果不能重新创建预览令牌，迟到的 Credential 验证不能继续写入。相同 Provider/模型的重复在途发现会被拒绝，全部模型同时最多运行两个发现请求（超过上限明确返回 429）；失败、取消和完成会释放对应名额。此处只限制用户发起的并行请求，不增加定时任务、重试或缓存。

**当前访问 Key 的边界**：Gateway 的模型响应仅供创建该 Key 的预览，完整响应不缓存；Host 只在内存保留该模型的已验证等级、带盐密钥摘要与短期预览。若同一 Credential 引用的秘密值在预览至应用期间变更，摘要不一致会拒绝应用。它并非 Host 的通用 Credential 版本 API，也无法消除真正并发的 Credential 源在最终重验之后、CAS 写入之前的极短窗口。原生模型选择器仍由 Harness 自己负责，UI 现在使用 Harness 的 Session 模型目录自动读取当前 Effort，保留原生选择和持久化权；若其状态变化，拒绝旧预览的应用。插件不擅自修改会话选择。

**边界和回退**：此流程不在启动时发网络请求，不轮询，不主动探测未知节点，不自动刷新或自动应用。仅面向已经显式配置了 HTTPS `baseURL`、Bearer 凭据引用及 OpenAI 兼容协议的 Provider；不提供自动初始化 Provider、离线 Local Gateway HTTP 支持或对私有 Host DOM 的接管。未经用户确认不存在配置写入。中央可信测试测试凭据轮换、过期/重复提交、SSRF 防护、Host CAS 及请求失败，不能替代 Windows Harness 实机验收。

## 尚未完成的 #280 条件

当前已支持用户主动触发的 Host Credential 范围内 Gateway 目录读取、二次预览以及明确确认后的官方 Settings 写入；**尚未**实现无需用户干预的自动目录同步、自动 Provider/模型创建、自动会话 Effort 修改或请求层显式 Off，也没有自己的模型选择下拉菜单。现有原生 `llm-pi-ai` Off 与 Gateway 默认 High 的语义不一致，必须等待正式 Host 线路能力后再启用。自动同步还需可供官方 Credential 修订号原子核查和当前 Session 已选等级核查的契约。

正式验收还需：授权 Key 范围隔离、模型目录变更、旧版本 Host 缺少服务、显式 Off 与 Default 实际发包差异、升级回退，以及 Windows Harness 实机启停与第三方插件共存。不可用时保留原生 UI 和 Gateway 的默认策略，不发探测请求。

# Delta Suite · Gateway Reasoning Effort 公开契约

本文件为 #280 的阶段性代码交付与集成边界，不是自动同步或完整验收报告。Delta Suite 始终是 Harness 插件，模型选择与请求调度仍由 Harness 官方服务负责。

## 已核实的上游公开接口

- DeepSeek Harness 的 `@deepseek-ai/dsh-client-ui-model-selection` 经 `ctx.modelDirectories` 维护每个会话的可选模型目录、持久选择、`reasoning.efforts/defaultEffort`，并通过 `session.selectModel` 写入。UI 提供原生 Effort 菜单；无能力声明时不显示选项。
  [官方包文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-model-selection/README.md)。
- 官方模型配置使用 `llm-pi-ai` 的 `providers.*.models[].reasoningEfforts`；键名为 Off/Low/Medium/High/Max 等级，值是发送到线路的具体参数值。官方 “Settings → Models” 是管理这些声明的合法设置入口。
  [官方提供商文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md)。
- AI Gateway #493 在**已认证且按访问 Key 过滤的** `GET /v1/models` 模型项中声明
  `reasoningEfforts`、`reasoning_efforts`、`reasoning_policy`。
  `reasoning_policy.default=high, mode=best_effort` 表示默认目标 High，而非所有真实推理节点均支持 High。
  [网关 PR](https://github.com/fongap-labs/ai-gateway/pull/493)。

上述接口在上游源码中存在，不表示任何已安装的 Harness 版本均已包含它们。插件不读私有模型 Store、不修改打包 JS、不捕获 DOM 事件，也不重复注册原生 Effort 菜单。

## 本次实现

`packages/dsh-delta-suite/src/delta-suite-adapter/gateway-reasoning.ts` 提供三项纯函数：

- `decodeGatewayReasoningCatalog(value)`：仅解析调用方已经获取的 `/v1/models` 完整 JSON 结果。拒绝非列表、无等级、矛盾的驼峰/下划线能力声明、非法线路值与重复模型项。不会自行发送请求、读取 Key 或跨账户缓存。
- `toHarnessReasoningEfforts(model)`：生成可在官方模型配置中**明确审核后**采用的等级声明。仅输出 Gateway 已声明的 Low/Medium/High/Max。经过明确的 Gateway `best_effort` High 策略认证时，附加 `off: none`；不凭空生成 High 或 Max。
- `mapGatewayReasoningChoice(model, choice, protocol)`：验证 Default 与 Off 的不同线路语义，仅作为适配器的纯契约测试（不是请求拦截钩子）。

`conversation.input.model.label` 继续由 Harness 声明和提供 Slot owner props。Delta 的模型标签仅以 tooltip 展示官方 catalog 中已公开的等级名称；未声明时不显示，不读取模型服务外的数据，模型选项、键盘事件和持久选择归 Harness。

## Default 与显式 Off

| 用户选择 | OpenAI 兼容请求意图 | Anthropic 请求意图 |
| --- | --- | --- |
| Default/Auto | 省略 `reasoning_effort`，Gateway 自行软默认 High | 省略 `thinking` |
| Off（仅明确支持） | `reasoning_effort: none` | `thinking: {type: disabled}` |
| Low/Medium/High/Max | 仅使用当前模型目录真实声明的 `reasoningEfforts` 线路值 | 不从列表猜测 Adaptive/Budget，保留原生适配器 |

这些只是**协议映射说明**；Delta 此阶段不劫持会话请求，也不会从浏览器向 Gateway 主动读取目录。尤其不能把 Off 写成空值，否则对于默认思考的模型会被 Gateway 解释成 Default。

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
              off: none
              low: low
              medium: medium
              high: high
              max: max
```

示例仅说明等级字段，需保留现有提供商的实际凭证、URL、协议以及其他模型设置；不要用该片段覆盖整个配置。只配置该访问 Key 返回的等级，未知真实节点并不保证执行效果。

## 尚未完成的 #280 条件

当前代码**不**自动把 Gateway 发现的目录同步到 Harness 提供商配置，**不**实现自己的模型下拉菜单，**不**自动更改 Session 的 `reasoningEffort`，**不**调用未声明的 Host 扩展 API。真正的自动同步需要上游公开的、授权的 Gateway 模型读取 / 官方提供商元数据更新契约及正式版本兼容检查；支持后才可增加确定性的重放和迁移测试。

正式验收还需：授权 Key 范围隔离、模型目录变更、旧版本 Host 缺少服务、显式 Off 与 Default 实际发包差异、升级回退，以及 Windows Harness 实机启停与第三方插件共存。不可用时保留原生 UI 和 Gateway 的默认策略，不发探测请求。

# Delta UI 宿主兼容性与迁移

新的插件身份为 `@fongap-labs/dsh-delta-desktop`，历史 `@fongap-labs/dsh-theme-delta` 的发布记录和错误日志不修改。首次安装新包前先停用旧插件，确保不会重复覆盖主题或重复注册 `settings.section`；禁止在没有实际宿主验证前声称可自动迁移。


公开源码与 API 文档仅作接口阅读参考，不是安装要求、运行时版本门槛或后续构建的兼容承诺。插件按可用接口和对象形态运行时检测。

| 能力 | 证据（DeepSeek Harness 相对路径） | 作用及必要性 | 缺失时 | 已验证 |
| --- | --- | --- | --- | --- |
| `__ModuleLoader__.load({id,factory})` | `packages/client/modules/src/client/manifest.ts` | 惰性客户端注册，必需 | 插件无法启动 | 单文件静态检查与模拟 |
| `ctx.theme.overrideTokens(source,tokens)` | `packages/client/ui-theme/src/client/index.ts` | 插件配色，返回拥有者 disposer | 官方色保留/出错提示 | 模拟 |
| `ctx.slots.inject/register` | `packages/client/ui-slots/README.md` | 安全等待插槽声明，自动释放贡献 | 对应控件不挂载 | 模拟 |
| `plugins.add.actions` + `MenuItemButton` | `packages/client/ui-plugin-manager/README.md`、`packages/client/ui-agent-preset/src/client/CreatePluginMenuItem.tsx` | 在插件管理“添加插件”菜单中放置 MCP 服务器入口 | 不显示入口 | 模拟 |
| `configForms.get('mcp-manager')`（兼容 `mcp`）+ `remote.mcpManager` | `packages/bundle/web-app/cordis.patch.yml`、`packages/client/ui-settings/README.md`、`packages/mcp/mcp-manager/README.md` | Revision fenced MCP 配置写入、状态订阅、探测与重启 | 提示 Host 未提供相应能力 | 模拟 |
| `settings.section` | `packages/client/ui-settings/src/client/contract/slots.ts` | 独立设置栏目，停用后自动移除 | 设置入口不出现 | 模拟 |
| `ctx.inject(['theme'])` | `packages/client/ui-theme/src/client/index.ts` | 主题提供者延迟就绪 | 独立设置仍显示，配色提示不可用 | 模拟 |
| `ctx.layout.toggleSidebar/selectPanel` | `packages/client/ui-layout/src/client/service.ts` | 调用官方导航/侧栏动作 | 仅该动作错误提示 | 模拟 |
| `root` 单占用与子插槽声明 | `packages/client/ui-layout/src/client/index.ts` | 完整原生布局替换的关键约束 | 不替换根布局 | 源码核实 |
| 桌面安全区 | `packages/client/ui-layout/README.md` | 尊重官方窗口边界 | 保留官方窗口结构 | 真实桌面待验 |


## Windows 真实宿主启动故障（2026-11-09）

用户现场反馈：`@deepseek-ai/dsh-desktop 0.2.2-rc.1`、Windows x64、Electron `44.7.0`，启用 `@fongap-labs/dsh-theme-delta 0.1.0-beta.1` 后网页启动审计报 `web boot: 1 entry did not activate`，插件状态为 `failed`。安装操作记录显示安装和启用成功；这不是构建 CI 错误，也不能据此断言具体失败服务。日志未包含插件内部异常栈。

修复策略：客户端父插件 `inject: []`，将 `slots/theme/layout` 改为 `ctx.inject` 子作用域等待；React 平台模块和 UI 挂载异常隔离并记录控制台错误，**不阻塞原生 UI 启动**。新增缺失服务/React 的启动单测。此策略基于公开 Cordis 的 `ctx.inject` 延迟注入能力；尚未通过上述 Windows 实机复测，不能宣称启动已修复。

实机复验顺序：先确认原生客户端可启动和聊天，再确认主题/设置/悬浮操作能挂载；故意停用 theme、断开可选服务与卸载后，原生界面应保持可用；若功能未出现，读取渲染进程控制台中的 `[dsh-theme-delta]` 错误，记录完整堆栈用于定位。不要直接修改 `app.asar` 或官方 UI 插件。

**尚未完成**：隔离 Profile 的安装/启用/停用/卸载及重启；主界面全布局替换与职责交接；真实会话发送/停止/流式展示；输入法与滚动；审批与设置；第三方 Fixture；两个不同宿主构建；Windows、macOS、Linux 桌面几何行为。没有使用私有 DOM 补丁，也没有对未经复现的缺陷叠加补丁。

开发边界：本插件只使用公开 Theme、Layout、Slots；不禁用 `ui-layout` 或其他无关条目，不执行 Profile 修改、模型请求或审批操作。宿主不提供事务性根布局热切换，因此本包不声称提供这种能力。

## 2026-11-09 原生个性设置接入与其余需求的界限

2026-11-09 的公开源码阅读记录：

- `ui-settings` 的公开 `settings.section` 声明和 `ui-settings-general` 的导航列表，允许 Delta Theme 注册 `delta.personalization`，从插件维护的 zh/en 字典读取标签、页面标题与无障碍文案；插槽注册随插件生命周期释放。
- `ui-sidebar/SidebarRoot.tsx` 的品牌行本身兼作新建会话按钮；两个公开的 `sidebar.brand.*` 插槽仅替换其内部图标和名称，不能安全地嵌入可交互搜索框或重排宿主的按钮。因此未采用 `dsh-claude-style` 的 Host DOM 选择器接管方案。
- `ui-workspace` 的默认展开和删除动作是其自有视图存储与 Host WorkspaceController 命令；缺少独立的公开“删除前置检查”注册接口。对默认工作区的保护必须发生在 Host 业务边界，不能通过 CSS 禁用按钮。
- `ui-chat/RunningStatus.tsx` 与 `ui-conversation` 的状态及预览文案属于宿主翻译字典；没有公开的单项覆盖插槽，不覆盖其他插件拥有的 locale 命名空间。
- 仅完成设置栏目和真实主题切换；上述侧栏、会话和工作区重构均为**未完成**，真实 Windows Harness `0.2.2-rc.1` 安装与启停仍待复验。

## 2026-11-09 兼容适配实现

- Delta Sidebar Compatibility 通过仅在 `data-sidebar-scrollport`、`data-sidebar-workspace-header` 和原生导航均存在时启用可撤销适配；未匹配时恢复宿主导航，不触碰 `app.asar`。
- 搜索使用原生 React 输入的值设置器与 input 事件，开始对话通过官方按钮触发；新添加的节点只归插件所有，在停用时全部释放。
- 对从未持久化折叠偏好的工作区触发一次宿主展开状态切换，保留用户后续手动设置。
- 宿主 WorkspaceRegistry 删除方法在插件启用期间验证默认工作区是否为空且有其他工作区，停用时恢复原方法。客户端再进行一次防误触拦截。
- Delta 样式仅在相关根节点标记存在时覆盖会话列表、导航和悬浮卡，官方数据、会话状态和消息流仍由宿主管理。

本节为源码实现记录，不代表真实 Windows 桌面验收已经通过。适配依赖上述源码基线，后续 Harness DOM 改动必须重新验证。


## 2026-11-09 可替换宿主能力契约（PR #197）

长期能力边界以 `src/host-capabilities.ts` 中的 `DELTA_HOST_CONTRACT_VERSION` 与明确声明的能力名称为准，不按固定 DSH 版本号开启功能，也不依赖 DOM 选择器或私有 Store。通常只使用正式插槽与服务；视觉桥准入适配是下面记录的一个范围受限例外，不作为其他能力的兼容依据。

- 契约 v1 采用显式 `contractVersion` + `capabilities[]`；协商返回 `compatible`、`available`、`missing`、`reason`。
- 未提供 manifest / 契约版本不符 / 缺少必需能力均拒绝启用对应集成，不能当作功能通过。
- `theme.tokens`、`settings.section`、`sidebar.brand` 可以继续通过 DSH 现有公开插槽走独立扩展，不能据此推断 `sidebar.compose` 等更深层能力已实现。
- `workspace.before-delete` 必须由宿主在业务操作边界提供正式钩子；此前客户端与宿主两处 `delete` 方法替换逻辑均已撤销。能力尚不可用时，不声称默认工作区删除保护已实现。
- `conversation.transport` / `conversation.stream` / `conversation.stop` / `approval.request` 必须通过真实宿主会话集成测试验证，不能使用 UI 主题启用结果替代。
- 旧 DOM 模拟测试已退役；保留负向回归，防止重新绑定 `data-sidebar-scrollport` 等非稳定结构。
- 本次交付仅包含稳定边界与发布阻断，不包含受限 Host UI 功能；发布状态以 `feature-readiness.json` 和真实 Windows 验收共同决定。

下一阶段：DSH Adapter 通过宿主正式插件 API 建立可探测的能力清单，Delta Desktop 依据已协商能力逐项装配界面；任何宿主不支持的特性必须显式标记不可用并回退原生体验。

## 2026-11-11 视觉桥准入适配（运行时能力检测，不绑定版本）

Harness 的 `prompt` 入口在调用模型请求插件钩子前，通过 `ctx.llm.resolveModelInfo(provider, model)` 检查图片模态；如果当前文本模型没有声明 `image`，请求不会到达 `llm/stream`。公开实现位置可在 [Harness `api-proxy.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/apiproxy/src/api-proxy.ts) 与 [LLM 服务说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/README.md) 查阅。

Delta 在视觉桥配置有效时，运行时检查 `resolveModelInfo` 是否可调用，并暂时在该公开方法上安装可撤销的包装，让 Host 准入检查将请求交给 `llm/stream`。视觉桥生成描述后移除原图片，再发送文本请求；失败时返回错误结果，不调用文本路由，也不改变 Host 会话记录。插件卸载时仅当包装仍由 Delta 持有，才恢复原方法。已有模型路由要求其模型目录声明图片输入；自定义端点仅支持 OpenAI Chat Completions 兼容、Anthropic Messages 与 Ollama。

这不修改 Harness 源码、`app.asar` 或私有 DOM，也不检查或比较 Harness 版本号。它使用公开 API 上的临时适配，尚非 Harness 承诺的准入扩展点；运行时对象若不可扩展、方法不可写或 API 形状不符，Delta 会记录不可用并让 Host 保持原有拒绝行为。组件级单测覆盖包装、恢复和失败时阻止图像直达文本路由；目标桌面应用中的准入顺序、附件类型和完整消息生命周期仍须实机验收。

隐私设置通过 `configForms.get('dsh-delta-desktop')` 持久化；自定义密钥通过 Host `remote.credentials.set/unset` 写入 Harness Credentials，模型请求时由 Host 凭据服务解析。详情见 [Settings Controller](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/settings-controller/README.md) 与 [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials/README.md)。

## 2026-11-11 上下文与对话辅助扩展

`cordis.patch.yml` 在 Profile 层加入 Harness 官方 `@deepseek-ai/dsh-compaction-basic`，配置 `auto: true`。该后端使用公开的 `ctx.tokenMeter` / `ctx.compaction` 契约，并在 `agent/pre-step` 与上下文溢出恢复路径中执行结构化压缩；因此本实现不要求用户将主会话切换到 Delta Context Assistant 预设。这里的跨 Agent 覆盖范围是按 Harness Profile 级事件与 compaction backend 语义设计的，**尚待目标 Windows Desktop 构建实机验收**。

Harness 的压缩会把较早的模型上下文替换成一个带有固定 Markdown 章节的 checkpoint，同时保留最近对话；原始会话日志仍由 Harness 持久化。官方 checkpoint 结构包括 `Primary Request and Intent`、`Key Technical Concepts`、`Files and Code`、`Errors and Fixes`、`Pending Jobs`、`Current Work`、`Next Step`、`Critical Context`。任务完成情况、偏好、约束、决定和未决问题分别归入相应章节；Delta 的输入区和侧栏可展开查看最近 checkpoint。

主会话中现有的 compaction backend 若与 Profile 层后端同时工作，会对同一个 Harness 会话逐步检查；持久化 compaction lock 由 Host 后端持有。是否在目标 Desktop 版本中会按预期串行通过所有预设，需在实机长对话和上下文溢出恢复场景中确认。Delta 通过公开 session projection 读取最近的 `compaction/end` 结果；失败时在 composer 提示，后续成功会清除提示。Projection 注入、事件传播及压缩恢复仍需在目标 Windows Desktop 构建实机验收。

- 选中文字的引用提问复用 Harness 原生 `message-quotes` 插件；该插件未由 Delta 复制，测试机器需启用原生插件。
- 独立侧栏会话使用公开 `sessions`、`resources`、`sidebarRightTabs` 与 conversation 插槽；纠正主任务始终使用 `queue`，不使用 `steer` 或取消接口。
- 输入优化只在独立会话产生预览；主草稿变化后，应用或恢复操作都会拒绝覆盖新内容。
- 模型名称显示开关仅控制 composer 中的通用模型名称；不改变选择的模型路由。

新增单元测试和模拟 UI 测试验证插件 patch、队列模式、设置持久化、checkpoint 展示、压缩失败提示及草稿覆盖保护。它们**不能证明** Desktop 实际装载、事件传播和 compaction backend 在各预设下的生命周期行为；这些仍列在 `projects/dsh-delta-desktop/feature-readiness.json`。

## 2026-11-11 MCP 服务器管理入口

插件管理页通过公开 `plugins.add.actions` list slot 提供 **添加 MCP 服务器**，用 `order: -100` 排在插件管理器内置的第三方安装项之后、默认 order 为 0 的 Agent Creator 项之前。菜单项使用 Harness 的 `MenuItemButton` primitive；管理弹窗由 Host 提供的 React root 模块挂载。

配置按 Profile 中 MCP Manager 条目的实际 id 读取。Harness Desktop 当前使用 `mcp-manager`，MCP Manager 文档示例也可能将条目命名为 `mcp`；Delta 优先查找 `configForms.get('mcp-manager')`，再回退到 `mcp`。写入使用路径级 `mutate(ops, expectedRevision)`，每次只改一个 `servers.<name>` 节点，不整体替换服务器 map。状态通过 `remote.mcpManager.watch(signal)` 读取，探测与重启调用同一公开 manager API。无 manager、无配置表单或只读连接都会显示对应提示；这些能力未进入 Delta 的必需 Host 契约，其他插件功能仍可使用。

本地模拟测试覆盖入口顺序、服务缺失、stdio 配置写入、拒绝写入、实时连接状态、探测与重启。目标 Harness Desktop 的 MCP Manager 装载、桌面 UI 表现和真实进程/HTTP 连接仍需在 Windows 实机验收。

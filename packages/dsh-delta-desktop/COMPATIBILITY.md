# Delta UI 宿主兼容性与迁移

新的插件身份为 `@fongap-labs/dsh-delta-desktop`，历史 `@fongap-labs/dsh-theme-delta` 的发布记录和错误日志不修改。首次安装新包前先停用旧插件，确保不会重复覆盖主题或重复注册 `settings.section`；禁止在没有实际宿主验证前声称可自动迁移。


公开源码基线：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738`（2026-11-17 核查）。该提交只用于阅读公开 API，不等于已完成实际安装验证，也不代表全部宿主构建兼容；运行时不绑定此版本。

| 能力 | 证据（DeepSeek Harness 相对路径） | 作用及必要性 | 缺失时 | 已验证 |
| --- | --- | --- | --- | --- |
| `__ModuleLoader__.load({id,factory})` | `packages/client/modules/src/client/manifest.ts` | 惰性客户端注册，必需 | 插件无法启动 | 单文件静态检查与模拟 |
| `ctx.theme.overrideTokens(source,tokens)` | `packages/client/ui-theme/src/client/index.ts` | 插件配色，返回拥有者 disposer | 官方色保留/出错提示 | 模拟 |
| `ctx.slots.inject/register` | `packages/client/ui-slots/README.md` | 安全等待插槽声明，自动释放贡献 | 对应控件不挂载 | 模拟 |
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

经核对 `deepseek-ai/deepseek-harness@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`：

- `ui-settings` 的公开 `settings.section` 声明和 `ui-settings-general` 的导航列表，允许 Delta Theme 注册 `delta.personalization`，从插件维护的 zh/en 字典读取标签、页面标题与无障碍文案；插槽注册随插件生命周期释放。
- `ui-sidebar/SidebarRoot.tsx` 的品牌行本身兼作新建会话按钮；两个公开的 `sidebar.brand.*` 插槽仅替换其内部图标和名称，不能安全地嵌入可交互搜索框或重排宿主的按钮。因此未采用 `dsh-claude-style` 的 Host DOM 选择器接管方案。
- `ui-workspace` 的默认展开和删除动作是其自有视图存储与 Host WorkspaceController 命令；缺少独立的公开“删除前置检查”注册接口。对默认工作区的保护必须发生在 Host 业务边界，不能通过 CSS 禁用按钮。
- `ui-chat/RunningStatus.tsx` 与 `ui-conversation` 的状态及预览文案属于宿主翻译字典；没有公开的单项覆盖插槽，不覆盖其他插件拥有的 locale 命名空间。
- 仅完成设置栏目和真实主题切换；上述侧栏、会话和工作区重构均为**未完成**，真实 Windows Harness `0.2.2-rc.1` 安装与启停仍待复验。

## 2026-11-09 可替换宿主能力契约（PR #197）

长期能力边界以 `src/host-capabilities.ts` 中的 `DELTA_HOST_CONTRACT_VERSION` 与明确声明的能力名称为准，**不以固定 DSH 版本、DOM 选择器、私有 Store 或客户端 monkey-patch 为证据**。

- 契约 v1 采用显式 `contractVersion` + `capabilities[]`；协商返回 `compatible`、`available`、`missing`、`reason`。
- 未提供 manifest / 契约版本不符 / 缺少必需能力均拒绝启用对应集成，不能当作功能通过。
- `theme.tokens`、`settings.section`、`sidebar.brand` 可以继续通过 DSH 现有公开插槽走独立扩展，不能据此推断 `sidebar.compose` 等更深层能力已实现。
- `workspace.before-delete` 必须由宿主在业务操作边界提供正式钩子；此前客户端与宿主两处 `delete` 方法替换逻辑均已撤销。能力尚不可用时，不声称默认工作区删除保护已实现。
- `conversation.transport` / `conversation.stream` / `conversation.stop` / `approval.request` 必须通过真实宿主会话集成测试验证，不能使用 UI 主题启用结果替代。
- 旧 DOM 模拟测试已退役；保留负向回归，防止重新绑定 `data-sidebar-scrollport` 等非稳定结构。
- 本次交付仅包含稳定边界与发布阻断，不包含受限 Host UI 功能；发布状态以 `feature-readiness.json` 和真实 Windows 验收共同决定。

下一阶段：DSH Adapter 通过宿主正式插件 API 建立可探测的能力清单，Delta Desktop 依据已协商能力逐项装配界面；任何宿主不支持的特性必须显式标记不可用并回退原生体验。


## 2026-11-17 最新公开 API 核查

核查基线：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738`。以下结论只描述公开源码中的扩展边界，不代表任何本地安装构建已经通过实机验收。

| 需求 | 当前公开接口 | 结论 |
| --- | --- | --- |
| 品牌图标/名称 | `sidebar.brand.mark` / `sidebar.brand.name` | 可替换插槽内容，不可改写周边布局 |
| 新建会话行 | `sidebar.session.action` | HOC 装饰现有行，不支持移动行的位置 |
| 面板 More 菜单 | `sidebar.panellist.actions` | 仅渲染 More 菜单项，不是顶层导航重排接口 |
| 工作区/会话浏览区 | `sidebar.workspaces` | 单占用插槽；替换整个区域会接管浏览器，不等于可插入顶部搜索 |
| 会话悬浮卡 | `sidebar.session.row.hover` | 仅在时间与状态行之间增加装饰内容，不拥有完整卡片布局 |
| 工作区首次折叠 | 内部 `WorkspaceViewState.groupExpansion` | 没有公开初始化/默认值扩展契约 |
| 默认工作区删除保护 | WorkspaceController 删除动作 | 没有公开的 before-delete 业务钩子 |
| 运行状态文案 | `ChatFlow` 直接渲染内部 `RunningStatus` | 没有公开状态文案替换插槽 |

公开源码证据（均固定到上述核查提交）：

- [Sidebar slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-sidebar/src/client/contract/slots.ts) 与 [SidebarRoot layout](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-sidebar/src/client/SidebarRoot.tsx)。
- [Workspace slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-workspace/src/client/contract/slots.ts)、[WorkspaceBrowser](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.tsx) 与 [workspace view store](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-workspace/src/client/stores.ts)。
- [ChatFlow](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-chat/src/client/chat/ChatFlow.tsx) 直接渲染 [RunningStatus](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-chat/src/client/chat/RunningStatus.tsx)。

因此，侧栏顶部搜索与原生按钮重排、工作区默认折叠、删除前置保护、完整悬浮卡布局及 RunningStatus 文案替换仍然不可由当前公开插槽安全完成。不得通过 DOM 选择器、私有 CSS 类、内部 Store、React setter 或服务方法 monkey-patch 绕过限制。

`feature-readiness.json` 是当前交付状态唯一来源。上述能力继续保持 `false`；只有出现可探测、版本无关的公开能力契约并完成真实宿主验证后，才可改为已完成。

## 2026-11-18 Slot/Locale 私有接管移除（Delta Suite P0）

- 已删除 Client 运行时对原生 Slots `entries`/`entriesOfSlot` 的方法替换及 `_core`、`_host` 等私有对象访问。
- 已删除对 Cordis `cordis.original` 的反射解包、Locale 字典原位修改、`register`/`translate`/`installLocale` 方法替换；Delta 自己的字典和通过公开 Slots 注册的内容继续保留。
- 原生设置项与反馈入口不再被 Slot 查询拦截过滤；Harness Locale 的状态及导航翻译不再由 Delta 方法劫持。**注意：旧的 `installSidebarCompatibility` 仍包含基于 DOM 的状态文字修改**，这一行为尚未完成治理，因此不能承诺屏幕显示完全原生。
- 尚未移除的 `installSidebarCompatibility` 以及其他宿主 DOM 结构依赖仍是后续 P0 的专项审计对象；**不能**据此宣称所有 DOM 接管已经治理完毕。
- 此阶段未应用 Harness 源码 Patch，未修改安装身份、发布包名或独立运行时。

## 2026-11-18 原生运行状态文案保留（Issue #333 分阶段治理）

- 移除对 Harness 运行状态 DOM 文本节点的反复扫描和强制改写，原生运行文案保持官方所有权。
- 不再通过 MutationObserver 调用运行状态文本替换，避免在 React 管理的原生文本上重复写入。
- 其他侧栏 DOM 接管仍在 `installSidebarCompatibility`；未改变导航、搜索代理等既有行为，也未声称完成 Issue #333。ZIP3 校验保留并重新固定经审核的区域哈希。
- 本阶段没有内存或性能实机 A/B 数据，不能将减少扫描等同于量化性能提升。

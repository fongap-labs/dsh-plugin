# Delta UI 宿主兼容性与迁移

新的插件身份为 `@fongap-labs/delta-suite`，历史 `@fongap-labs/dsh-theme-delta` 的发布记录和错误日志不修改。首次安装新包前先停用旧插件，确保不会重复覆盖主题或重复注册 `settings.section`；禁止在没有实际宿主验证前声称可自动迁移。


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
- `workspace.before-delete` 必须由宿主在业务操作边界提供正式钩子。当前 `installWorkspaceMutationGuards` 仍对公开的 `workspaces.delete` / `unarchiveSession` 方法安装生命周期受管的兼容包装；这不是 Host 原生授权边界，也不满足默认工作区删除保护的公开契约。能力尚不可用时，不声称默认工作区删除保护已实现。
- `conversation.transport` / `conversation.stream` / `conversation.stop` / `approval.request` 必须通过真实宿主会话集成测试验证，不能使用 UI 主题启用结果替代。
- 旧 DOM 模拟测试已退役；保留负向回归，防止重新绑定 `data-sidebar-scrollport` 等非稳定结构。
- 本次交付仅包含稳定边界与发布阻断，不包含受限 Host UI 功能；发布状态以 `feature-readiness.json` 和真实 Windows 验收共同决定。

当前边界：能力名称与协商 helper 目前只是导出的契约定义；运行时没有 Host manifest provider/consumer 接线，因此尚未完成能力协商，也不能据此声称 `sidebar.compose`、`workspace.before-delete` 等能力可用。

下一阶段：DSH Adapter 通过宿主正式插件 API 建立可探测的能力清单，Delta Suite 依据已协商能力逐项装配界面；任何宿主不支持的特性必须显式标记不可用并回退原生体验。


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
- 原生设置项与反馈入口不再被 Slot 查询拦截过滤；Harness Locale 的状态及导航翻译不再由 Delta 方法劫持。**注意：`installSidebarCompatibility` 仍扫描原生 DOM，为锁定/已删除会话添加标记与徽章、隐藏受限命令和 sole-workspace 删除项，并折叠错误行**；这些行为尚未完成公开 API 迁移，不能承诺屏幕显示完全原生。
- 剩余 `installSidebarCompatibility` DOM 结构依赖、全页 MutationObserver，以及 `installWorkspaceMutationGuards` 的公开方法包装仍是后续 P0 专项审计对象；**不能**据此宣称所有 DOM 或方法接管已经治理完毕。
- 此阶段未应用 Harness 源码 Patch，未修改安装身份、发布包名或独立运行时。

## 2026-11-18 原生运行状态文案保留（Issue #333 分阶段治理）

- 移除对 Harness 运行状态 DOM 文本节点的反复扫描和强制改写，原生运行文案保持官方所有权。
- 不再通过 MutationObserver 调用运行状态文本替换，避免在 React 管理的原生文本上重复写入。
- 其他侧栏 DOM 接管仍在 `installSidebarCompatibility`；未改变导航、搜索代理等既有行为，也未声称完成 Issue #333。ZIP3 校验保留并重新固定经审核的区域哈希。
- 本阶段没有内存或性能实机 A/B 数据，不能将减少扫描等同于量化性能提升。

## 2026-11-18 Harness 页面标题原生所有权（Issue #333 第二阶段）

- 移除旧兼容层 `syncPageHeadings`、标题修改历史与撤销逻辑。原生“插件”“自动化任务”等页面标题不再由 Delta 根据私有 DOM 结构重命名。
- `syncSettingsNav`、`syncMenus`、侧栏搜索代理及布局逻辑仍存在；本阶段并未完成整个 DOM 兼容层治理。
- ZIP3 兼容区域保持审核哈希校验，本次同步更新经审核的哈希，不放宽发布门禁；后续仍需真实 Harness 验收。

## 2026-11-18 设置导航文案原生所有权（Issue #333 第三阶段）

- 已停止旧的 `syncSettingsNav` 对内置「账号与余额」「模型」等设置页标签及其无障碍文本直接重命名。
- `settings.section` 等官方 Slot 仅用于 Delta 自有设置项，不将其当作修改内建标签的接口。
- Agent 预设项的 `data-dtd-nav-tail` 布局标记、侧栏原生导航改名和 More 隐藏仍在遗留兼容层中，需后续单独处理。
- ZIP3 精确源码哈希与主题校验仍保持启用；尚未进行真实 Harness 的视觉与性能基准验收。

## 2026-11-18 侧栏原生导航标签治理（Issue #333 第四阶段）

- 已移除侧栏「插件」「自动化任务」的原生标签、aria-label 改写；同时删除无其他引用的 `setButtonLabel`、`replaceButtonText`、`mutatedNavButtons` 和卸载恢复逻辑。
- Harness 的原生导航文字由自身 Locale/UI 管理；Delta 仍使用公开 Slot 实现自身功能。
- **仍待治理**：对原生 More 的 CSS 隐藏、搜索输入代理、菜单 DOM 顺序和事件拦截等行为。此次只清理标签，不意味着全部侧栏行为已经恢复原生。
- ZIP3 审核哈希保留严格校验。CI 不能替代真实 Windows Harness 的交互验收或内存基线。

## 2026-11-18 原生 More 菜单恢复（Issue #333 第五阶段）

- 删除 `installSidebarCompatibility` 中对原生 More 按钮或父节点设置 `display:none!important` 的运行时操作，以及 `hiddenMoreElements` 缓存与停用恢复逻辑。
- 删除 ZIP3 主题里针对原生 More 导航条目的 `display:none/visibility:hidden` CSS 选择器。保留已有 More 弹出菜单的视觉样式、侧栏其他功能。
- `sidebar.panellist.actions` 仍只用于增加菜单项，不等于允许删除或重排宿主原生导航操作。
- ZIP3 客户端区域与主题内容的精确审核哈希均已同步更新；继续拒绝未经审核的改动。客户端样式可能改变原生 More 的实际排布，真实 Harness Windows 交互仍需验收。
- 侧栏搜索输入代理、菜单顺序修改和原生事件拦截仍需后续治理，Issue #333 不关闭。

## 2026-11-18 原生视图选项菜单顺序（Issue #333 第六阶段）

- 删除 `VIEW_OPTIONS_ORDERS`、`isViewMenu` 检测和“分组/排序/筛选”等原生视图选项菜单的 `order` 写入及 DOM 重排，使 Harness 维护自身菜单顺序与分隔符。
- **仍待治理**：会话、工作区菜单的排序与分隔符克隆、原生菜单标签改写，以及搜索代理、事件拦截。锁定/删除保护与反馈隐藏逻辑依然存在，不把本次视为完成全部风险治理。
- ZIP3 源码区域 SHA-1 保持校验，主题 CSS 不变；真实 Windows Harness 仍需验收。

## 2026-11-18 工作区菜单顺序原生化（Issue #333 第七阶段）

- 删除旧的 `WORKSPACE_MENU_ORDERS` 与工作区内建菜单条目的 `data-dtd-menu-order` / `order` 写入；不再克隆、隐藏或重排工作区菜单分隔符，保留 Harness 默认顺序。
- **保留锁定与删除保护**：重复锁定行清理、危险删除项标记、单工作区删除隐藏未改动。此处仍依赖宿主 DOM，后续需要迁移到正式命令/能力层权限校验。
- 会话菜单排序、分隔符治理、搜索输入代理、原生事件捕获尚未完成；Issue #333 继续开放。
- ZIP3 Client Region SHA-1 继续严格校验并更新至审核源码；主题 CSS 不变。真实 Windows Harness 交互仍待人工验收。

## 2026-11-18 会话菜单 Footer 区域顺序原生化（Issue #333 第八阶段）

- 删除 `isFooterContainer || isSessionFooter` 分支中通过 `getSessionMenuOrder` / `setMenuNodeOrder` 排序、克隆/隐藏分隔符和 `appendChild` 强制重排的逻辑。Harness 保留自身 Footer 菜单顺序及分隔符。
- **保留删除项危险态提示** `data-danger` / `dtd-menu-danger`，以及外部锁定、删除保护和原生事件处理逻辑；此处只修改视觉顺序，不增加或删除命令权限。
- 会话列表菜单排序、原生菜单文本改写、搜索代理和捕获阶段拦截仍待处理。ZIP3 发布哈希继续严格校验，真实 Windows 宿主交互仍需单独验收。

## 2026-11-18 会话列表菜单原生顺序（Issue #333 第九阶段）

- 移除 `SESSION_MENU_ORDERS`、`getSessionMenuOrder` 和原生会话右键菜单的节点排序、分隔符克隆/隐藏及恢复缓存，Harness 负责菜单顺序与分隔符。
- 同步清理已失效的 `data-dtd-menu-order` / `dtd-injected-sep` 主题 CSS，保留原生分隔符样式与删除操作危险态标记。
- **未完成**：原生“在文件夹显示”文案改写、反馈隐藏、捕获阶段事件拦截、搜索输入代理和能力层权限校验。真实 Windows Harness 验收及性能 A/B 仍需执行。
- ZIP3 客户端与主题双哈希继续严格校验；未放宽发版门禁。

## 2026-11-18 原生会话菜单操作名称保留（Issue #333 第十阶段）

- 移除旧侧栏兼容层对“在文件夹显示 / 在 Finder 显示 / Show in folder / Show in Finder”的 DOM 标签替换，不再把文件夹操作显示成“在应用中打开 / Open in app”。原生操作名称、可访问性文字及实际行为均归 Harness 管理。
- 仍保留会话菜单识别、删除项 `data-danger` / `dtd-menu-danger` 标记以及现有锁定相关防护；此项仅治理标签所有权，不能替代命令执行级权限校验。
- 原生反馈菜单隐藏、捕获阶段事件拦截和搜索输入代理仍待独立治理；Issue #333 保持开放。
- ZIP3 客户端源码 SHA-1 审核指纹已同步更新，主题 CSS 未改动；真实 Windows Harness 交互与性能 A/B 仍需验收。

## 2026-11-18 原生 Feedback 菜单入口原生化（Issue #333 第十一阶段）

- 移除 `syncMenus` 里对反馈标签的多语言匹配、DOM 隐藏、`hiddenFeedbackNodes` 缓存及卸载恢复代码，并移除主题 CSS 中的 `data-dtd-hidden-feedback` 规则；由 Harness 管理原生 Feedback 菜单入口。
- **保留** `/feedback` / `/export` 命令策略、日志与设置隐私、单工作区删除保护。此次仅治理菜单入口，不代表所有反馈命令路径恢复；相关策略后续单独审核。
- ZIP3 Client Region SHA-1 与主题 Git Blob SHA-1 均同步更新并继续严格校验。剩余账号/快捷键事件拦截和侧栏搜索代理待处理，Issue #333 继续开放。
- 真实 Windows Harness 交互和性能/内存 A/B 仍需验收。

## 2026-11-18 账号菜单点击事件所有权（Issue #333 第十二阶段）

- 停止在 Harness 原生账号/个人资料菜单触发器上添加捕获阶段 `click` 监听、`stopImmediatePropagation` 和 `preventDefault`，原生点击事件不再被旧 Delta 兼容层主动阻断。
- 删除已无读取场景的 `boundTriggers` WeakSet 和 `isSilentMenuAllowed` 绕过状态。保留用于 Delta 页脚按钮查找原生触发器的 `dtd-native-profile-trigger` 类标记。
- **未完成**：原生页脚仍有 CSS 隐藏与 `triggerAccountMenuAction` 程序化菜单选择逻辑，未在本阶段迁移至官方 API；本改动不等于完整恢复原生账号 UI。
- 全局快捷键、搜索代理和其他锁定/删除保护未修改。ZIP3 审核区域哈希保持严格固定。真实 Windows Harness 账号交互和内存/响应 A/B 待测。

## 2026-11-18 快捷键注册表写入治理（Issue #333 第十三阶段）

- 移除对宿主 `ShortcutsService.registry.dispatch` 和 `registry.invoke` 的运行时函数覆盖、`__deltaSearchHooked` 私有标记及恢复闭包；不再污染其他插件共享的宿主命令调度器。
- Delta 自有 Search Palette、输入框 Enter、可见快捷键目录、显式选择执行快捷键等路径保留。**旧 Ctrl/Cmd+K 的捕获阶段 `onGlobalKeyDown` 仍存在**，其与 Harness/Electron 原生命令调度的交互需要另一个 PR 和 Windows 实机验证，不宣称全部快捷键拦截已清理。
- 同步更新 ZIP3 Search Region 的精确 SHA-1 审核指纹，Sidebar Region 和主题 CSS 均未更改，不降低发布契约强度。
- 正式快捷键接管应优先采用 Host 公共注册接口；不存在明确支持时保持 Harness 原生。Issue #333 继续开放；真实宿主交互及性能 A/B 尚待验收。

## 2026-11-18 全局搜索快捷键原生化（Issue #333 第十四阶段）

- 移除 Delta 搜索适配器注册到 window/document 捕获阶段的 `onGlobalKeyDown`，不再截断全局 Ctrl/Cmd+K 事件或在 Delta 模式拦截全局 Escape。Harness 和其他插件可正常处理其原生命令。
- Delta 侧栏搜索输入框仍在按 Enter 时打开自身七标签 Search Palette；Palette 内 Esc 由 Delta 自有弹层的局部 `keydown` 监听处理，不在整个页面捕获。搜索菜单中的显式操作项不再伪装成 Ctrl/Cmd+K 快捷键，侧栏提示调整为 Enter。
- 官方 Host 未明确授权接管全局 `session.search` 之前，不再通过私有 dispatch 覆盖或捕获阶段键盘事件覆盖原生快捷键。已知行为变化：直接在窗口任意位置按 Ctrl/Cmd+K 将按 Harness 原生处理，不再直接打开 Delta Search Palette。
- ZIP3 Search Region SHA-1 精确审核指纹同步更新；Sidebar Region 和 CSS 原有审核哈希保持不变。账号菜单转发、搜索 UI DOM 代理和锁定/删除命令权限仍是后续任务，Issue #333 开放。实际 Windows Harness 交互与性能 A/B 尚待验收。

## 2026-11-18 账号菜单误触防护（Issue #333 第十五阶段）

- Delta 页脚设置/登录按钮查找原生账号菜单时，只匹配明确的「设置 / Settings」「登录 / Sign In」「退出登录 / Sign Out」操作；删除按第一个/最后一个菜单项猜测执行的回退。新打开的菜单只搜索本次新增节点，避免误点其他已打开的菜单。
- 找不到目标时结束静默等待、恢复原生菜单可见性，交由用户自行选择；不再自动关闭已打开的原生菜单或发送猜测性的设置快捷键。此处仅保证**无法确认时不误点**，尚未移除原生菜单 DOM 查询与 Delta 自建页脚。
- 同步固定 ZIP3 Sidebar Region 审核 SHA-1，Search Region 与主题 CSS 哈希不变。后续仍须通过公开 Slot/API 替换账号区 DOM 接管，并开展真实 Windows Harness 功能和性能 A/B 验收；Issue #333 继续开放。

## 2026-11-18 原生账号页脚完整归还（Issue #333 第十六阶段）

- 删除 Delta 在 `installSidebarCompatibility` 内复制头像、登录状态、设置、更新通知和登录/退出按钮的宿主 DOM 代理，不再读取账号节点或模拟宿主菜单项点击。
- 移除为静默代理菜单而隐藏宿主菜单的 CSS、定时轮询与宿主更新状态订阅，删除对原生页脚账号和操作按钮的宽高归零、透明化及禁止指针事件规则；Harness 负责显示、无障碍和交互。
- Delta 自有设置模块、主题、品牌及搜索等独立功能不变；旧页脚布局装饰随原生页脚恢复退出，本阶段不保证与旧界面像素一致。
- ZIP3 Sidebar Region、主题 CSS Git Blob SHA-1 保持固定并同步更新回归测试，Search Region 未改变。后续搜索 DOM 代理、其他捕获式交互和命令层权限边界继续单独治理；真实 Windows Harness 交互、性能及内存 A/B 尚待完成。

## 2026-11-18 搜索面板设置入口所有权治理（Issue #333 第十七阶段）

- 删除 Search Palette 的 `clickSettingsTrigger`，不再扫描任意宿主 `aria-label="Settings"`、中文同名按钮或旧 `.dtd-btn-settings` 选择器并执行程序化点击。此路径原本没有可验证的公开导航接口，存在误触其他插件同名按钮的风险。
- 在宿主未提供正式打开设置页 API 前，不再把无法可靠执行的设置 Quick Action 或 `settings.open` 目录项显示为 Delta 可执行命令；原生 Harness 设置按钮及快捷键仍由 Harness 负责。Delta 向正式 `settings.section` Slot 注册的个性化设置内容保持不变。
- 保留服务驱动的会话/工作区搜索和七标签面板，其余插件/任务导航及编辑器命令 DOM 代理仍列于 Issue #333 后续治理；同步更新 ZIP3 Search Region 严格 SHA-1，不修改 Sidebar Region 和主题 CSS。真实 Windows Harness UI 与性能 A/B 待验证。

## 2026-11-18 搜索面板插件与任务导航所有权（Issue #333 第十八阶段）

- 清除 `clickSidebarNavTarget`：不再根据宿主导航文字、私有侧栏 CSS 类或首个同名按钮执行程序化点击。没有经正式 API 声明的插件管理与定时任务跳转能力时，由 Harness 原生导航入口负责。
- 移除 Search Palette 的插件管理和定时任务 Quick Action。插件清单原先仅被渲染成指向插件管理页的通用假动作，无法导航到对应插件；为避免误导与误触，暂停向 Delta Search Palette 添加此类可执行插件行，等候正式宿主导航契约。七标签面板布局仍保留；其它搜索、命令和快捷键逻辑不在本次改动范围。
- 不改变公开 `settings.section`、主题、品牌及 Session/Workspace 搜索服务。ZIP3 Search Region 审核 SHA-1 同步更新，Sidebar Region 和主题 CSS 不变。后续独立治理右侧引导 DOM 点击、快捷键执行与编辑器注入；真实 Windows Harness 功能及性能 A/B 仍待验收。

## 2026-11-18 右侧快捷键指南原生所有权（Issue #333 第十九阶段）

- Search Palette 不再扫描 `[data-sidebar-right-guide-entry]` 节点、解析私有标题/按键 CSS 类或在执行时调用 `node.click()`。指南节点只用于 Harness 原生展示，不作为 Delta 的命令执行契约，避免改版或多插件环境中的误触。
- 保留 `shortcuts.catalog.getSnapshot()` 提供的快捷键目录、Delta 自有搜索/侧栏操作以及七标签结构。尚未明确授权的 `shortcuts.registry.invoke` 执行分支继续在 Issue #333 中治理，不将本次改动描述为完整快捷键 API 迁移。
- ZIP3 Search Region 严格 SHA-1 同步更新；Sidebar Region 和主题 CSS 不变。Windows Harness 交互、性能及长会话内存 A/B 仍待正式验收。

## 2026-11-18 快捷键注册表执行所有权（Issue #333 第二十阶段）

- 删除 Search Palette 通过 `shortcuts.registry.invoke(id, { region: 'page', modal: null, target: null })` 执行未知宿主命令的分支，不再伪造执行上下文或将快捷键目录条目视为授权执行能力。
- 只显示明确映射到现有 Delta 执行路径的 `session.search`、`session.new`、`sidebar.left.toggle`、`sidebar.right.toggle`；右侧侧栏控制接口不可用时也不显示对应目录动作。其他快捷键继续在 Harness 原生入口显示与执行。
- 修正左侧侧栏切换：安全入口存在时只调用一次，避免返回 `undefined` 时通过空值合并重复调用原生回退。继续保留 Delta 自有搜索、文件/浏览器快捷入口和七标签面板。
- 同步更新 ZIP3 Search Region 严格 SHA-1；Sidebar Region 与主题 CSS 不变。后续待验证编辑器 slash-command 注入权限与真实 Windows Harness 交互、内存、性能 A/B。

## 原生会话导航观察边界（Issue #333 后续阶段）

- 依据 Harness 固定公开源码 [SessionSummary.retainedBy / SessionListState](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/session-controller/src/client/sessions/service.ts#L29-L70) 及 [retention 发布路径](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/session-controller/src/client/sessions/service.ts#L590-L599)，使用只读 sessions.list 快照和订阅确认唯一 mainView 会话，不再替换 uiWorkspace.openSession。
- 导航请求、拒绝、重试本身不更新活动会话；缺失、重复、模糊及读取失败的 mainView 证据不猜测目标、不清除已有保护状态。订阅初始化读取且停用后迟到回调无效。保留原有 sidebar DOM 兼容层、PIN 锁定遮罩、删除/工作区投影等保护逻辑；这些尚未完成公共契约迁移，不把此改动称为完整会话锁定安全验收。
- 两个 ZIP3 审核源码区域、CSS、全局搜索行为均不变；实际 Windows 会话切换及锁定保护需要专项回归。

## 2026-11-18 斜杠命令编辑器注入权限治理（Issue #333 第二十一阶段）

- 删除 Search Palette 对 `[data-lexical-editor]`、`[contenteditable]` 和 `textarea` 的全局查询、焦点切换、原型 setter、`execCommand('insertText')` 及直接 `textContent` 写入；不再将私有编辑器 DOM 当作宿主输入 API。
- 内置命令、Host 远程命令和技能目录仍可检索，但选择条目改为通过标准 Clipboard API 复制命令，并清楚提示用户粘贴到 Harness 原生输入框；成功后返回当前对话并显示复制状态。Clipboard API 不可用或拒绝时明确报错，不伪造插入成功。
- Host capability contract v1 未新增 composer/editor 能力，因为当前没有经过核实的公开编辑器插入接口；Harness 原生输入、命令解析和执行权保持原样。七标签面板与远程目录读取保持。
- 同步更新中英文提示、客户端类型、ZIP3 Search Region 精确 SHA-1 和防回归测试；Sidebar Region、主题 CSS 不变。此改动只完成源码层权限收敛，Clipboard 权限与实际 Windows Harness 交互仍需实机验证。

## 2026-11-18 公开会话输入接口接入（Issue #333 第二十二阶段）

- 补充核查同一公开源码基线 `deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738`：[`contract/input.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-conversation/src/client/contract/input.ts#L259-L286) 声明会话级 `InputActions.captureInsertion()/insertText()`；[`contract/slots.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-conversation/src/client/contract/slots.ts#L316-L325) 声明 `conversation.input.left`，并通过 SessionStandardProps 提供 inputActions；[`apply.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/client/ui-conversation/src/client/apply.ts#L323-L338) 将其绑定到 Host Session generation。
- 新增显式会话级「指令」入口，复用七标签 Search Palette 并打开技能/指令分类。仅在唯一 mainView、普通已打开且未锁定会话、空白 plain 草稿、无附件/引用、prompt 权限和公开 composer block 状态均满足时捕获 Host 选区；执行前重新校验同一 Slot、Session generation、Host 服务、草稿版本、权限和 block；通过公开 `uiSession.whenAccess(sessionId, 'session/prompt', ...)` 追踪权限授权周期，即使 React 尚未重新渲染，撤销、重新授权或 Slot 卸载也使旧选择失效。调用 `insertText` 仅写入供用户审阅的草稿，不提交，不使用全局 editor DOM、不替换整份草稿。
- 无公开 Props/Service 时不挂载该入口；全局侧栏搜索维持显式复制。拒绝插入时提示用户，不自动改用剪贴板或导航。远程命令查询只使用明确绑定会话或唯一 mainView，不猜测列表第一项；命令名限制为单个安全斜杠 token，排除 export/feedback。每次打开/关闭清空目录并用独立序号丢弃迟到结果，避免跨会话复用旧动作。
- 不伪造 Delta Host capability manifest，不新增客户端进程、Harness 源码 Patch 或私有 Store 写入。公开源码与模拟测试不等于真实 Windows Harness 可用性验收；仍需确认实际安装版本的 Slot、撤销/恢复、并发及性能 A/B。ZIP3 Search Region 审核指纹更新；Sidebar Region 与主题 CSS 不变。

## Session catalog ownership and durable deletion (Issue #333)

- Remove the client-side `sessions.list` global method projection. Native Session snapshots, subscriptions and confirmed mainView observations remain Harness-owned. Delta's inline search, palette, navigation actions and assistant lookups check its own deleted-session state; existing sidebar DOM hiding and workspace projection are retained during this migration.
- A single or bulk delete must be confirmed by the existing Host endpoint and its returned durable tombstones. Unavailable, rejected or incomplete responses must not synthesize successful deletion, cancel locked sessions, or mutate a native Session catalog. Bulk sends only eligible IDs; partial acknowledgement is reported as partial. After confirmation, call the public `ISessions.refresh()` introduced in the reviewed [Host contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/session-controller/src/client/contract/sessions.ts). If refresh fails, retain the Delta-local tombstone filters.
- This is client ownership/acknowledgement hardening, not a new Host deletion API or evidence of complete physical erasure. Host-side deletion, workspace global projection/guards, lock enforcement and Windows stale catalog behavior remain separate acceptance tasks. ZIP3 Search Region review pin updated; Sidebar Region and theme CSS unchanged.

## Workspace native facts and transitional projection (Issue #333)

- Harness `IWorkspaces` at the reviewed [workspace-controller contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/workspace-controller/src/client/service.ts) exposes ordering within one workspace, not relocation between workspaces. The [entity contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/workspace/workspace/src/entity.ts) treats stored cwd and workspace path as immutable. Do not substitute ordering for relocation or remove the compatibility projection before a supported migration exists.
- Keep native snapshot reads distinct from transitional UI projections. Reconcile locks against actual archived IDs, coalesce in-flight client archive requests and avoid retrying after the service or lock has changed. Protected default-workspace deletion checks both native and projected membership. Move requires a valid native destination and an explicit durable mapping acknowledgement; unavailable or incomplete responses never fabricate a local move.
- Preserve unchanged snapshot and row identities; cache against membership inputs rather than unrelated feature revisions, and do not hide sessions because a projected relocation target is absent. Remaining shared list method wrappers and archive/delete method guards are intentionally not removed in this change. Both ZIP3 review regions and theme CSS are unchanged. Real Windows archive/move behavior and server-side relocation integrity remain separate acceptance tasks.

## Read-only workspace compatibility notification lifecycle (Issue #333)

- The temporary workspace projection still wraps the Host snapshot/subscription pair to preserve existing relocation and lock presentation. It no longer calls private `list.invalidate()` or `list.set()` or clones a native snapshot into the Host store to force a refresh. Local data changes notify only subscribers acquired through the compatibility adapter, and only when their projected snapshot identity changes. Existing native subscribers and native notifications are preserved.
- Snapshot/subscription installation is all-or-rollback on a writable service; disposal removes the local notification source, restores only exact adapter-owned functions, and informs compatibility subscribers of the restored view. Their underlying native subscriptions remain owned by their callers until caller cleanup. Late local notifications are inert. Equal Host membership payloads retain array/map identity across refreshes, avoiding unrelated projection invalidations.
- Both ZIP3 review regions and CSS are unchanged. The remaining method wrappers, cross-workspace relocation contract limitation and real Windows interaction/performance acceptance remain open; this is not a claim of complete native workspace ownership.

## Host-confirmed lock and archive restoration (Issue #333)

- Remove local preview success paths from lock setup, lock, temporary verification, permanent unlock and 2FA unbind. Unsupported transport or incomplete Host acknowledgements return failure and preserve current protections. Lock mutations require the complete public Host protection state, explicit success and matching target membership; verification additionally requires verified=true. Setup must return a real Host token and secret.
- Remove cached raw unarchive dispatcher. After verified durable unlock/unbind, apply confirmed state first, await any outstanding client archive reconciliation, recheck the current service and lock/deletion state, then call the current public unarchive method only for a natively archived row. Unbind restores only previously locked IDs reported by Host. Client reconciliation never retries an archive refusal with stopActivity; the Host-side lock implementation and its own archive behavior are unchanged in this PR.
- The pinned Harness [IWorkspaces contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/workspace-controller/src/client/service.ts) exposes native mutations, not a public veto hook for delete/unarchive. Existing method guards remain transitional; removing them without equivalent enforcement would weaken protection. Both ZIP3 source-review regions and CSS remain unchanged. This client change is not a guarantee of Host-side isolation or real Windows acceptance.

## Host session operation serialization (Issue #333)

- Serialize Delta session lock/setup/verify/unbind, move and deletion requests across both registered transports, including initial and registry-availability reconciliation. This ensures a subsequent operation reads the previously committed Delta protection state rather than authorizing against a concurrent stale snapshot. The queue is local to this plugin instance, not a guarantee of cross-process or native Harness authorization. Queued requests fail after disposal.
- Refuse a second TOTP enrollment while TOTP or legacy PIN is configured; existing credentials must be explicitly verified and unbound before new enrollment. Clear outstanding enrollment tokens only after successful commit. Verification/unbind without credentials fails, as does verification of a target without a durable lock.
- Host archive reconciliation no longer escalates a refusal to stopActivity; archive/unarchive status reflects actual registry success and observed membership where available. Durable lock success is distinct from archive success. Unbind reports successful and pending restorations separately; the Client may retry only prior confirmed locked IDs. Persist state before publishing the new cache, so rejected writes cannot advertise uncommitted changes.
- Native registry operations outside these Delta routes, destructive relocation/deletion integrity, client refresh races, durable I/O recovery and real Windows acceptance remain open. Both ZIP3 regions and theme CSS unchanged.

## Native Host unarchive veto and protection-state read integrity (Issue #333)

- The pinned [WorkspaceRegistry public event contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/workspace/workspace/src/index.ts) explicitly dispatches `workspace/session-unarchiving` via an awaited parallel event before writing the archive set; a rejection retains archived membership. Register a lifecycle-owned listener that rejects direct Delta-locked Session IDs using the durable Host state, without replacing native methods. The listener must not await the Delta mutation queue: a verified unlock applies the confirmed state before invoking native unarchive and can itself be awaiting this event. Ordinary unarchive remains native-owned. Unavailable/invalid state rejects rather than authorizes; disposal detaches the listener. Older Host builds remain supported by the existing client guard; registration alone is not a negotiated runtime capability.
- Require observed native archived membership for archive/unarchive acknowledgements even if older registry methods resolve without a readable catalogue; preserve pending restoration semantics. Corrupt or unreadable state files no longer become an empty profile; only ENOENT is a first-run state, and read failures permit recovery. Preserve nested credential/vision objects during failed writes.
- This is direct-session archive protection, not full session-content access control. Native unarchive concurrent with a new lock, locked-workspace membership, native workspace deletion, actual supported Host version and lifecycle acceptance remain separate work. No new Harness source patch or process, no client code or ZIP3/CSS changes. Retain existing client safeguards until runtime acceptance establishes the Host event is active.

## Host workspace-member protection (Issue #333)

- Extend native unarchive veto and Delta Host move/delete/bulk-delete authorization to use the public [WorkspaceRegistry.list](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/workspace/workspace/src/index.ts) and [Workspace.sessionIds](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/workspace/workspace/src/types.ts) contracts. Protect the union of direct locks, native membership in a locked workspace, and confirmed Delta moved-session mappings; support the existing ID/path keys and raw/session-prefixed aliases used by artifact operations. Never use private record membership or caller cwd to authorize.
- When workspace locks exist, missing/malformed membership or an unresolved locked workspace rejects unknown destructive requests. Bulk classification completes before cancellation/purge. Moving into a locked target (ID or path) is denied; a mismatched destination path cannot redirect a known unlocked ID. A verified direct-session unlock does not unarchive a member still protected by a workspace lock. With no workspace locks, ordinary operations do not require an additional workspace scan.
- This protects the Delta Host routes and the documented native pre-unarchive event only. Native workspace registry deletion, native session content access, physical relocation integrity, native operations racing the Delta queue and real Windows acceptance remain separate tasks. Retain client guards pending actual Host event validation. No client ZIP3/CSS changes or additional Harness patch.

## Remaining native workspace mutation compatibility guard (Issue #333)

- Reviewed pinned [WorkspaceRegistry.delete/deleteKnown](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/workspace/workspace/src/index.ts#L608-L649): workspace deletion removes the registration while retaining session logs and directories. Unlike unarchive, that path exposes no awaited pre-delete veto event. Do not invent a Host hook or ship another Harness patch. Existing client method guards are still transitional, not a Host security boundary.
- Consolidate the existing two client mutation guards into one lifecycle-owned adapter, using the raw workspace snapshot and durable lock/move records rather than the projected list or temporary viewing grants. Reject direct-lock aliases, deleted-session unarchive, locked native/mapped workspace members and deletion of a workspace containing directly locked members. Retain sole/default-workspace rules. Unknown locked membership cannot authorize mutations. Preserve native method receivers and restore only exact adapter-owned methods; stale callbacks after teardown are rejected. Existing Host public unarchive veto stays active where supported.
- This does not intercept direct native registry deletion outside the client guard, certify actual installed Host event delivery or remove the workspace list compatibility projection. Both ZIP3 review regions and CSS remain unchanged. Windows interaction and performance remain acceptance gates.

## Delta Host search protection boundary (Issue #333)

- Harness [remoteAccess public contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/api/remote-access/README.md) explicitly exempts the owner principal and permits one policy per non-owner principal kind. Do not replace existing principal policies or claim a local owner content ACL. Session privacy remains presentation/application-level for the owner; no additional Harness patch is introduced.
- The Delta-owned full-text search endpoint loads durable protection state before searching and shares the Host session mutation policy's direct/native/moved workspace membership and aliases. Deleted IDs and unknown workspace membership are excluded. Check again after observation and just before serialization, suppress title/body hits when a lock changes in flight and evict protected cached corpus rows. Policy/read failure yields no results rather than a default empty protection state. This is specific to the Delta endpoint; native owner search, client fallback presentation, other native content methods and real Windows isolation/interaction remain separate work.

## Client Search Palette protection and result lifetime (Issue #333)

- Delta inline/palette search excludes locked/deleted session aliases and native/moved locked-workspace members, plus locked workspaces, before matching titles or rendering snippets. Use the raw workspace snapshot, not the synthetic projection, and confirmed protection payload readiness; missing/unknown protection returns no session/workspace results. Native fallback is only allowed when no lock/tombstone exists in confirmed state. Filter Host results again locally. Temporary viewing grants do not authorize search content.
- On protection changes, clear retained content, abort pending requests, invalidate old callbacks and stop result-reveal timers. Recheck live policy before navigation and reject workspace result activation when the target no longer exists or all known members remain protected. Observe public workspace list membership changes while workspace locks exist. No additional Harness patch, native owner ACL or independent client is implied. Host search endpoint protection is implemented separately in #364; actual installed Windows integration and broader native owner content isolation remain outside this PR.

## Delta assistant and hover content protection (Issue #333)

- Reuse the confirmed client search content policy introduced by #366 for assistant parent/child sessions, hover identity, optimizer actions and compaction excerpts. Temporary view grants do not authorize Delta context copying or queued prompts. Observe protection membership changes through a dedicated revision; old click callbacks and optimization workflows cannot become authorized again after unlock.
- Validate a discussion resource against its saved parent association or an optimization resource against the current workflow, reject mismatched main-session context, and revoke the retained assistant reference on protection revision, abort or plugin disposal. Recheck after create/retain/prompt awaits before later side effects. Already accepted native prompts cannot be recalled; this release does not cancel native work or claim an owner-level ACL. Existing native session APIs remain unchanged.
- Both ZIP3 reviewed regions and CSS unchanged; real installed Windows resource lifecycle, native content access and performance remain acceptance gates.

## Native workspace list ownership and Delta-scoped membership (Issue #333)

- The public workspaces.list.getSnapshot / subscribe methods are no longer wrapped or replaced. Native WorkspaceBrowser and third-party plugins observe the original Host workspace catalog. Delta-owned search and move selectors use a private projection of confirmed relocation/deletion/lock state without changing native subscriptions, even for frozen service objects. Unmount does not need to restore globally replaced list methods.
- With the pinned Harness public workspace contract, a Delta reassignment is not a physical Host workspace move. Until a supported relocation API exists, the native sidebar may continue showing the original workspace membership; the Delta-owned view can show its confirmed overlay. This is an intentional native-first fallback, not full native workspace ownership.
- Retain separately reviewed workspace delete/unarchive guards until equivalent Host authorization hooks exist. Native membership drives source cwd and protection checks; confirmed relocation mapping additionally protects destination membership. Both ZIP3 reviewed regions and CSS remain unchanged. Windows real-install functional and stability checks are still needed; A/B comparisons are excluded from acceptance.

## Durable Host acknowledgement required for workspace mutations (Issue #333)

- While the transitional workspace delete/unarchive guards remain, they fail closed until a complete and verified Host protection state is present. The default empty client lock arrays are never accepted as authorization. A later unreadable/partial refresh revokes readiness, preserving previously confirmed durable locks and tombstones rather than replacing them with empty membership.
- Session move, single delete and bulk delete must supply an entire confirmed Host lock state, not only the expected moved/deleted ID. Incomplete success-looking acknowledgements are rejected without applying a state change. Native method receivers and third-party method ownership remain unchanged.
- This narrows a startup/partial-response safety gap, not a claim that local wrappers enforce native Host deletion or content ACLs. The pinned public API still lacks a native pre-delete veto. Do not remove the remaining wrappers before a safe replacement and real Windows acceptance. No ZIP3 or CSS changes; no A/B tests.

## Recoverable Host confirmation for locked workspace mutations (Issue #333)

- An unavailable/invalid Host lock response revokes delete/unarchive authorization and clears the confirmed-sync flag, but **retains** prior durable membership and tombstones. After the existing guarded retry interval, normal Delta requests can re-read the Host state instead of staying indefinitely blocked by a stale 'already synced' flag. No optimistic lock removal is allowed.
- Proxy and vision status are optional, independently caught fetches; their transport errors must not invalidate an otherwise verified Host session protection response. A lock endpoint failure still fails closed regardless of other successful endpoint responses. Native list ownership and methods remain unchanged; no additional Harness patch, ZIP3 change, CSS change or A/B testing.

## Native unarchive tombstone veto (Issue #333)

- The public `workspace/session-unarchiving` Host event now rejects both durable lock membership and durable deleted-session tombstones (including `session-`/raw ID aliases). The Delta unbind/unlock restore path consumes the same decision, never invoking native unarchive for an already deleted session; the Delta-owned search endpoint consumes the same predicate to avoid mismatched policy decisions.
- Startup tombstone reconciliation still unpins and detaches native membership but **does not call native unarchive**. This matters on older Hosts that lack the public pre-unarchive event; repeated startup cleanup must not resurrect a deleted session. Explicit Delta deletion still performs its original cleanup before committing a new tombstone.
- A rejected event preserves native archive membership under the reviewed pinned Harness contract. This does **not** add a workspace pre-delete event, make client wrappers an owner ACL or guarantee interception on older Hosts lacking this public event. Retain the compatibility wrapper until a supported, verified safe replacement exists. No Host patch, standalone client, ZIP3/CSS change or A/B test. Linux/Windows CI and real Windows integration acceptance remain separate.

## Host mutation tombstone aliases (Issue #333)

- The Host lock enrollment/lock, session move, single delete and bulk delete endpoints reject an already deleted session regardless of whether callers supply the raw ID or `session-` prefixed alias. A mixed bulk request with any tombstone is rejected before cancel, purge or native registry detach; no ordinary row is partially deleted. The same alias definition remains authoritative for native unarchive veto and Delta search.
- Existing unrelated sessions still use the original Host paths. This is an application-level Delta Host route guard, **not** a native Harness content ACL or a pre-workspace-delete veto. It does not make legacy Host code or third-party direct registry methods subject to Delta authorization.
- No additional Harness patch, standalone application, DOM takeover, ZIP3/CSS modification or A/B comparison. Real Windows Harness enable/disable, upgrade, deletion, locking and long-session functional stability verification remains required.

## Native session-file ownership during logical moves (Issue #333)

- The Delta move endpoint records a durable Delta-scoped `movedSessions` overlay only. It no longer changes session log headers/cwd, reads or writes raw log generations, deletes original logs, or creates a replacement native session file. Without a public atomic relocation contract, such filesystem edits cannot guarantee correct native workspace membership and may damage running conversations.
- The native WorkspaceRegistry, persisted sessions, and third-party subscribers retain Host ownership. Delta's own selectors may show the mapped destination while the native sidebar continues to show its original membership. Existing protected-source/destination and durable tombstone authorization checks remain in force; failed state writes do not mutate native files.
- Any future physical migration requires a supported public Host relocation API and separate Windows end-to-end validation. This is not a claim of full native move support. No independent client, Host patch, DOM takeover, ZIP3/CSS edit or A/B performance comparison is introduced.

## Public native move-target validation (Issue #333)

- Before persisting a Delta-only `movedSessions` mapping, the Host move endpoint checks the destination against the public `WorkspaceRegistry.list()` snapshot regardless of whether any workspace is currently locked. Each public row must expose a unique non-empty ID, a non-empty native path and complete `sessionIds` membership; caller-provided path hints, when supplied, must agree with the native path.
- Unknown destination IDs, incomplete/duplicate catalogs, exceptions or changed registry service identity reject the request with `WORKSPACE_DESTINATION_UNAVAILABLE` (503), leaving existing durable mappings unchanged. Source locks, target locks, path protection and deletion tombstones continue to take precedence; an incomplete locked-workspace protection snapshot still fails closed.
- A successful move is **only a Delta grouping overlay**, never physical migration, native cwd mutation or ownership of Harness workspace members. The native Host and third-party plugins retain control. No Harness patch, standalone app, ZIP3/CSS modification or A/B tests. Windows installation and functional stability require separate validation.

## Durable tombstones before destructive Host deletion (Issue #333)

- The Delta Host single and bulk delete routes first verify durable protection and persist the deletion tombstone, mapping removal and applicable state changes **before** canceling native activity, removing files, or detaching native workspace records. On state-write failure, these routes return an error without initiating native destructive work.
- If the process is interrupted after a successful tombstone commit, startup reconciliation can replay best-effort artifact removal and native detachment without attempting unarchive. Batch tombstones are committed together for all eligible entries, excluding locked entries, before processing the first item.
- Normal deletion and startup reconciliation both skip native unarchive, including for older Hosts without a public pre-unarchive event. This protects against accidentally resurrecting deleted native sessions while detaching them.
- The native filesystem and third-party Host registries remain Host-owned and not an atomic cross-service transaction. Cleanup failures and unsupported paths remain subject to best-effort replay and real Windows functional verification; do not interpret a tombstone as proof that every artifact was physically removed. No native Host patch, standalone client, ZIP3/CSS modification, or A/B tests.

## Late Host workspace registry lifecycle and durable deletion replay (Issue #333)

- Startup may run before `workspaceRegistry` is available. When the public service is injected later, or a different service instance is remounted, Delta re-reads durable `deletedSessionIds` and replays native `unpinSession` / `detachSession` operations without calling `unarchiveSession` on tombstoned sessions. It then reconciles still-locked session archival.
- Queued callbacks check the currently active registry identity and plugin disposal before each replayed deleted ID. A stale unmounted service does not receive a newly queued replay. Durable tombstones survive reconciliation and continue to veto native unarchive and Delta search.
- File cleanup and persisted workspace JSON reconciliation are still handled by the startup pass; this change addresses **late native registry availability**, not atomic deletion, cross-plugin owner ACLs or a guaranteed native pre-delete hook. Actual late-load and disable/remount behavior requires Windows Harness integration verification. No Host patch, standalone client, ZIP3/CSS edit or A/B test.
- Startup deletion sweep checks plugin disposal after the awaited durable-state read and between subsequent file/registry operations. Shutdown cannot cancel an already-running individual file I/O, but it must prevent new cleanup stages from starting after disposal.

## Host route lifetime after plugin teardown (Issue #333)

- Both supported transports (`connection.fetch.register` and the legacy `webServer.register` fallback) now funnel read-only state requests and open-folder requests through the same serialized availability guard as Host mutations. A stale route handler invoked after Delta disposal returns `503 SESSION_OPS_UNAVAILABLE`; it must not access durable state or launch a file browser.
- If Harness delivers a delayed `workspaceRegistry`, `connection`, or `webServer` injection after plugin disposal, Delta ignores the callback rather than restoring stale references or registering routes. Unregistration is still attempted on normal teardown. Already-started state/Host I/O remains under the native Host's cancellation semantics; the guard prevents new operations after disposal, not cancellation of in-flight work.
- Regression coverage includes both transports and callbacks fired after unmount. This does not change native Harness route authorization, private owner content access, workspace pre-delete behavior, or Windows integration-test requirements. No Host patch, standalone application, ZIP3/CSS modification or A/B testing.

## Native session deletion and symlink containment (Issue #333)

- Candidate native log files and recursively removed session directories must pass both a lexical root containment check and a resolved `fs.realpath()` containment check against the trusted public SessionPersistence root. A syntactically in-root path whose symlinked parent resolves outside that root is rejected before deletion; missing/unresolvable candidates also fail closed. This applies to Host generation listings, locate hints and the fallback scan, without relying on caller-provided cwd as proof of ownership.
- A valid native project folder named with an initial `..` sequence (for example `..project`) is not treated as a parent traversal unless it is exactly `..` or begins with the actual OS parent-directory separator. This preserves normal in-root cleanup while refusing traversal.
- The checks mitigate symlink-redirected cleanup but are **not** an atomic filesystem transaction: symlinks can theoretically change between `realpath` and `rm`. Stronger race-free deletion requires Host-owned file handles/atomic APIs. The durable deletion tombstone and startup reconciliation remain authoritative even if physical cleanup is skipped. On Windows platforms without test symlink privileges, the test retains normal-root coverage; Linux CI exercises the symlink case.
- No Harness patch, owner ACL bypass, standalone desktop client, ZIP3/CSS edit, or A/B testing is introduced. Real Windows Harness integration still requires physical lifecycle and deletion validation.

## Project-cache deletion containment after session tombstones (Issue #333)

- Cache cleanup under `storages/session_projcache/sessions` resolves the real DSH profile root and each existing `sessionId.json` alias target before unlinking. A symlinked or junctioned parent that resolves outside that profile is not sufficient authorization to delete a cache file, even if the lexical path appears beneath `DSH_HOME`.
- Normal cache aliases whose resolved paths remain inside the active profile continue to be removed. Missing cache files and unresolved paths are skipped without undoing the durable deletion tombstone or blocking best-effort native session log cleanup.
- This closes another parent-directory symlink escape in the existing Host deletion flow. The operation is still not atomic with filesystem namespace changes between checking and removing; an atomic Host-owned cleanup facility would be needed to eliminate that TOCTOU boundary. Windows Harness end-to-end lifecycle and cache deletion behavior still require real installation validation.
- No Host patch, private service interception, standalone client, ZIP3/CSS modification or A/B comparison is introduced.

## Reserved session mapping keys and durable state normalization (Issue #333)

- Delta-only `movedSessions` is stored as a JSON dictionary and consumed by multiple callers. To avoid the legacy plain-object `__proto__` assignment setter and inherited-method shadowing, normalization now drops entries whose session ID is a reserved `Object.prototype` key (including `__proto__`, `constructor`, `toString`, `hasOwnProperty`), the reserved literal `prototype`, or an unsafe path segment. New logical move requests with these IDs fail with `400 INVALID_SESSION_ID` before any durable write or native operation.
- This specifically hardens the grouping map. Previously stored direct session locks and deletion tombstones are **not** silently discarded during state normalization, even if they reference such IDs; they continue to prevent unsafe resurrection. Normal session IDs and verified native workspace destinations remain unchanged.
- Regression tests verify old JSON state with own special-key properties, clean persistence after a subsequent update, preserved protection records and Host rejection of malformed move IDs. The grouping is a Delta-only overlay and does not change native Harness membership, file ownership or workspace permissions. No Host patch, standalone client, ZIP3/CSS change or A/B test; Windows Harness real installation and lifecycle acceptance remain pending.

## Delete request ID validation and batch failure boundaries (Issue #333)

- Single-session deletion now rejects nonempty session IDs that are not a safe literal Host filesystem segment (parent traversal markers, directory separators, or embedded NUL) with `400 INVALID_SESSION_ID` before persisting any deletion tombstone or performing native cleanup. The existing empty-ID response remains `400 MISSING_SESSION_ID`.
- Bulk deletion now validates **every** submitted `sessionIds` member before any state read or native side effect. A non-array payload, non-string entry, blank value, traversal component or embedded NUL rejects the **entire** request with `400 INVALID_SESSION_ID`. Invalid entries are not silently dropped while otherwise valid sessions get deleted.
- A valid empty `sessionIds: []` batch still succeeds with empty `deletedIds` / `skippedLockedIds` but no durable state rewrite or native cancellation/unpin. Nonempty valid batches retain existing all-at-once tombstone persistence, protected-member skip behavior and uncertain-membership fail-closed handling.
- Regression coverage exercises malformed single and mixed bulk requests with state writes deliberately failing, proving validation precedes persistence, plus a no-op batch under unavailable state writes. This does not change native Host identity APIs, private file ownership, plugin-only tombstones or Windows Harness real-device acceptance. No Host patch, standalone client, ZIP3/CSS change or A/B testing.

## Direct session lock aliases and native archive restoration (Issue #333)

- Delta's durable direct session lock now follows the same raw/`session-`-prefixed equivalence already enforced by the public Host unarchive veto, search exclusions and deletion tombstones. Locking a second spelling does not add another durable lock entry; TOTP/PIN verification and authenticated unlock accept an equivalent spelling and remove all equivalent persisted direct locks in one update.
- Native archive inspection uses the public `archivedSessionIds` list to recognize equivalent IDs. An unlock attempts native `unarchiveSession` for each **observed archived alias** and reports `unarchived: true` only when that active Host registry confirms none remain. If the archived membership list is unavailable, the operation cannot claim confirmation. A stale or replaced registry is not treated as successful.
- Verified direct unlock does **not** bypass a durable deletion tombstone, a still-locked workspace or unavailable native workspace protection: the existing fail-closed `readHostUnarchiveProtection` check remains authoritative before any native unarchive call. TOTP/PIN proof remains mandatory. Startup archive recovery keeps its durable protections.
- Regression tests exercise raw-to-prefixed verification and unlock, legacy duplicate alias cleanup, native multi-alias restoration, unrelated locked sessions, tombstones and workspace locks. This changes only Delta-hosted session lock handling through public Harness service methods, not physical session ownership, private Host registry maps, pre-delete veto or file movement. No Harness patch, standalone app, ZIP3/CSS modification or A/B testing; real Windows Harness lifecycle validation is still required.

## Delta logical move overlay alias consistency (Issue #333)

- A raw Host session ID and its `session-`-prefixed variant can refer to the same native session under the compatibility contract. Historical `movedSessions` state can contain both variants with conflicting destination workspaces. A new Delta logical move now removes previously stored equivalent aliases before recording the requested key, preventing stale parallel workspace groups.
- Single deletion and the eligible subset of bulk deletion also remove all equivalent `movedSessions` aliases in the same durable tombstone-first state update. Unrelated overlays and mappings for protected/skipped sessions remain untouched. The original deletion ID is retained in `deletedSessionIds` and continues to veto native unarchive and Delta search for its supported aliases.
- The alias comparison reuses the same `sessionAliases` equivalence already applied to session lock, search and deletion protection; no native session file relocation or Host ownership change is implied. Failure of the durable write continues to prevent native side effects.
- Compiled Host regressions cover re-moves across raw/prefixed IDs, single deletion, mixed bulk deletion with protected members and preservation of unrelated workspace mappings. No Harness patch, private registry interception, standalone client, ZIP3/CSS changes or A/B tests. Real Windows Harness lifecycle acceptance remains separate.

## Bulk delete alias deduplication and live-run cancellation (Issue #333)

- The public bulk-delete request can include both a raw session ID and its `session-`-prefixed spelling. Existing protection, tombstone, and logical-move operations already treat them as equivalent. The bulk-delete handler now validates every submitted ID first, retains the first requested spelling as the logical representative, and classifies/durably tombstones each equivalent session **only once**.
- The original set of unique requested spellings is preserved for active-session cancellation, because the public Sessions service may register a running task under either spelling. Physical artifact cleanup and native registry detachment execute once per logical session; native `unpinSession` / `detachSession` no longer repeat the same variant within a single detachment. A `cwds` hint on a later equivalent input remains available to the representative for safe, realpath-guarded artifact discovery.
- `deletedIds` / `skippedLockedIds` contain one representative per logical session, in original request order. A locked logical session, whether named raw or prefixed, is skipped entirely; valid empty batches still return a non-mutating success; invalid or tombstoned members continue to reject the complete request before any native side effect. Native ID alias equivalence reuses the same policy applied to Delta locks, search, and tombstone vetoes.
- Compiled Host regressions cover mixed locked batches, raw/prefixed and exact duplicate inputs, single durable tombstone per logical session, cancellation under each explicitly supplied spelling, preserved later-alias cwd hints, and no repeated physical/native cleanup. This does not introduce native owner ACLs, atomic file deletion, cross-workspace physical relocation, Host patches, a standalone client, ZIP3/CSS modifications, or A/B tests. Real Windows Harness end-to-end verification remains pending.

## Live-session cancellation fallback during tombstone-first deletion (Issue #333)

- The public `sessions.cancel(sessionId)` and `sessions.get(sessionId)?.cancel()` methods are independent, optional best-effort ways to stop a live Host run. A rejection from the first no longer prevents trying the second. A failed handle lookup or handle cancellation likewise cannot prevent later attempts or the durable tombstone's native detachment/cleanup.
- In a **single** deletion, the requested ID is passed to the service-level cancellation method, then the plugin inspects existing handles under each unique supported raw/`session-` alias. An alternate registered live session can therefore be stopped even when the caller supplied only one spelling. Delta does not manufacture a new native session or assume an absent handle exists.
- In a **bulk** deletion, the handler still invokes cancellation for each unique explicitly requested spelling before one physical cleanup per logical session (the #386 policy). Each cancellation call now isolates service and handle failures so a broken first member cannot suppress attempts for subsequent eligible members.
- All cancellation attempts occur **only after** the durable deleted-session tombstone has been committed. Failures do not imply cancellation succeeded; physical cleanup is still best-effort, and startup tombstone reconciliation remains the safety net. Native owner ACLs, workspace pre-delete hooks, atomic session migration and the real Windows Harness lifecycle test remain out of scope. No Host patches, standalone client, ZIP3/CSS change or A/B testing.

## Delta Suite product identity and state migration

- The embedded Harness plugin is named **Delta Suite** / **Delta 扩展套件**. Its source package, published npm scope/name, public Cordis entry ID, release key, asset names, scripts and tests are aligned to `delta-suite`. The existing package is not a standalone desktop client. Any Host components not replaced using public Slots remain native.
- This changes the Cordis identity, so an existing installation under the prior package ID is **not** transparently overridden. Disable the prior installation, back up the Profile, install/enable the Suite ID, then verify loading and safe rollback in the real Windows Harness. Never enable both installations in the same Profile.
- A new runtime state filename and `DELTA_SUITE_STATE_FILE` override replace the previous naming namespace. If **no explicit new override** is set and the new state file is missing, the Host store may read the previous Profile state file, validate it, atomically write the normalized state to the new location with private permissions, and only then publish it. Existing deleted-session tombstones, locks and 2FA keys are retained. An unreadable, corrupt or unpersistable previous state fails closed. The previous file is not deleted, making rollback possible; users must not discard it before acceptance.
- Client/Host request paths, theme owner IDs, storage keys, UI labels, build-time placeholders, lockfile entries and release validation now use the same product identity. A naming regression test searches repository paths and current source content for retired spellings during both `pnpm test` and `pnpm validate`. Historic display labels in immutable `CHANGELOG.md` entries are the sole documented exception required by central release governance; package IDs and paths remain prohibited everywhere. An unneeded archived ZIP carrying a prior package identity was removed from the current working tree; the approved ZIP3 design and scoped adapter implementations remain in source.
- Source and CI checks do not prove Windows Harness install/uninstall, startup, Session migration, Profile rollback, or long-session stability. They remain separate real-device acceptance requirements. No Harness patch, independent client, private UI interception, or A/B testing is introduced.

## 2026-11-19 模型 Effort 元数据接口前置条件（Issue #280）

- 当前公开 Harness API 没有稳定、版本无关且按当前 Gateway 凭据隔离的模型目录读取/更新能力，也没有第三方插件写入模型 `reasoningEfforts` / `reasoning_policy` 元数据的契约。`ModelSelectInjected` 的目录读取、加载和选择接口不能替代这项能力；不得从插件直接读取凭据或自行请求 Gateway `/v1/models`。
- 插件侧默认请求必须省略 reasoning 参数。用户显式选择 Off 必须保留独立状态，并使用对应协议认可的 `none` 或 `thinking.disabled` 表示；若 Host/协议没有有效编码，界面不能声称 Off 已生效。当前 Host 原生 Effort 编辑器的 `null` 会省略请求参数，不能据此确认显式 Off。
- 后续接入的前提是 Host 发布可探测的版本化 API，明确凭据作用域、模型身份、Effort 取值/编码、刷新与错误语义。实现后还须覆盖 Default、Off、已选值保持、元数据缺失回退及凭据隔离回归；此前相关 readiness 能力维持 `false`，Issue #280 保持开放。

## 2026-11-19 原生侧栏布局回退（Issue #333）

- 客户端不再设置 `data-delta-compat` 或兼容状态标记，因此旧 CSS 兼容布局没有运行时激活路径；不再扫描并重排原生 Settings 导航，也不再扫描无操作的会话/工作区菜单。Harness 保留原生侧栏布局、导航和菜单顺序。
- 删除 `data-dtd-nav-tail` 的主题规则。公开能力缺失时继续保留 Harness 原生 UI；sidebar 搜索位置/间距等能力仍为未交付，不改变 `feature-readiness.json` 的 `false` 状态。
- 为避免削弱现有保护，本次保留客户端锁定、墓碑、受限命令和 sole-workspace 菜单的 DOM 呈现/事件守卫，以及当前 Host 插件业务调用路径上的策略校验。它们均是过渡性插件路径，不构成 Host 原生授权边界；工作区删除前置钩子缺失时不能宣称已实现默认工作区保护。
- ZIP3 客户端区域和主题哈希继续精确校验。该源码回退不替代 Windows Harness 真实交互验收；Issue #333 保持开放。

## 2026-11-24：删除代理与视觉桥

按产品裁剪要求移除 Delta Suite 自带的网络代理设置和 Vision Bridge（包括 Host 路由、模型入参桥接、状态及配置）。不改变 Harness 自有图片/附件能力，保留模型路由限制与请求脱敏。该改动在 Delta Suite 的新构建中生效，不能替代 Windows 实机验收。

## 2026-11-24：隐私安全扩展边界审计（优先级 P0）

适用身份：仅 `@fongap-labs/delta-suite` Cordis 插件，不修改官方 Harness 源码或独立 Delta 桌面程序。官方源码核查基线：`deepseek-ai/deepseek-harness@4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。该 commit 用于 API 审计，不作运行时版本门槛。

- **Host 请求方向**：旧版 `connection/request` 只观察入站本地请求，不是外发遥测防火墙；过去错误阻止 `/api/messagefeedback`、`/api/sessionfeedback` 等路由，存在损坏本地评价的风险，现不再拦截该事件。
- **Session Log**：仅在官方 `sessionLogDeepSeek` 服务可用时注册 `registerExclusion(() => true)`。该契约在生成 `dsh_session_log` 字段前调用，清理由 Cordis 作用域托管；不能推广为阻止 Product Analytics、Session Telemetry、OTLP 或所有外发请求。异步回收触发后尚需真实 Host 实测。
- **Session Telemetry**：`session-telemetry/record` 是公开记录流水线，不是全部 OTLP 的关闭开关；不再通过异常伪装完整网络阻断。Product Analytics、Session Telemetry 的关闭配置由宿主或用户管理，不擅改其他插件权限和配置。
- **LLM**：官方 `llm/stream` 的 `next()` 不接受替换后的请求，Agent 构造的请求冻结；旧版 `llm.stream(masked)` 会发起另一次请求，不能当作透明请求中间件。已停止安装该 Hook，删除对 `listModels` 和 `resolveModelInfo` 的方法替换。模型发送前脱敏、DeepSeek 模型禁用均为**未启用**，无任何已交付声明。
- **认证/定位**：不再修改 `res.writeHead`、`webServer.server`、`navigator.geolocation` 或 `navigator.permissions.query`；原生认证和权限提示由 Harness 自身控制。旧的 Cookie 剪枝策略不能作为运行时防护，纯字符串辅助函数保留但不挂载。
- **UI 限制**：浏览器全局 DOM 安全扫描的遗留 `installSidebarCompatibility` 不再由插件入口安装。原生菜单、会话、权限恢复到宿主路径；该文件中的兼容函数暂留为不可达代码供独立治理，**不代表锁定/删除保护具备 Host 业务级统一拒绝能力**。不可通过隐藏控件声称完成保护。
- **功能就绪**：`request_redaction=false` 和 `deepseek_model_route_toggle=false` 保留。纯本地 `privacy.ts` / `redact.ts` 不代表存在实际可改写模型请求的公开契约。日志、导出、诊断、遥测策略以分级验证报告为准。
- **实时状态与历史数据**：没有真实 Windows 安装实例、官方 OAuth/DeepSeek 登录链路、上传队列观测、模型流式/第三方插件回归证据；此前的文档中“阻断全部上传/已强制关闭”等文字一律不得作为安全声明。停用宿主遥测配置也不会自动清空已排队的数据。


---

## 2026-11-24 阶段一：Delta Suite 插件能力及架构静态审计（P0/P1 前置门禁）

审计范围仅限 fongap-labs/plugins/packages/delta-suite；本次不修改 Harness 本体、app.asar、官方语言资源或 Profile，不执行实现。仓库快照：fongap-labs/plugins main@1635c31cc2df98d6cc834923b4341aa92907aa7c；官方源码 deepseek-ai/deepseek-harness master@4b399c39a6d1479cd84ca591b4d7c88e24d38a96。两者仅为源码基线，不是实际安装版本。

状态口径：已验证生效仅指真实 Harness 的可重现集成结果，本轮没有足够证据将任何一项归为此类。已配置但未验证＝代码已配置/注册，缺实机证明；未启用＝纯函数/模板或未接线；宿主不支持＝公开 API 缺少该特定能力；检查失败＝发现违反本任务硬边界。证据级别 S=本轮静态源码/官方 API 文档；U=仓库存在相关单元测试（未在本轮重跑）；M=仓库存在模拟 Host 测试（未在本轮重跑）；H=真实官方 Harness；W=Windows 实机。S/U/M 均不能推断 H/W。

### 功能矩阵

| 功能 | 代码位置与真实调用链 | 当前状态 | 公开 API | 风险 / 证据 |
| --- | --- | --- | --- | --- |
| Kernel 生命周期 | src/delta-suite-kernel/feature-lifecycle-registry.ts → composition.ts register/mount/dispose | 已配置但未验证 | 是 | 支持回滚/逆序释放，未证实所有 Client 监听器均纳入；S,U |
| Adapter 协商 | src/delta-suite-adapter/host-capability-contract.ts → index.ts 导出；composition.ts 实际 mount(new Set()) | 未启用 | 未验证 | 无 Host manifest 接线；helper 单测不等于运行协商；S,U |
| Cordis 功能组合 | src/index.ts → delta-suite-composition.ts → privacy/search/sessions/context/gateway 安装器 | 已配置但未验证 | 是（Cordis）；子服务逐项核查 | 安装/卸载/异常恢复未经 Host 实验；S,M |
| 上下文压缩状态 | src/context-projection.ts → sessionProjections.register → Client 显示 | 已配置但未验证 | 是 | 异步注册、资源清理需要真实服务验证；S,U,M |
| 客户端装载 | src/client.ts → window.__ModuleLoader__.load → ctx.inject(['slots']) | 已配置但未验证 | 是（官方模块注册） | 模块装载公开；其后 DOM 接管不因启动成功而合规；S,M |
| 大型 Client | src/client.ts ~333 KB / 6639 行，集成 UI、服务、权限、主题、配置、QR、MCP | 检查失败 | 不适用 | 职责集中，阶段 P0-4 仅拆真正跨职责部分；S |
| 原生 DOM 兼容层 | src/client.ts:installLiveNativePresentation / installSidebarCompatibility → querySelector、MutationObserver、原生菜单点击 | 检查失败 | 否 | 违反全局 DOM 劫持边界，依赖文案/结构，停用回退待验；S |
| Harness 源码补丁 | scripts/apply-harness-ui-patch.mjs；package.json.files 将脚本打包 | 检查失败 | 否 | 修改原生组件/语言文案的路径与本任务硬边界冲突；本轮未执行该脚本；S |
| 语言来源 | src/client.ts:language → document.documentElement.lang // navigator.language → DICTIONARIES | 已配置但未验证 | 是（官方 Locale 同步 html lang） | 官方文档确认 LocaleRuntime 将当前语言写入 html lang；组件仍未直接订阅公开 Locale snapshot，异步首帧与 H/W 待验；S |
| 集中翻译字典 | locale/zh.json / locale/en.json → finalize-client.mjs → DICTIONARIES | 已配置但未验证 | 是（Suite 自有） | 两份各 291 个叶子 Key，Key 集合/{} 占位符一致；未使用 Key/无漏译尚未完整证明；S |
| 组件硬编码 | client.ts:wording/showHover/shortcut commands/GatewayEffortFooter:say | 检查失败 | 是（Suite 自有） | 存在直接中英分支与内联词条，未完全集中；S |
| Theme API | client.ts:TOKENS → createController.applyPalette → theme.overrideTokens → dispose | 已配置但未验证 | 是 | light/dark token 有映射；主题切换/恢复缺 Windows H/W；S,M |
| 样式分层 | src/theme.css、feature-extras.css、client.ts:LIVE_PRESENTATION_CSS | 检查失败 | 是（自有），否（原生私有 DOM） | 多处注入及原生 DOM 选择器造成颜色混用与维护风险；S |
| Suite 设置项 | client.ts:settings.section、settings.plugins.tab、plugins.bundle.config → PersonalizationSection | 已配置但未验证 | 是 | 需逐项删除不生效的开关/成功提示；S,M |
| 自有配置存储 | client.ts:FEATURE_STORAGE_KEY、STORAGE_KEY 和 assistant association localStorage | 已配置但未验证 | 是（自有数据） | 缺统一 schema/写入串行、跨页面版本冲突处理；S |
| 自有偏好备份恢复 | 未见 Suite-only export/import 及恢复确认实现 | 未启用 | 是（自有数据） | 只允许备份偏好，禁止账号标识、Token、Session、Host 原生数据；S |
| Host 本地保护状态 | host-state.ts:createHostStateStore → Profile .delta-suite-state.json → host-sessions.ts | 已配置但未验证 | 未验证 | 含 PIN hash/TOTP secret、墓碑；不能并入偏好备份；S,U,M |
| 会话搜索 | host-search.ts:installHostSessionSearch → connection.fetch.register → sessionQuery/sessions/sessionPersistence → client.ts:installHostSearch | 已配置但未验证 | 是（路由/Slots），底层会话接口未验证 | 缓存/脱敏/授权有实现，真实搜索与卸载无 H/W；S,U,M |
| 会话 Hover | client.ts:sidebar.session.row.hover → SessionHoverDetail → Session catalog | 已配置但未验证 | 是 | 公开 Slot 仅追加内容，不提供整个原生卡片布局所有权；S,M |
| 会话菜单 | client.ts:contextMenus.register(move/lock/delete)、contextMenu.icon | 已配置但未验证 | 是（扩展 action） | 不能经公开接口重排宿主自有 Rename 优先级；不允许源码补丁；S,M |
| Session 删除/移动 | host-sessions.ts → 自有 HTTP 路由 → Host Sessions/Workspace + 实体文件管理 | 已配置但未验证 | 未验证 | 自有实体删除和 Host 权限/状态并行；需确认安全契约，否则回退原生；S,U,M |
| Workspace 辅助 | client.ts:installWorkspaceMutationGuards、host-sessions.ts 状态映射和保护 | 检查失败 | 否（默认删除前拒绝/首次折叠） | 兼容方法包装不等于官方业务边界权限；缺公开 API 时禁用；S |
| 官方 Agent/Compaction 复用 | cordis.patch.yml 官方 compaction+agent preset → context-projection.ts → registerAssistantSurface | 已配置但未验证 | 是（部分 Slots/Session） | 独立讨论是否符合最小复用及资源释放仍需 Host 验证；S,M |
| MCP 管理 | client.ts:plugins.add.actions → McpManagementDialog → configForms.mutate(...revision)/remote.mcpManager | 已配置但未验证 | 是（Slots/ConfigForms），probe/restart 未验证 | 编辑 env/headers 可能读取含密钥值；禁止原始 Token 暴露；S,M |
| 模型/推理显示 | client.ts:modelDirectories.directoryFor + conversation.input.model.label + GatewayEffortFooter | 已配置但未验证 | 是 | 不取代宿主模型选择器；Gateway 自动元数据/写入需单独证据；S,M |
| Gateway 原始凭据 | host-gateway-effort.ts:credentials.resolve(ref) → credential.value → Bearer HTTP/HMAC | 检查失败 | 未验证 | 明确违反本次禁止读取原始 Token 的边界；P0 必须移除明文链路或能力不可用；S |
| 账号/余额 | client.ts:accountUi.getSnapshot().details.balance → showHover | 已配置但未验证 | 是 | 仅官方快照，无持久余额缓存；今日消费当前显示暂无数据；S |
| 登录/退出 | client.ts:activateNativeAccount → 搜索 DOM role=menu + 文本匹配 + click | 检查失败 | 否（未找到本任务可用的公开 action） | 模拟点击宿主菜单违反 DOM 边界，必须保留原生入口；S |
| Session Log 排除 | host-privacy.ts:installHostPrivacyGuards → sessionLogDeepSeek.registerExclusion(() => true) | 已配置但未验证 | 是 | 只阻断该上传字段，不代表禁用遥测/OTLP；停用恢复与真实请求待验；S,M |
| 离线敏感信息脱敏 | privacy.ts:redactModelRequest/restoreStream；privacy-bridge.ts:空 Config | 未启用 | 否（暂无前置 LLM 请求改写公共契约） | 纯算法不等于模型出站链路保护，不得展示生效开关；S,U |
| 启停/卸载/故障回退 | client.ts:ctx.effect/controller.dispose；composition.ts:registry.dispose | 已配置但未验证 | 是 | 监听、Portal、CSS、缓存/网络请求释放及官方主题恢复需 H/W；S,M |

### 阻断问题与宿主能力缺口

1. 非公共 DOM：运行时有原生节点查找、文字/属性更改、模拟菜单点击及 MutationObserver，既有源码补丁脚本还可改 Harness。本轮硬性禁令不容许将这些归入 Suite 的稳定能力。P0 应限定自身 UI + 公共 Slots；无接口则保持原生。
2. 原始凭据：host-gateway-effort.ts 已经调用 credentials.resolve 并取得 credential.value，MCP env/headers 编辑也需核对明文字段处理。要求禁止原始 Token 读取/缓存/输出；缺少官方无明文请求代理时应停用对应增强，不能声明成功。
3. 协商未接线：DELTA_HOST_CAPABILITIES 与 negotiateHostCapabilities 虽存在，composition.ts 仍以空 Set mount；没有真实 Host manifest，版本字符串不可作为能力证据。
4. 官方未提供已证实接口：原生顶栏任意重排、重命名菜单改顺序、运行文案局部覆盖、首次工作区折叠、完整 HoverCard 控制、默认工作区删除前业务拒绝。均不得借源码补丁/私有 Store 补齐。
5. 国际化：官方 packages/client/locale/README.md 确认 LocaleRuntime 将已选语言同步至 html lang；当前 Suite 仍通过 document.lang/navigator.language 读取，未直接订阅公开 Locale snapshot。中英 JSON 各 291 个同名叶子 Key，简单占位符一致，但硬编码/死 Key、异步首次加载及其他语言回退尚未实机验收。
6. 状态与产品声明：feature-readiness.json 的 false readiness 位须保持保守；已有 COMPATIBILITY 历史章节的“无 DOM 接管”等描述与当前源码并存时以新矩阵为准。不可将纯单元算法、README 或 CI 视为实机交付。

### 五个证据等级分别报告（本轮）

| 等级 | 已有证据 | 本轮结论 |
| --- | --- | --- |
| 1 静态检查 | 本轮审查真实仓库树、调用链、官方公开文档、字典键/占位符；约 333 KB / 6639 行 client.ts | 已完成此范围静态审计，发现边界检查失败；本轮未执行 tsc/lint |
| 2 单元测试 | 现有 delta-suite-feature-registry、delta-suite-context、delta-suite-privacy 等测试文件 | 已有测试但本轮未重跑，不能标记通过 |
| 3 模拟 Host | 现有 delta-suite-native、delta-suite-host-guard、delta-suite-dom-compat 等 | 已有测试但本轮未重跑，不能等同于真实 Host |
| 4 真实 Harness | 无本轮真实安装的启动/对话/启停完整日志 | 未验证 |
| 5 Windows 客户端 | COMPATIBILITY 记录历史 Windows 启动失败，不是当前版本重测 | 未验证 |
| 两版本兼容 | 只静态核对官方源码一个 SHA，未获取两个不同安装构建结果 | 未验证 |

### 下一阶段门禁

完成本审计矩阵并进入单独审计 PR 后，才能开始任何实现。P0 顺序：集中 i18n；官方适配/生命周期并排除明文 Token 和全局 DOM；Delta 自有 Theme/Slots；有收益的 client.ts 职责拆分。P0 的单元/模拟/真实 Host/Windows 和两版本证据独立满足前不得进入 P1。P1 独立拆分配置备份、账户、搜索/MCP/上下文与其他通用能力。禁止 Fongap 新治理、上游跟踪、独立 Desktop、代理、Vision Bridge、遥测或重复 Host 核心服务。

API“是”仅表示相应官方文档或类型确有声明，不保证用户正在运行的 Harness 构建实现该接口。对外产品文案只能据 H/W 证据写已交付。


## 2026-11-24 P0-3 Delta 自有组件色彩 Token 收敛（待验收）

本改动不使用私有 Harness 样式类名或全局 DOM 接管，不改动原生右键菜单、账号控件或第三方插件的 CSS。官方 Theme API 仍负责自身声明的语义色覆盖及恢复。浅色、深色均新增 `--dtd-bg-muted` / `--dtd-qr-shadow`；MCP 管理弹窗、纠正对话框和遮罩改用 `--dtd-modal-*` / `--dtd-bg-mask`，可聚焦按钮及表单增加 `--dtd-border-focus` 焦点轮廓。

静态 CSS 引用完整性、色值不泄漏、发布用 Git Blob SHA1 指纹均增加回归检查。**未完成**真实 Harness 的两种外观模式对照、Windows 多屏幕缩放和主题切换后 Portal 销毁验收；本次静态/CI 检查不等同于视觉验收。


## 2026-11-24 P0-4 退役 Gateway UI 代码清理

在凭据不透明的官方请求接口尚未确认前，P0-2 已停用 Gateway Effort 的服务和设置入口。P0-4 相应删除 `client.ts` 中约 12 KB 不再调用的原生 Models 目录订阅、Gateway 同步交互组件及状态类型；同时清理 `client-types.d.ts` 中的对应接口和两份 Suite 词典各 29 条无引用文案。

没有新增第二套模型选择器、凭据读取、隐私设置或宿主代理。公开 `conversation.input.model.label` 插槽、Host 自有推理等级和已有 Gateway reasoning 的纯函数工具仍保留，避免影响仍有调用的适配契约。

验收范围：静态/单元 CI、字典 Key/占位符一致性及死代码检查；真实官方 Harness、Windows 客户端以及两个 Host 版本的安装与回退仍未完成。因此本记录不等于 P0 全部验收通过。

## 2026-11-24 P0-1 官方 Locale API 响应式适配

官方 `@deepseek-ai/dsh-client-locale` 公开 `getSnapshot().active` / `subscribe()`，Suite 通过 Cordis 的可选 `locale` 服务只读订阅；中文系列使用原有 zh 词典，其他语言使用 en 词典。不修改 Host 语言偏好或全部原生语言，取消监控 `<html lang>` 的全局 MutationObserver。服务不可用的老宿主仅按初始文档/浏览器语言降级，不承诺后续热切换。

证据为官方源码/README 静态接口检查与新增模拟订阅/卸载用例；CI、真实 Windows、两版宿主及异常恢复仍独立待验收。


## 2026-11-24 P0-1 无引用文案清理

移除 Suite 两份自有词典各 52 个无代码引用的叶子 Key（41 个 `ui`、1 个 `sessionMenu`、5 个 `privacy`、5 个 `searchPalette`），同时删除已显式声明但不再使用的类型。不存在新增翻译体系；全部官方 Harness 语言、系统语言偏好以及第三方翻译保持不变。

废弃的隐私/遥测“已强制禁用”文本只是旧声明，删除它们不表示 Host 已经关闭遥测。自动测试新增每个词条的源码字段引用检查，与已有 Key/占位符对称检查配合执行。待 CI 和实机核验。


## 2026-11-24 P0-4：删除未挂载的原生 DOM 接管（待实机验收）

此改动基于已合并的 P0-2 Host-only 边界和 P0-1 官方 Locale 只读订阅。真正删除不再挂载的 `installLiveNativePresentation`、`LIVE_PRESENTATION_CSS`、原生头像/导航操作、会话 Portal 目标、`accountUi` 旧显示代理。原生登录、导航、菜单、侧边栏和工作区保持 Harness 负责。同步清理随上述死代码变得无引用的 9 个中英文显示 Key 及类型。

`installSidebarCompatibility` / `installHostSearch` 的遗留审计区域未在本次修改；不放宽源码指纹校验。当前已验证的仅为静态代码/字典与模拟宿主回归测试（以本 PR 的中央 CI 实际结果为准）；真实 Harness 安装、两版本兼容、Windows 客户端启用/停用/卸载/主题恢复均未验证。本次不构成 P0 全项验收通过。


## 2026-11-24 P0-2/P0-4：删除退役的 Workspace 方法拦截

本次删除未接入插件运行时的 `installWorkspaceMutationGuards`、`readWorkspaceMutationPolicy` 和私有 `workspaces.delete/unarchiveSession` 包装器。功能不再暗示 Delta 可以取代宿主的工作区删除权限、单工作区保护或默认工作区删除前拒绝。原生工作区变更完全归官方 Harness 管理。

保留 `createSearchContentProtection` 的只读 Workspace/Session 保护：在用户明确受保护的会话、工作区和缺失 Host 数据的情况下，Delta 自有搜索结果按已知成员关系过滤，不改写宿主方法、文件系统或原生列表。旧的测试改为验证真实代码路径、别名锁定、墓碑和 fail-closed 行为。

证据级别：源码/测试用例与现有 CI 为准；未验证真实 Harness 安装版本、Windows 客户端停用/卸载或第二个不同宿主版本。不得将此 PR 的合并等同于整项 P0 功能验收完成。


## 2026-11-24 P0-2/P0-4：退役的 Sidebar DOM 接管实体删除（待验收）

`installSidebarCompatibility` 与仅用于该函数的 `createFrameScheduler` 已从插件浏览器源码中删除（约 16 KB）。原生侧边栏位置、会话右键菜单顺序、默认工作区折叠、原生 Settings 文本及账户头像行为仍由 Harness 原生组件管理，Delta Suite 不使用 DOM 扫描、监听、按钮克隆或点击模拟来替代宿主公开接口。

严格的 ZIP3 发布验证保留了运行中的 `installHostSearch` 完整区域 SHA-1 校验，并新增原生 Sidebar DOM 接管标识的拒绝检查；既有旧版“必须存在兼容函数”的测试已替换为已交付的 Session Hover/Trailing/Brand/Search Slot 权限边界测试。不会据此将宿主不支持的布局能力设为“已验证”。

静态回归为 11 项源码所有权断言已通过；中央 Linux/Windows CI 及真实 Harness 安装/启用/停用/卸载、浅深色主题切换、两个 Host 版本兼容性仍各自独立验收。代码合并不等于安装生效，也不是完整 P0 客户端验收报告。
## 2026-11-24 P0-2 MCP 凭据与宿主所有权

删除已实现但缺少可信官方凭据代理的 Suite 自建 MCP 配置弹窗、明文 `env`/`headers` 字段读取与设置写入入口，相关 CSS、类型和双语词条同时清理。MCP 管理继续由官方 Harness 自身的插件和设置负责。保留已验证的公开 Slot、Theme 和 Locale 接口；不接管原生账号、会话、工作区与全局 DOM。

本轮仅证明源码、测试与 CI；真实 Windows Harness 安装、停用、卸载与不同宿主版本仍须另行验收。

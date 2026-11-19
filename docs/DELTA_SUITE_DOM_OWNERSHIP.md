# Delta Suite 宿主 DOM 接管清单

本清单追踪 Issue #333 的现有兼容路径，并区分**已审计的公开 Slot**与**尚无公开 API 证据的 DOM 操作**。这不是功能已交付清单；功能就绪状态仍由 `projects/dsh-delta-suite/feature-readiness.json` 决定。来源为 `packages/dsh-delta-suite/src/client.ts` 与现有 Slot 注册；未获证据的 Host API 一律视为不可用。

| 接管对象 | 已确认公开接口或缺口 | 当前处理及回退 | 第三方插件影响 | 验收条件 |
| --- | --- | --- | --- | --- |
| 工作区首次折叠 | 未确认公开的初始折叠/展开写入接口；私有 `dsh.workspace.view.v5` 不是协议 | **本次退役**私有读取和 `row.click()`；沿用原生展开状态 | 不主动变更其他插件共享的原生列表状态 | 静态回归与 ZIP3 完整性校验；Windows 新装、启停和升级后状态不被 Delta 强改 |
| 已退役的兼容属性 CSS | `data-delta-compat` 的根节点属性写入已经退役，当前客户端无该属性写入；纯属性选择器无法激活 | **本轮清理**主题内 65 个 `data-delta-compat` 选择器分支，其中 11 条纯死规则；保留 `data-delta-ui="delta"` 生效分支与 Delta 自有样式，不重新引入历史布局标记 | 不依赖旧属性触发宿主菜单、侧栏或导航重排，现行 Delta 自有组件保持样式 | CI 校验源码无属性写入、主题无该属性及实际 ZIP3 样式指纹；Windows 实机启停、升级和第三方插件共存验证 |
| 宿主原生输入框、预览标题、右栏指南和全局 CSS 令牌 | 公开 Theme API `overrideTokens` 支持经过注册的主题令牌；无公开的原生组件私有类、全局表单覆盖或右栏指南布局 Slot | **本轮移除** `theme.css` 对原生按钮、搜索输入、表单聚焦/悬浮、预览标题/徽章、右栏指南及全局选择/焦点样式的接管；不再注入 `--dsw-*` CSS 变量声明，保留官方 Theme API 令牌和 `.dtd-*` 自有样式 | 宿主原生控件和第三方插件输入、标题及指南恢复自己的 CSS 层叠；Delta 品牌与搜索组件仍由自身渲染 | 单测拒绝恢复任何宿主 `class` 私有选择器、全局 `button/input` 或 CSS 变量写入；中央 Linux/Windows、Security、ZIP/TGZ 产物主题哈希校验；真实 Windows Harness 启停、搜索输入、原生预览和第三方共存待验收 |
| 侧栏搜索位置与导航顺序 | 已确认 `conversation.input.left` 公开 Slot；原生侧栏搜索定位没有可验证的公开 Slot | **本轮退役** `installHostSearch` 私有 DOM 定位、节点插入和观察；Search Palette 经 `conversation.input.left` 官方入口打开，检索仍使用 `sessions`/`navigation` 服务；原生搜索保持可用 | 保持 Harness 和第三方侧栏控件完整，公开 Slot 缺失时不伪造宿主入口 | 静态和 CI 权限、卸载及搜索回归；Windows 实机原生搜索和插件共存验证 |
| 新会话按钮镜像 | 未确认公开的原生按钮挂载/触发接口 | **已退役**按钮克隆、合成点击及原生控件隐藏 CSS；沿用 Harness 原生入口 | 不再转发模拟点击，不隐藏原生控件 | 源码和 CSS 回归、ZIP3 完整性验证及 Windows 原生创建会话实测 |
| 宿主侧栏展开控件和品牌行 | 公开 `sidebar.brand.mark/name` 允许 Delta 声明式贡献品牌内容；原生开关按钮、Logo 行及 Windows 菜单起点没有可证明的布局接管权限 | **本轮退役** Delta 模式下将 `[data-sidebar-*toggle/opener]` 等原生按钮移到屏幕外，以及 `wtg9ga_*` / `SidebarRoot_*` 品牌行的高度归零、隐藏和 `--dsh-windows-menu-start` 私有覆盖；仅保留 Delta 自有 `.dtd-brand-*` Slot 样式 | 原生开关与第三方插槽恢复原有显示、键盘与指针交互；Delta 不再阻断折叠/展开入口 | CI 源码/发行主题指纹及防回退检查；Windows Harness 左右侧栏展开/折叠、品牌展示、设置页和第三方插件共存实测 |
| 宿主侧栏列表、滚动与渐隐提示 | 未确认可覆写 Harness 原生 `data-sidebar-list-area`、原生会话行、滚动容器和渐隐装饰的公开 Slot；这些属性及私有类名不是布局契约 | **本轮退役**会话行高/hover/时间文字重写、原生工作区列表排序及 flex/overflow 覆写、滚动条和 scrollFade 隐藏、原生伪元素和边框归零；保留 Delta 自有列表/搜索滚动条、受保护会话墓碑与锁屏 CSS | 恢复 Harness 与第三方扩展的原生滚动、渐隐提示、列表几何及键盘导航行为 | DOM、ZIP3 实际主题指纹与发行禁止回退测试；Windows Harness 大量会话/工作区、滚动条、第三方样式和停用恢复验证 |
| 侧栏分隔条与弹性宽度 | 未确认公开的布局尺寸、分隔条拖动及折叠控件接管接口 | **已退役** `syncElasticLayout`、私有三栏网格/CSS 变量、分隔条捕获事件、伪造边缘折叠按钮和宽度写入；Harness 原生布局和拖动为权威；历史宽度键不再读取也不擅自删除 | 不阻断第三方指针事件、不重写宿主宽度和位置 | 源码/样式和发布哈希回归；Windows 实机验证拖动、折叠、双侧栏共存和禁用恢复 |
| “未分组”右键操作 | 未确认 Harness 原生未分组行有批量删除菜单的公开扩展接口；私有 `[data-row-key="workspace:"]` 不是权限契约 | **本轮退役**全局右键 capture、阻断原生菜单与 Delta 浮动删除菜单；Host 删除接口及锁定、墓碑数据保持不变；无公开入口时不伪造该 UI | 原生和第三方右键菜单不再被抢占；批量删除 UI 尚未交付 | CI/ZIP3 防回退验证，Windows 实机右键、锁定删除与第三方菜单共存测试 |
| Host 原生会话授权的工作区成员校验 | 已有公开 `workspace/session-unarchiving` 拒绝事件和 `workspaceRegistry.list()`；未发现对应的公开 `workspace.before-delete` 前置拒绝事件 | **本轮加固** Host Session Ops 在有工作区锁时拒绝重复物理路径、空白工作区或成员 ID，以及无有效目标的持久迁移；Host 逻辑移动在任何锁状态下都拒绝重复路径和异常成员；保留既有权限和删除墓碑数据 | 原生取消归档、受保护内容搜索及删除/移动遇到不可信 Host 快照统一保守拒绝，不通过私有 registry 绕行 | Host 原生事件、搜索过滤、删除/移动和无锁路径的测试，Central CI 和 Windows Harness 实机验收 |
| 工作区删除保护的快照完整性 | 当前公开工作区列表仅提供读取快照，尚未验证 Host 级 `workspace.before-delete` 拒绝事件；客户端包装不是服务端 ACL | **本轮加固**：原生列表出现重复路径/ID、缺失会话成员、空 ID/路径时拒绝删除及取消归档；存在锁定时，迁移记录指向不存在的目标也拒绝。保留原工作区方法兼容包装与受保护状态，未迁移为正式服务授权 | 避免损坏或过期的宿主工作区数据被当成安全放行证据；兼容适配器仍不能阻止绕过它的其他调用方 | 可执行单元测试验证正常放行、锁定/墓碑拒绝、异常快照 fail-closed；另须 Windows 实机验收和公开 Host 前置事件验证 |
| 原生弹窗、Tooltip、菜单和 Listbox 样式 | 未找到公开的全局原生弹窗、Tooltip、Listbox 样式接管接口；`role`、私有 `_surface_`/`_list_` 与导航类不是 Delta 扩展 Slot | **本轮退役**针对原生 `role=menu/tooltip/listbox`、原生浮层/Backing/Spinner 和设置导航的背景、圆角、悬浮态、层级与指针行为覆盖；保留 `.dtd-tooltip`、`.dtd-toast`、`.dtd-host-search-results`、`.dtd-host-search-result` 和 `.dtd-spinner` 自有样式 | Harness 和第三方插件浮层恢复原生配色、层级、可访问性与交互规则 | DOM/ZIP3 发行实际 CSS 禁止回退、主题哈希和真实 Windows Harness 多插件菜单/悬浮层验收 |
| 原生菜单与工作区安全 | `workspaces` 服务用于授权命令；未确认原生菜单 DOM 所有权 | **已退役**原生菜单项删除、布局覆写、危险颜色 `data-danger` / `dtd-menu-danger` 注入及通用分隔线 CSS；保留 `onMenuClickCapture` 锁定操作防护、单工作区删除保护与服务层 ACL；其他隐私 DOM 隐藏后续审计 | Harness 和第三方插件决定菜单危险态和分隔线，Delta 自有删除菜单可自行着色 | CI 验证原生 DOM 不添加危险颜色标记；Windows 权限拒绝、第三方菜单及停用回退实测 |
| 会话悬浮卡 | `sidebar.session.row.hover` 仅允许声明式装饰扩展，不支持替换整个原生悬浮卡 | **已退役** `processHoverCards` 原生 DOM 扫描、类名注入、全局 mouseover 监听及私有悬浮卡 CSS 覆写；保留受保护会话访问策略约束的公开 Slot 注册，不隐藏其他插槽 | Harness 控制卡片内容、排版、路径与时间展示；其他插件 Slot 可共存 | 源码/ZIP3 与权限回归；Windows 插件启停后原生卡片和第三方扩展正常 |
| 原生运行状态与设置导航文案 | 未确认公开的原生文案替换能力 | 历次审计已退役状态和部分导航文本 DOM 改写；继续保持原生文案 | 原生与第三方文案不应被覆盖 | 中英文切换及第三方设置栏目正常 |
| 模态窗口拖动与外观 | 未确认公开的 Harness 原生 Dialog Chrome / 拖动接管 API | **已退役** `syncModalPanel`、`onModalPointerDown`、双击复位、私有 `AnXs9G_*` 选择器和原生遮罩/面板覆写；Harness 保有原生窗口定位及拖动；**本轮同步退役** `syncModalChromeOverlay`、全局 `data-delta-modal-open` 与宿主 `--dsw-specific-sidebar-fill` 弹窗期改写，Delta 自有 `.dtd-dialog-*`/`.dtd-search-*` 遮罩和权限保护保留 | 不向宿主或第三方 Dialog 注册私有拖动监听，停用 Delta 不留下位置变量 | ZIP3 源码/样式回归；Windows 实机打开设置及第三方 Dialog，验证拖动、遮罩、关闭和停用恢复 |
| 原生会话/工作区锁徽章 | 上游 `deepseek-ai/deepseek-harness@2e39e704` 的 `packages/client/ui-workspace/src/client/contract/slots.ts` 已发布 `sidebar.session.row.trailing`（非交互、内联、16px 槽位）；**工作区行**仍无已验证专用状态槽位 | 原生 DOM 锁徽章及私有类写入保持退役；本次通过公开会话 trailing Slot 按 Host 已确认状态显示 Delta 自有小锁图标，状态切换/停用自动释放；工作区行仍交还原生，真正 ACL 仍由 Host 层执行 | 不改动原生 Session/Workspace 节点结构、菜单、布局、第三方 Slot；公开 Slot 缺失时保持原生 | CI 验证 Slot 生命周期、锁定/解锁、继承工作区锁、墓碑及官方模式；Windows 实机锁定、删除、插件停用、第三方 Slot 共存验收 |
| 隐私与受保护会话显示 | 服务侧安全授权为权威；DOM 隐藏不是安全边界，且没有公开的原生设置行或未分组容器控制接口 | **本轮退役**原生 Settings 行的文本/私有类名隐藏，以及空“未分组”容器的 DOM 隐藏；原生 UI 由 Harness 管理。继续保留受保护会话、删除墓碑、受限命令和单工作区删除的兼容防护，待独立证明服务层控制后才能迁移 | 不再隐藏原生设置项和第三方设置行；不影响原生分组状态 | CI 防回退、锁定/删除/2FA 权限回归；Windows 设置页、分组、停用恢复和第三方插件实测 |
| 原生中心列、聊天标题、Composer 与轨迹布局 | 未确认公开的中心布局/Composer 宽度或 Header 几何覆盖 API；私有哈希类和 `--dsh-*` 内部变量不是公开协议 | **本轮退役** `mP3x-q_centerCol`、`an3WzG_*`、`F07MqG_dock`、`eciBTa_*` 和 `Wd4N7W_*` 的 CSS 几何接管与废弃 `--dtd-center-gutter`；保留 Delta 自有锁屏、隐私兼容过滤和设置组件 | Harness 与第三方 Header Slot、Composer 布局和轨迹控件恢复本身的尺寸、顺序、宽度与滚动行为 | ZIP3 实际 emitted CSS 哈希与禁止回退测试；Windows Harness 实机中心列、标题、输入和轨迹验收 |
| 原生失败回合错误行 | 未确认公开的错误详情布局扩展接口 | **本轮退役**私有类名扫描、折叠属性、点击/键盘切换和对应 CSS；错误内容与详情布局交还 Harness | 不拦截错误行事件，也不隐藏或截断原生错误详情 | 源码所有权回归；Windows 检查错误详情完整显示、点击与键盘交互保持原生 |
| Vision 粘贴/拖放与识别 | 未确认公开的 Composer/File 插入或上传授权接口；原生输入框内部 DOM 和 React setter 不是协议 | **本轮退役** `installClientVisionBridge`、全局 capture `paste`/`drop`、`execCommand('insertText')`、私有输入选择器与 setter 写入；保留独立的 `installHostVisionOps`、Vision 工具和既有用户配置，不自动提交图片或接管原生输入 | 保持 Harness 及第三方插件的粘贴、拖放、输入法事件原样工作；缺少公开接口时客户端 Vision 仍标记未就绪 | 源码与发行 ZIP/TGZ 防回退测试；Windows 实机粘贴/拖放、启停、跨插件共存与 Host 工具验证 |
| 品牌、主题、独立设置 | 已确认 `sidebar.brand.mark/name`、Theme API、`settings.section` | 保留官方 Slot/Service 与生命周期 disposer，停用恢复原生 | 按官方优先级共存 | Slot 卸载、主题释放、设置恢复及 Windows 实机验证 |

## 2026-11-19 保守恢复宿主原生隐藏状态

兼容层仍包含原生 DOM 保护（待官方 Host 操作前置拒绝接口替代），但它不再假设自己拥有原生行的既有可见性。每次 Delta 首次隐藏节点时保存原先的 `hidden` 和 `aria-hidden`；工作区数量切换、墓碑恢复或插件卸载只撤销 Delta 本次持有的标记及受控写入。之前已隐藏的原生菜单与第三方节点保持隐藏；后续第三方改写的 ARIA 状态不会被无条件删除。带有旧标记却不属于本次激活追踪集合的节点，不由 Delta 解除隐藏。

这只缩小临时 DOM 兼容层的所有权边界，**不等于**官方 Host 授权、最终观察器退役或真实 Windows 实机验收完成。仍需上游操作拒绝接口及锁定/墓碑的正式投影能力。

## 2026-11-19 设置页宿主兼容性报告

Delta 自有个性设置页及 `plugins.bundle.config` 的同一设置视图现直接列出四类**未验证具备可用官方扩展接口**的原生功能：侧栏搜索和导航重排、工作区首次折叠、工作区删除业务前置守卫、原生聊天运行文案覆盖。每项显示“原生保留”，同时提供升级正式 Harness 接口和实机重新验证的操作说明。切换到官方主题、英文或中文界面时报告仍可访问，不修改宿主导航、会话、设置与模型控件。

报告是**源码公开 API 审计而非已安装 Host 的运行时能力探测**；不会把 Cordis 已注册的 Delta Slot 误报为 Host 已支持整套原生布局；`projects/dsh-delta-suite/feature-readiness.json` 相应布尔值保持 `false`。既有 `DELTA_HOST_CONTRACT_VERSION = 1` 的显式声明协商协议保留，但当前未找到上游可核实的 Host 运行时能力 Manifest，因此不得虚构该服务、直接调用私有 Store 或自动宣布支持。

上游 `deepseek-ai/deepseek-harness` 的 `packages/api/session-controller/src/catalog.ts` 已将模型精确路由的 `reasoning.efforts/defaultEffort` 投影给 ModelCatalog；`packages/client/ui-model-selection/src/client/ModelSelect.tsx` 使用原生 Effort 菜单并区分 `undefined`（提供方默认）与适配器声明的显式 `off`。因此 Delta 当前仅展示原生所有权说明，**不会**复制 Effort 菜单、自动探测 `/v1/models` 或向网关构造未经许可的请求。Gateway 元数据实际流入当前安装 Harness 适配器、默认/显式 Off 传输的端到端验证仍属于 #280，不能据此关闭该 Issue。

## 迁移纪律

- 有公开且可验证的 Slot/Provider，先新增隔离的声明式能力与测试，再移除相应 DOM 路径。
- 无公开接口时保留 Harness 原生，不通过字符串选择器、私有 Store 或合成点击伪装功能实现。
- 已退役“工作区首次折叠”“新会话按钮镜像”“原生搜索输入代理”“服务搜索私有 DOM 挂载”“私有弹性三栏/分隔条/边缘折叠接管”“原生悬浮卡 DOM/CSS 接管”“宿主原生模态窗口 DOM/拖动接管”及“原生失败回合错误行折叠”；Search Palette 使用 `conversation.input.left` 官方 Slot，但宿主布局、宽度、折叠与拖动仍由 Harness 控制。原生设置行及空“未分组”视觉隐藏、Vision 全局粘贴/拖放和私有输入 setter 接管也已退役，其余隐私 DOM 兼容路径尚待处理，主题中的原生样式覆盖已集中退役，**#333 和 Windows 实机验收仍未完成**。
- 上游公开接口依据：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738` 的 `packages/client/ui-sidebar/src/client/contract/slots.ts` 及 `SidebarRoot.tsx`；仅作设计参考，不锁定运行版本。
- 保留插件单体、官方 UI 所有权、停止/卸载回退与第三方插件兼容性；不添加独立客户端、Host Patch 或 A/B 对照测试。
- 真实 Windows Harness 安装、升级、停用恢复、第三方插件共存、长会话稳定性需要独立验证；Central Windows CI 不能替代实机验收。

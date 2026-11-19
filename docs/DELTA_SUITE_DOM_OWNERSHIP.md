# Delta Suite 宿主 DOM 接管清单

本清单追踪 Issue #333 的现有兼容路径，并区分**已审计的公开 Slot**与**尚无公开 API 证据的 DOM 操作**。这不是功能已交付清单；功能就绪状态仍由 `projects/dsh-delta-suite/feature-readiness.json` 决定。来源为 `packages/dsh-delta-suite/src/client.ts` 与现有 Slot 注册；未获证据的 Host API 一律视为不可用。

| 接管对象 | 已确认公开接口或缺口 | 当前处理及回退 | 第三方插件影响 | 验收条件 |
| --- | --- | --- | --- | --- |
| 工作区首次折叠 | 未确认公开的初始折叠/展开写入接口；私有 `dsh.workspace.view.v5` 不是协议 | **本次退役**私有读取和 `row.click()`；沿用原生展开状态 | 不主动变更其他插件共享的原生列表状态 | 静态回归与 ZIP3 完整性校验；Windows 新装、启停和升级后状态不被 Delta 强改 |
| 侧栏搜索位置与导航顺序 | 已确认 `conversation.input.left` 公开 Slot；原生侧栏搜索定位没有可验证的公开 Slot | **本轮退役** `installHostSearch` 私有 DOM 定位、节点插入和观察；Search Palette 经 `conversation.input.left` 官方入口打开，检索仍使用 `sessions`/`navigation` 服务；原生搜索保持可用 | 保持 Harness 和第三方侧栏控件完整，公开 Slot 缺失时不伪造宿主入口 | 静态和 CI 权限、卸载及搜索回归；Windows 实机原生搜索和插件共存验证 |
| 新会话按钮镜像 | 未确认公开的原生按钮挂载/触发接口 | **已退役**按钮克隆、合成点击及原生控件隐藏 CSS；沿用 Harness 原生入口 | 不再转发模拟点击，不隐藏原生控件 | 源码和 CSS 回归、ZIP3 完整性验证及 Windows 原生创建会话实测 |
| 侧栏分隔条与弹性宽度 | 未确认公开的布局尺寸、分隔条拖动及折叠控件接管接口 | **已退役** `syncElasticLayout`、私有三栏网格/CSS 变量、分隔条捕获事件、伪造边缘折叠按钮和宽度写入；Harness 原生布局和拖动为权威；历史宽度键不再读取也不擅自删除 | 不阻断第三方指针事件、不重写宿主宽度和位置 | 源码/样式和发布哈希回归；Windows 实机验证拖动、折叠、双侧栏共存和禁用恢复 |
| 原生菜单与工作区安全 | `workspaces` 服务用于授权命令；未确认原生菜单 DOM 所有权 | **已退役**原生菜单项删除、布局覆写、危险颜色 `data-danger` / `dtd-menu-danger` 注入及通用分隔线 CSS；保留 `onMenuClickCapture` 锁定操作防护、单工作区删除保护与服务层 ACL；其他隐私 DOM 隐藏后续审计 | Harness 和第三方插件决定菜单危险态和分隔线，Delta 自有删除菜单可自行着色 | CI 验证原生 DOM 不添加危险颜色标记；Windows 权限拒绝、第三方菜单及停用回退实测 |
| 会话悬浮卡 | `sidebar.session.row.hover` 仅允许声明式装饰扩展，不支持替换整个原生悬浮卡 | **已退役** `processHoverCards` 原生 DOM 扫描、类名注入、全局 mouseover 监听及私有悬浮卡 CSS 覆写；保留受保护会话访问策略约束的公开 Slot 注册，不隐藏其他插槽 | Harness 控制卡片内容、排版、路径与时间展示；其他插件 Slot 可共存 | 源码/ZIP3 与权限回归；Windows 插件启停后原生卡片和第三方扩展正常 |
| 原生运行状态与设置导航文案 | 未确认公开的原生文案替换能力 | 历次审计已退役状态和部分导航文本 DOM 改写；继续保持原生文案 | 原生与第三方文案不应被覆盖 | 中英文切换及第三方设置栏目正常 |
| 模态窗口拖动与外观 | 未确认公开的 Harness 原生 Dialog Chrome / 拖动接管 API | **已退役** `syncModalPanel`、`onModalPointerDown`、双击复位、私有 `AnXs9G_*` 选择器和原生遮罩/面板覆写；Harness 保有原生窗口定位及拖动；**本轮同步退役** `syncModalChromeOverlay`、全局 `data-delta-modal-open` 与宿主 `--dsw-specific-sidebar-fill` 弹窗期改写，Delta 自有 `.dtd-dialog-*`/`.dtd-search-*` 遮罩和权限保护保留 | 不向宿主或第三方 Dialog 注册私有拖动监听，停用 Delta 不留下位置变量 | ZIP3 源码/样式回归；Windows 实机打开设置及第三方 Dialog，验证拖动、遮罩、关闭和停用恢复 |
| 原生会话/工作区锁徽章 | 已确认的 `sidebar.session.row.hover` 仅负责扩展区；未确认原生行末锁徽章或工作区行挂载 Slot | **本次退役**扫描工作区行及向原生会话/工作区行写入 `dtd-*-lock-badge`/`data-dtd-*-locked`；保留已确认的会话锁屏、删除墓碑、Host Session Ops 拒绝与工作区兼容保护；锁状态仍在 Delta 自有菜单/弹窗呈现 | 不向第三方或原生行增加子节点，完整归还行排列和语义 | CI 禁止旧原生徽章在 ZIP3 源码/产物/CSS 复活；Windows 实机锁定、删除、取消归档、停用恢复验收 |
| 隐私与受保护会话显示 | 服务侧安全授权为权威；DOM 隐藏不是安全边界，且没有公开的原生设置行或未分组容器控制接口 | **本轮退役**原生 Settings 行的文本/私有类名隐藏，以及空“未分组”容器的 DOM 隐藏；原生 UI 由 Harness 管理。继续保留受保护会话、删除墓碑、受限命令和单工作区删除的兼容防护，待独立证明服务层控制后才能迁移 | 不再隐藏原生设置项和第三方设置行；不影响原生分组状态 | CI 防回退、锁定/删除/2FA 权限回归；Windows 设置页、分组、停用恢复和第三方插件实测 |
| 原生中心列、聊天标题、Composer 与轨迹布局 | 未确认公开的中心布局/Composer 宽度或 Header 几何覆盖 API；私有哈希类和 `--dsh-*` 内部变量不是公开协议 | **本轮退役** `mP3x-q_centerCol`、`an3WzG_*`、`F07MqG_dock`、`eciBTa_*` 和 `Wd4N7W_*` 的 CSS 几何接管与废弃 `--dtd-center-gutter`；保留 Delta 自有锁屏、隐私兼容过滤和设置组件 | Harness 与第三方 Header Slot、Composer 布局和轨迹控件恢复本身的尺寸、顺序、宽度与滚动行为 | ZIP3 实际 emitted CSS 哈希与禁止回退测试；Windows Harness 实机中心列、标题、输入和轨迹验收 |
| 原生失败回合错误行 | 未确认公开的错误详情布局扩展接口 | **本轮退役**私有类名扫描、折叠属性、点击/键盘切换和对应 CSS；错误内容与详情布局交还 Harness | 不拦截错误行事件，也不隐藏或截断原生错误详情 | 源码所有权回归；Windows 检查错误详情完整显示、点击与键盘交互保持原生 |
| Vision 粘贴/拖放与识别 | 未确认公开的 Composer/File 插入或上传授权接口；原生输入框内部 DOM 和 React setter 不是协议 | **本轮退役** `installClientVisionBridge`、全局 capture `paste`/`drop`、`execCommand('insertText')`、私有输入选择器与 setter 写入；保留独立的 `installHostVisionOps`、Vision 工具和既有用户配置，不自动提交图片或接管原生输入 | 保持 Harness 及第三方插件的粘贴、拖放、输入法事件原样工作；缺少公开接口时客户端 Vision 仍标记未就绪 | 源码与发行 ZIP/TGZ 防回退测试；Windows 实机粘贴/拖放、启停、跨插件共存与 Host 工具验证 |
| 品牌、主题、独立设置 | 已确认 `sidebar.brand.mark/name`、Theme API、`settings.section` | 保留官方 Slot/Service 与生命周期 disposer，停用恢复原生 | 按官方优先级共存 | Slot 卸载、主题释放、设置恢复及 Windows 实机验证 |

## 迁移纪律

- 有公开且可验证的 Slot/Provider，先新增隔离的声明式能力与测试，再移除相应 DOM 路径。
- 无公开接口时保留 Harness 原生，不通过字符串选择器、私有 Store 或合成点击伪装功能实现。
- 已退役“工作区首次折叠”“新会话按钮镜像”“原生搜索输入代理”“服务搜索私有 DOM 挂载”“私有弹性三栏/分隔条/边缘折叠接管”“原生悬浮卡 DOM/CSS 接管”“宿主原生模态窗口 DOM/拖动接管”及“原生失败回合错误行折叠”；Search Palette 使用 `conversation.input.left` 官方 Slot，但宿主布局、宽度、折叠与拖动仍由 Harness 控制。原生设置行及空“未分组”视觉隐藏、Vision 全局粘贴/拖放和私有输入 setter 接管也已退役，其余隐私 DOM 兼容路径尚待处理，**#333 和 Windows 实机验收仍未完成**。
- 上游公开接口依据：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738` 的 `packages/client/ui-sidebar/src/client/contract/slots.ts` 及 `SidebarRoot.tsx`；仅作设计参考，不锁定运行版本。
- 保留插件单体、官方 UI 所有权、停止/卸载回退与第三方插件兼容性；不添加独立客户端、Host Patch 或 A/B 对照测试。
- 真实 Windows Harness 安装、升级、停用恢复、第三方插件共存、长会话稳定性需要独立验证；Central Windows CI 不能替代实机验收。

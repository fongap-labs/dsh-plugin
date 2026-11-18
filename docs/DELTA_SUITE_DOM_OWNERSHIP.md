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
| 模态窗口拖动与外观 | 未确认公开的 Harness 原生 Dialog Chrome / 拖动接管 API | **已退役** `syncModalPanel`、`onModalPointerDown`、双击复位、私有 `AnXs9G_*` 选择器和原生遮罩/面板覆写；Harness 保有原生窗口定位及拖动，Delta 自有 `.dtd-dialog-*` 弹窗与权限保护保留 | 不向宿主或第三方 Dialog 注册私有拖动监听，停用 Delta 不留下位置变量 | ZIP3 源码/样式回归；Windows 实机打开设置及第三方 Dialog，验证拖动、遮罩、关闭和停用恢复 |
| 隐私与受保护会话显示 | 服务侧安全授权为权威；DOM 隐藏不是安全边界 | 保留服务侧 fail-closed；DOM 隐藏/拦截为待迁移的视觉兼容债务 | 不得以视觉隐藏替代访问控制 | 锁定、删除墓碑与 2FA 由 Host 拒绝未经授权命令 |
| 品牌、主题、独立设置 | 已确认 `sidebar.brand.mark/name`、Theme API、`settings.section` | 保留官方 Slot/Service 与生命周期 disposer，停用恢复原生 | 按官方优先级共存 | Slot 卸载、主题释放、设置恢复及 Windows 实机验证 |

## 迁移纪律

- 有公开且可验证的 Slot/Provider，先新增隔离的声明式能力与测试，再移除相应 DOM 路径。
- 无公开接口时保留 Harness 原生，不通过字符串选择器、私有 Store 或合成点击伪装功能实现。
- 已退役“工作区首次折叠”“新会话按钮镜像”“原生搜索输入代理”“服务搜索私有 DOM 挂载”“私有弹性三栏/分隔条/边缘折叠接管”及“原生悬浮卡 DOM/CSS 接管”及“宿主原生模态窗口 DOM/拖动接管”；Search Palette 使用 `conversation.input.left` 官方 Slot，但宿主布局、宽度、折叠与拖动仍由 Harness 控制。其余 DOM 兼容路径尚待处理，**#333 和 Windows 实机验收仍未完成**。
- 上游公开接口依据：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738` 的 `packages/client/ui-sidebar/src/client/contract/slots.ts` 及 `SidebarRoot.tsx`；仅作设计参考，不锁定运行版本。
- 保留插件单体、官方 UI 所有权、停止/卸载回退与第三方插件兼容性；不添加独立客户端、Host Patch 或 A/B 对照测试。
- 真实 Windows Harness 安装、升级、停用恢复、第三方插件共存、长会话稳定性需要独立验证；Central Windows CI 不能替代实机验收。

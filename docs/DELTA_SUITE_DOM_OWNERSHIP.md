# Delta Suite 宿主 DOM 接管清单

本清单追踪 Issue #333 的现有兼容路径，并区分**已审计的公开 Slot**与**尚无公开 API 证据的 DOM 操作**。这不是功能已交付清单；功能就绪状态仍由 `projects/dsh-delta-suite/feature-readiness.json` 决定。来源为 `packages/dsh-delta-suite/src/client.ts` 与现有 Slot 注册；未获证据的 Host API 一律视为不可用。

| 接管对象 | 已确认公开接口或缺口 | 当前处理及回退 | 第三方插件影响 | 验收条件 |
| --- | --- | --- | --- | --- |
| 工作区首次折叠 | 未确认公开的初始折叠/展开写入接口；私有 `dsh.workspace.view.v5` 不是协议 | **本次退役**私有读取和 `row.click()`；沿用原生展开状态 | 不主动变更其他插件共享的原生列表状态 | 静态回归与 ZIP3 完整性校验；Windows 新装、启停和升级后状态不被 Delta 强改 |
| 侧栏搜索位置与导航顺序 | `sidebar.panellist.actions` 仅允许 More 菜单入口，未证明可重排导航 | **已退役**原生搜索输入代理、模拟点击/输入事件及隐藏原生搜索 Slot 的 CSS；现有 `installHostSearch` 通过公开 `sessions`/`navigation` 服务检索，但仍通过 DOM 定位挂载；现仅在 `[data-sidebar-scrollport]` 的直属 `nav` 存在时挂载，否则只清理 Delta 自有 UI 并保持原生搜索 | 保留宿主搜索入口和第三方搜索扩展，不再注入伪造的原生输入事件 | 源码及 ZIP3 回归、服务搜索权限测试；Windows 原生搜索与 Delta 搜索共存验证 |
| 新会话按钮镜像 | 未确认公开的原生按钮挂载/触发接口 | **已退役**按钮克隆、合成点击及原生控件隐藏 CSS；沿用 Harness 原生入口 | 不再转发模拟点击，不隐藏原生控件 | 源码和 CSS 回归、ZIP3 完整性验证及 Windows 原生创建会话实测 |
| 侧栏分隔条与弹性宽度 | 未确认公开的布局尺寸控制接口；当前依赖私有网格/手柄 CSS 类 | 遗留 `syncElasticLayout` 待退役；不将布局接管标记就绪 | 可能覆盖第三方布局样式 | 无私有选择器，折叠/拖动在 Windows 正常 |
| 原生菜单与工作区安全 | 公开 `workspaces` 服务及原生菜单扩展可用于已授权命令；未确认原生菜单 DOM 所有权 | 权限必须由 Host/服务层执行；遗留 DOM 菜单隐藏、扫描与注入待审计 | 不得隐藏第三方合法菜单项或绕过 Host ACL | 非授权操作被服务拒绝；第三方菜单可见且可用 |
| 会话悬浮卡 | `sidebar.session.row.hover` 仅允许装饰扩展，不是完整悬浮卡替换 | 保留 Slot 扩展；遗留原生悬浮卡 DOM 改写待审计 | 保留其他 Slot 注册者 | 多插件同时注册且停用 Delta 后原生悬浮卡完整 |
| 原生运行状态与设置导航文案 | 未确认公开的原生文案替换能力 | 历次审计已退役状态和部分导航文本 DOM 改写；继续保持原生文案 | 原生与第三方文案不应被覆盖 | 中英文切换及第三方设置栏目正常 |
| 模态窗口拖动与外观 | 未确认公开模态窗口 Chrome 替换接口 | 遗留私有面板选择器及偏移操作待退役；Delta 自有组件可管理自身外观 | 不得改变第三方 Dialog | 宿主弹窗可交互，停用后无残留样式 |
| 隐私与受保护会话显示 | 服务侧安全授权为权威；DOM 隐藏不是安全边界 | 保留服务侧 fail-closed；DOM 隐藏/拦截为待迁移的视觉兼容债务 | 不得以视觉隐藏替代访问控制 | 锁定、删除墓碑与 2FA 由 Host 拒绝未经授权命令 |
| 品牌、主题、独立设置 | 已确认 `sidebar.brand.mark/name`、Theme API、`settings.section` | 保留官方 Slot/Service 与生命周期 disposer，停用恢复原生 | 按官方优先级共存 | Slot 卸载、主题释放、设置恢复及 Windows 实机验证 |

## 迁移纪律

- 有公开且可验证的 Slot/Provider，先新增隔离的声明式能力与测试，再移除相应 DOM 路径。
- 无公开接口时保留 Harness 原生，不通过字符串选择器、私有 Store 或合成点击伪装功能实现。
- 已退役“工作区首次折叠”“新会话按钮镜像”“原生搜索输入代理”；上游 `ui-sidebar` 的 `sidebar.workspaces` 为整个原生工作区浏览区的 single Slot，不可用作无损搜索输入插槽；`sidebar.panellist.actions` 仅适用于 More 菜单。现有 Delta 服务式搜索仅限 `[data-sidebar-scrollport]` 的直属 `nav`，结构不匹配时保留原生，不遍历或改动其他导航；尚未取得合适公开 Slot，**不视为完成 #333 或通过 Windows 实机验收**。
- 上游公开接口依据：`deepseek-ai/deepseek-harness@39163dd30f703a79079e2d2446545cff3c453738` 的 `packages/client/ui-sidebar/src/client/contract/slots.ts` 及 `SidebarRoot.tsx`；仅作设计参考，不锁定运行版本。
- 保留插件单体、官方 UI 所有权、停止/卸载回退与第三方插件兼容性；不添加独立客户端、Host Patch 或 A/B 对照测试。
- 真实 Windows Harness 安装、升级、停用恢复、第三方插件共存、长会话稳定性需要独立验证；Central Windows CI 不能替代实机验收。

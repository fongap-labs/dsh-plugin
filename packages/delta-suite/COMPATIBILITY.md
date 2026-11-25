# Delta Suite 宿主兼容性与迁移

现行状态以 [能力就绪清单](../../projects/delta-suite/feature-readiness.json) 为准；验收等级以 [仓库兼容性规范](../../docs/COMPATIBILITY.md) 为准。历史核查证据不代表当前阻塞状态。

## 公开契约与降级

| 能力 | 当前边界 |
| --- | --- |
| Theme / Slots / Settings | 通过公开 Theme API、Slot 和 Cordis 生命周期注册、释放；缺失时保留原生 |
| Locale | 优先只读官方 Locale 快照及订阅；缺失或无有效快照时使用仅监听根元素 lang 属性的可撤销运行时 Patch；只维护 Suite 自己的 zh/en |
| 会话与工作区 | Host 拥有最终权限；Suite 保护策略和操作编排分离，未知身份或保护状态保守拒绝 |
| 搜索与上下文 | 只读公开状态及查询，过滤受保护内容；不重新实现原生上下文压缩 |
| 模型与账户 | 仅公开 Slot 模型/提供方元数据；不读原始凭据，不替代模型选择 |
| Gateway Effort | 自动同步停用；纯适配函数不是已启用服务 |
| MCP | 原生 Host 配置、凭据与启停；不注入私有编辑器 |
| 代理、Vision Bridge | 产品范围外，已移除 |
| 原生布局、菜单、全局语言 | Host 所有；不接管私有 DOM、Store、源码或工作区方法 |

公开 API 阅读基线仅作参考：`deepseek-ai/deepseek-harness@2e39e70496aa02986ca6a820c5d497e816b69d7e`、`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。不绑定运行时版本。

## 运行时 Patch 兼容路径

公开接口优先。缺少接口或接口不能完整满足需求时，先评估局部、可逆、能力检测驱动的 Patch；只有两条路径都不可安全实现时才按功能降级。不得直接改写宿主安装文件、原生词典或凭据，不得恢复历史全局接管。当前首次适配为 Locale 根元素 lang 只读监听：不扫描子树、不写入宿主、官方订阅恢复时停止监听，卸载时撤销。其他未交付原生布局、账号和会话适配须独立提供匹配、撤销及真实宿主证据，不能因本次变更宣称已经支持。

主题模式标记由局部可逆 Patch 管理：记录原值，只恢复仍属于本次激活的标记；语言更新不重复写入，其他插件后续修改不被卸载覆盖。公开 Theme disposer 抛错时，主题切换返回失败，其余资源仍继续释放；不声称宿主失败的 disposer 已成功回收令牌。

侧栏固定导航兼容路径：官方 SidebarRoot 公开的插槽不能控制外层滚动网格；基于源码 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96` 的展开侧栏 scrollport 标记、直接 nav 与相邻 workspace Slot 结构，独立 CSS Patch 将工作区限制在剩余高度，使原生列表承担滚动。仅 Delta 模式生效；检查 CSS 特性，结构不匹配时不应用规则，不移动节点、不修改原生操作、无轮询和监听；官方模式及卸载移除样式。进一步采用 CSS subgrid 保留整个原生 panel nav 在开始会话上方，工作区在其下方；公开 sidebar.panellist 的插件管理（order=0）、定时任务（order=10）沿用宿主排序，后续插件导航统一注册 sidebar.panellist，不能将导航入口占用 sidebar.session.action、工作区或页脚插槽。无需接管第三方组件或改写注册数据。支持具备对应结构和 subgrid 的展开及折叠侧栏；不具备 subgrid 时仅保留基础固定布局。视觉重排不改变 DOM 键盘焦点顺序。真实客户端的滚动、折叠、权限变化、键盘导航及窄窗口表现仍待验证；无法约束不遵守公开插槽约定的第三方插件。

主题公开 API 缺失时，新增基于官方 `data-ds-theme-source` 和 `data-ds-dark-theme` 标记的可撤销 CSS Palette Patch，直接复用同一套 Token，不强制覆盖 inline style。仅已识别的原生亮、暗或系统主题启用；至少验证品牌主色、主文字与菜单背景的计算值，失败立即撤销并报告降级。公开能力恢复时先移除 Patch 再使用原生 API；公开 API 抛错时不叠加补丁，以免未知的部分写入造成冲突。真实宿主的完整级联、动态主题切换和视觉一致性仍待验证。

会话菜单公开服务接入独立于搜索及导航服务，通过 Cordis 声明 `contextMenus` 依赖并按该服务生命周期注册、撤销原生贡献项。工作区目标不支持时仅跳过该贡献，不影响会话菜单；锁定菜单观察 Suite 自有状态，执行时重新读取状态，不复用过时的锁定判断。原生菜单排序仍由 Host 所有，尚未交付重命名置顶的运行时 Patch。实际菜单打开、交互及不同版本仍待实测。

原生菜单注册收敛至独立装配函数，所有 Suite 菜单贡献观察语言和自身状态，拒绝缺失、空白或非字符串标识及已删除会话；动作捕获已确认的身份，不读取变更后的目标对象；服务卸载或部分注册回滚后拒绝旧回调，异步成功提示不再在卸载后显示。未改变原生菜单顺序或 Host 权限。

会话悬浮信息继续使用官方 Slot 与公开目录数据。复制按钮执行前及异步反馈前均校验插件生命周期、外观修订、保护修订与当前会话授权；切换外观、撤销授权或停用后拒绝旧回调。提示定时器及节点独立撤销，单个清理失败不阻断其余资源释放。未增加 DOM 监听、轮询或原生界面接管，真实客户端仍待验证。

## 验收证据

| 项目 | 记录 |
| --- | --- |
| 源码、构建与自动回归 | [#576 中央 CI](https://github.com/fongap-labs/action-worker/actions/runs/45379576656)，提交 `0784e9c90c50408033f9a68fb15bedd64c715616`：Linux、Windows 和 Security 成功 |
| 模块所有权与源码边界 | [中央架构检查 #2028](https://github.com/fongap-labs/action-worker/pull/2028) 已合并 |
| 真实 Harness 安装、启用、停用、卸载及重启 | 未验证 |
| Windows 客户端交互、主题和第三方插件共存 | 未验证 |
| 第二个实际 Host 版本及跨平台兼容性 | 未验证 |

自动化 CI 不等于实际安装验收。保留现行功能就绪布尔值；不得以本次治理宣布 P0/P1 完整宿主交付。

## 迁移与回退

旧 `@fongap-labs/dsh-theme-delta` 与新 `@fongap-labs/delta-suite` 不自动互相覆盖。备份隔离 Profile，先停用旧插件，再安装实际发布的新包。异常时禁用 Suite 并重启，保留原生 Host 和第三方插件；禁止修改 app.asar 或原生资源；只允许经过能力检测、验证和生命周期管理的可撤销运行时 Patch，不恢复历史全局接管。

## 历史证据

- [完整历史兼容性与 31 项静态审计矩阵](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/packages/delta-suite/COMPATIBILITY.md)（固定提交，保留全部原文、日期、PR 与故障记录）。
- [历史原生 DOM 所有权逐项审计](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/docs/DELTA_SUITE_DOM_OWNERSHIP.md)；[当前边界](../../docs/DELTA_SUITE_DOM_OWNERSHIP.md)。
- [历史能力状态记录](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/projects/delta-suite/feature-readiness.json)；现行机器清单保留原有阶段字段供追溯。

新增证据记录源码 SHA、运行链接、Host 构建、操作系统和实际结果。阶段日志写入对应 PR/Issue；不再在发行包兼容性说明里累积历史故障正文。

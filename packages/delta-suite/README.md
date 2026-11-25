# Delta Suite

嵌入 DeepSeek Harness 的原生扩展套件插件，不是独立桌面客户端。

- npm 包名：`@fongap-labs/delta-suite`
- 插件配置条目：`delta-suite`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 原生 Harness 公开接口边界（P0-2）

Delta Suite 优先使用官方公开的 Cordis Service、Slots、Theme、Settings 等能力；缺少公开接口时仅采用经能力检测、局部且可撤销的运行时 Patch。原生头像菜单、Session 既有操作、Workspace 删除授权、模型请求和全部原生语言均由 Harness 保留。

- **不挂载原生界面 DOM 扫描/迁移**：不再启用 `installLiveNativePresentation`，不将原生会话按钮通过 Portal 移至私人选择器，也不包装 Workspace 私有方法。侧栏已实现局部 CSS 固定导航补丁，仍待实机验收；原生右键菜单排序及宿主文案替换未交付。
- **不修改 Harness 源码**：插件发布包不包含 `apply-harness-ui-patch.mjs`，不修改 `app.asar`、全局语言配置或宿主翻译资源。仓库历史脚本不得用于 Delta Suite 插件发行或运行时注入。
- **Gateway Effort 自动同步禁用**：尚未确认官方提供无需读取原始凭据的请求代理接口，故停用 Gateway HTTP `/models` 探测和写入界面；不调用 `credentials.resolve`，不缓存/传递原始 Token。现有无网络纯函数仅供单元验证，不代表已启用功能。
- **保持原生安全行为**：登录/退出、账户授权、真实 Session 操作及模型选择继续由 Harness 自身控制。官方 Session Log 的排除仅依赖 `sessionLogDeepSeek.registerExclusion`，不代表关闭其他遥测。
- **能力缺失降级**：公开接口无法提供时不接管、不显示成功或无效开关；不据此宣布真实客户端已经验收。

对应检查位于 `tests/delta-suite-boundaries.test.mjs`。上述为代码静态整改，实际运行仍须使用官方 Harness 构建、Windows 和不同宿主版本验收。

## Delta Suite 配置入口（仅适用于已安装新构建）

加载并启用 `delta-suite` 后，可以通过 Harness 的官方设置界面找到同一配置页：

- **设置 → Delta Suite**：独立的 `settings.section`。
- **设置 → 插件 → Delta Suite**（英文 Settings → Plugins → Delta Suite）：`settings.plugins.tab` 中的插件配置标签。
- **插件 → 已安装插件 → Delta Suite**（英文 Plugins → Installed plugins → Delta Suite）：官方 `plugins.bundle.config` keyed 插槽，直接在安装包详情页显示同一配置页。

三个入口共享原有设置控制器，可以调整 Delta/官方主题及其他 Suite 选项。停用插件会撤销注册；不修改原生设置按钮、菜单或导航 DOM。

新版发行校验会直接检查实际 ZIP 和 TGZ 内的公共 `settings.section`、`settings.plugins.tab`、按插件包名绑定的 `plugins.bundle.config`、同页配置内容，以及独立模型标签 Slot 注册；缺少入口的旧构建会在发布前被拒绝。模型路由标签不再依赖可选的助手侧栏服务。

**代码合并与 CI 通过并不会自动更新正在运行的 Harness。** 先前安装的历史包不会自动覆盖新 Cordis ID `delta-suite`；必须发布包含新注册的 Suite 构建并在实际使用的 Profile 中安装/启用、重载客户端。若配置入口都不存在，先核实插件加载状态和是否出现 `[delta-suite] Settings mount failed` 或 `deferred Settings registration failed` 日志；不能通过私有 DOM 插入按钮伪装成功。

## 版本与安装验收

通过 [GitHub Releases](https://github.com/fongap-labs/plugins/releases) 查看实际发布的 Delta Suite ZIP/TGZ；源码合并、版本输入或 CI 通过均不等于已经发布或安装。生产发行按 [构建与发布](../../docs/OPERATIONS.md) 操作，版本由操作者选择尚未使用的版本，不在 README 固定下一发行号。

Windows 实机验收使用隔离 Profile：备份并停用旧插件，安装并启用新 Suite，确认三个官方配置入口、主题切换、会话锁及安全回退；停用/卸载并重启后核对原生会话和第三方插件。**真实宿主与第二宿主版本尚未验收**。不做 A/B 测试。

## 当前实现状态

功能交付以 `projects/delta-suite/feature-readiness.json` 为唯一状态源。当前以下五项具备明确的公开扩展接口和源码回归覆盖，并标记为已完成：

1. **原生个性设置**：通过 `settings.section` 注册独立设置栏目。
2. **主题令牌**：通过公开 Theme API 覆盖品牌色，并由 disposer 释放。
3. **品牌插槽**：通过 `sidebar.brand.mark/name` 替换品牌图标和名称。
4. **通用模型名称偏好**：通过 `conversation.input.model.label` 显示公开插槽提供的模型名称，并由独立偏好控制；不读取凭证信息。
5. **DeepSeek Account 路由显示偏好**：同一公开插槽仅在当前模型选中位置显示 `deepseek-account` 的公开提供方名称，支持与模型名称独立开关；候选列表和非此提供方不显示账户标记。

以上仅代表源码与公开接口层面的能力，不代表 Windows 实机验收已经完成。

### 尚未交付

以下能力在 `feature-readiness.json` 中仍为 `false`，不得描述为已实现：

- 侧栏搜索位置、导航顺序及完整间距重排。
- 原生会话运行状态文案替换，以及完整会话悬浮卡布局替换。
- 工作区首次默认折叠、默认工作区删除前置保护。
- Profile 上下文压缩、结构化检查点、原生引用选择、助手侧栏协作。
- 安全输入优化、DeepSeek 模型路由切换、请求脱敏及 MCP 管理。

原生“未分组”行缺少已确认的批量删除菜单扩展接口，Suite 不再全局捕获右键来插入永久删除菜单。Host 批量删除接口及锁定保护仍保留，但相应客户端入口未交付。

网络代理与 Vision Bridge 已从 Suite 产品范围及运行时移除，不再维护相关配置、状态或工具，也不预留自动复活路径。MCP 配置与凭据继续由官方 Host 负责；Gateway Effort 自动同步禁用。

公开的 `sidebar.panellist.actions` 只提供 More 菜单入口；`sidebar.session.row.hover` 只提供悬浮卡装饰区域。Suite 在此插槽内使用公开 Session 目录的 `updatedAt` 添加可选的本地化最近更新时间，并通过 `sessions.list.subscribe` 响应数据变化；无日期、未验证的保护状态、锁定/删除的会话均不显示此内容，也不读取 Host 私有路径。这**不是**完整的原生悬浮卡布局替换，更不意味着完整侧栏重排已经可用。

禁止通过全局接管、私有状态篡改或仅视觉模拟来伪造能力。公开接口优先，缺少接口时允许经能力检测且可撤销的局部 Patch；无法安全适配时保留原生行为，并标记未完成。

## 后续模块规划（尚未验收）

计划继续围绕 `Theme`、`Sidebar`、`Search`、`Conversation`、`Workspace` 和 `Host Adapter` 分层；缺少公开扩展接口的需求评估安全的局部 Patch，不能保证原生行为及回退时不接管。所有可交付能力仍集成在**一个插件包**中，不添加新桌面进程。

## 安装迁移

旧版 `dsh-theme-delta` **不会被此包自动覆盖**。在隔离 Profile 中先停用并卸载旧主题插件，再安装 `delta-suite`，保留官方 `ui-layout`、`ui-renderer`、`ui-theme` 和第三方插件。新包使用独立的 Cordis ID、本地状态命名空间和 Release Key；不得启用新旧两个插件。如果新包启动或渲染失败，直接禁用 `delta-suite` 并重启恢复原生界面，禁止修改 `app.asar` 或隐藏宿主业务按钮。

更名后的插件包使用新的 Cordis ID、npm 名称与 Release Key，不自动覆盖先前安装项。旧 GitHub Tag、Release 与用户设备上的已安装包不改写；迁移前先备份 Profile 并停用旧插件，任何新版本都由手动发布任务明确输入。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
pnpm link:dev delta-suite
```

## 安全与性能边界

公开能力不可用、保护状态未确认或会话身份不一致时，相关插件能力安全降级。搜索使用只读保护策略；不得通过全局 DOM 隐私观察器或原生布局接管替代宿主权限。性能改善必须以真实测试为证据，不从代码拆分推断实机内存、响应速度或稳定性。

## 验收

运行 `pnpm build && pnpm test && pnpm validate` 并通过 Central CI 后，在 Windows Harness 中实际检查已标记为 `true` 的插件加载、设置栏目、主题令牌和品牌插槽，以及停用回退。所有标记为 `false` 的功能均按未交付处理，不得以手工模拟或截图替代真实宿主能力。

## 交付口径

2026-11-12 的 ZIP 导入记录只说明历史源码合入，不构成功能验收证据。是否交付必须同时满足 `feature-readiness.json` 对应能力为 `true`、Central CI 通过，以及所需 Windows 真实宿主验收完成。

## 当前维护边界

- Suite 的 zh/en 自有词典仅用于自己的 UI；官方 Locale 服务可用时只读订阅，中文系列使用 zh、其他语言使用 en；不改动宿主语言偏好或词典。
- 自有组件使用 `--dtd-*` 语义 Token；公开 Theme API 可撤销。主题、上下文投影和本地 TOTP 编码按浏览器编译清单合并到唯一 `lib/client.js`。
- 自建 MCP 凭据编辑器已删除。MCP 服务器配置、凭据及启停均由官方 Harness 所有。
- 当前兼容性和实际证据见 [COMPATIBILITY.md](COMPATIBILITY.md)；此前逐阶段开发记录见 [固定提交历史](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/packages/delta-suite/README.md)，不得恢复旧的宿主源码补丁或已退役能力。

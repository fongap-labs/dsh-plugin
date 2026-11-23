# Delta Suite

嵌入 DeepSeek Harness 的原生扩展套件插件，不是独立桌面客户端。

- npm 包名：`@fongap-labs/delta-suite`
- 插件配置条目：`delta-suite`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 原生 Harness 公开接口边界（P0-2）

Delta Suite 仅使用官方公开的 Cordis Service、Slots、Theme、Settings 等能力。原生侧栏布局、头像菜单、Session 右键既有菜单、Workspace 删除授权、模型请求和全部原生语言均由 Harness 保留。

- **不挂载原生界面 DOM 扫描/迁移**：不再启用 `installLiveNativePresentation`，不将原生会话按钮通过 Portal 移至私人选择器，也不包装 Workspace 私有方法。无法公开实现的原生侧栏重排、原生右键菜单排序、宿主文案替换均保持原生表现，并记录能力缺口。
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

## 首次 Suite 身份的 Beta 安装候选

2026-11-12 的历史发行包与 `delta-suite-v0.1.0-beta.1` 标签不能代表当前 `main`；配置页新增的 `plugins.bundle.config` 和宿主能力提示不会自动出现在已安装旧版中。

当前源码的**下一安装测试候选版本为 `0.1.0-beta.2`**。只在全部代码和中央 CI 门禁通过后，由操作者打开 [Action Worker · 手动发布应用](https://github.com/fongap-labs/action-worker/actions/workflows/release-app.yml)，选择 **Run workflow**，填入：

- `source_repository`：`fongap-labs/plugins`
- `requested_version`：`0.1.0-beta.2`
- `product`：`delta-suite`

发布流程从当前已合并并经过审计的 `main` 构建并校验 `fongap-labs-delta-suite.zip` 和 `.tgz`，发布至相同 GitHub 仓库的 `delta-suite-v0.1.0-beta.2` 预发布版本。正式 Release/附件须等流水线验证成功后才能使用；输入参数本身不代表已发布。无须使用历史旧版 ZIP，也不应将 `delta-suite` 当作独立桌面程序启动。

Windows 实机验收应使用隔离 Profile：先备份并停用旧插件，安装并启用新 Suite；确认三个官方配置入口、Delta/官方主题来回切换、会话锁图标和必要的安全回退，之后停用/卸载、重启 Harness 并核对原生会话与第三方插件未受影响。**这些测试尚未完成**。宿主私有操作拒绝 API、Gateway Reasoning Effort 自动传递和完整侧栏重排不能因发布 Beta 自动标记完成；不做与纯原生 Harness 的 A/B 测试。

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
- 安全输入优化、DeepSeek 模型路由切换、请求脱敏、Vision 和 MCP 管理。

原生“未分组”行缺少已确认的批量删除菜单扩展接口，Suite 不再全局捕获右键来插入永久删除菜单。Host 批量删除接口及锁定保护仍保留，但相应客户端入口未交付。

配置可靠性：Suite 的代理与视觉设置按用户提交顺序写入 Host，并拒绝保存期间或保存前启动的过期读取覆盖最新确认；只有 Harness Host HTTP 接口明确返回成功及有效配置确认时才更新；未加载 Host、接口出错或确认内容不完整时保留原配置，并在设置页显示错误。视觉引擎状态不可访问时立即撤销先前的“就绪”显示，不再返回 `Omni (Mock/Local)` 虚拟成功。这只是客户端配置真实性修复，不代表 Vision 桥接到原生 Composer 的能力已经交付。

Vision 的 Host 侧识别服务和工具可以独立保留；由于没有稳定的公开 Composer/File API，客户端不再抢占 Harness 的全局图片粘贴、拖放事件，也不向原生编辑器私自插入路径或识别文字。原有 Vision 配置与状态不删除，`vision_bridge` 和 `vision_bridge_admission_adapter` 仍保持未交付，待正式 API 与 Windows 实机验证后再启用客户端集成。

公开的 `sidebar.panellist.actions` 只提供 More 菜单入口；`sidebar.session.row.hover` 只提供悬浮卡装饰区域。Suite 在此插槽内使用公开 Session 目录的 `updatedAt` 添加可选的本地化最近更新时间，并通过 `sessions.list.subscribe` 响应数据变化；无日期、未验证的保护状态、锁定/删除的会话均不显示此内容，也不读取 Host 私有路径。这**不是**完整的原生悬浮卡布局替换，更不意味着完整侧栏重排已经可用。

禁止使用宿主 DOM 选择器、私有 CSS 类、私有 Store、React setter monkey-patch 或服务方法替换来伪造能力。宿主不支持的功能必须保留原生行为，并继续标记为未完成。

## 后续模块规划（尚未验收）

计划继续围绕 `Theme`、`Sidebar`、`Search`、`Conversation`、`Workspace` 和 `Host Adapter` 分层；涉及宿主私有状态或缺少公开扩展接口的需求不做兼容性接管。所有可交付能力仍集成在**一个插件包**中，不添加新桌面进程。

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

## 性能与安全优化

隐私观察器跳过普通聊天流的文字和节点更新，但保留会话、工作区、菜单和受保护控件的变化检测；同一隐藏节点重复同步不会再写入相同属性。搜索列表每次渲染只获取一次会话快照。这些优化不减少权限、会话删除保护和官方界面所有权，也不代表已有 Windows 实机性能指标。

## 验收

运行 `pnpm build && pnpm test && pnpm validate` 并通过 Central CI 后，在 Windows Harness 中实际检查已标记为 `true` 的插件加载、设置栏目、主题令牌和品牌插槽，以及停用回退。所有标记为 `false` 的功能均按未交付处理，不得以手工模拟或截图替代真实宿主能力。

## 交付口径

2026-11-12 的 ZIP 导入记录只说明历史源码合入，不构成功能验收证据。是否交付必须同时满足 `feature-readiness.json` 对应能力为 `true`、Central CI 通过，以及所需 Windows 真实宿主验收完成。

## 历史实现记录（已被 P0-2 的公开 API 边界取代）

以下为此前兼容补丁的历史说明，不代表当前插件允许执行它们；新的产品交付判断以本页“原生 Harness 公开接口边界”为准。

## 2026-11-24 Delta 原生界面适配增量

- 侧栏「插件管理、定时任务、开始对话」三行作为固定导航，不随工作区和会话列表滚动；已加载插件的运行时兼容层与客户端源码构建补丁均包含此行为。
- 余额悬浮卡中的金额与“暂无数据”使用常规字重。保留原生余额快照；没有通过验证的日消费接口时仍显示暂无数据，不推测用量。
- 底部“新版本（有更新才显示）→ 设置 → 登录／退出”使用 24px 图标；宽侧栏 Delta 构建中头像点击不弹账号菜单。运行时兼容层不得合成登录凭据或绕过宿主确认流程。
- 首页 16px 鲸鱼垂直微调，底边以“立”字第二横线为视觉基准；移除通用设置的当前版本号行；将聊天状态统一为「任务执行中 / Task in progress」并保留时长占位符。
- 原生 Session Log 服务在 Delta 源码构建补丁中不再贡献 `dsh_session_log`，无论用户旧 Profile 是否将开关存为 true；新配置默认 false，并取消通用设置里的开关注册。已安装插件由 Host 侧 `sessionLogDeepSeek.registerExclusion(() => true)` 阻止日志贡献，Delta 运行时界面同步隐藏误导性开关。这些保护仅在 Delta Suite 启用且注入生效时成立；不能据此宣称官方 Harness 自身默认禁用此功能。
- 「隐私与数据最小化」模块保留标题及 PIN 管理，移除关于“已强制禁用”的描述、条目与徽标，避免把未验证的宿主能力宣传为已完成。
- 颜色统一通过 Delta 的 `--dtd-*` 语义 Token 与 Theme API 映射；官方主题不被全局覆盖。构建补丁须先通过 `--check`；安装插件不等于客户端已应用源码补丁，需分别验证并发布新版本。

## 原生菜单和全局主题覆盖审计（2026-11-24）

- 根因：当前 Harness 的 `design-platform.css` 为各组件定义 155 项 `--dsw-alias-*` / `--dsw-specific-*` / `--dsw-menu-*` 语义色，旧 Delta 主题层仅映射约 50 项；未映射项继续采用原生中性色。同时原生 `MenuSurface` 用 `--dsw-menu-backdrop-filter` 实现透明毛玻璃，即便菜单底色已覆盖也会混入背景。
- 修复：为菜单加不透明材质并禁用背景滤镜，当前上游已定义的 155 个语义色均已通过 `ThemeRuntime.overrideTokens` 映射，覆盖原生背景、卡片、按钮、悬停、文本、图标、输入框、侧栏、弹层、滚动条和内容语义色。该覆盖按 light/dark 成对设置，切回 Official 时清理。
- 安全边界：代码语法高亮、diff 增删、日志状态、危险/成功/警告图形等保留独立语义色，而非全部变成单一蓝绿色。源码补丁的 `--check` 会审计已安装上游主题定义，并报告尚未映射的新 token；报告新项不阻断启动，避免绑定版本。仍需客户端 light/dark、系统平台和第三方插件实机视觉验收。
- 会话右键菜单由原生 `ui-workspace` 注册贡献，按 `order` 排序。客户端源码补丁将 `rename` 的优先级从 200 调为 50，保证实际可访问性/键盘顺序一起变化；已经安装的纯插件无法通过目前的公开 API 重排既有贡献，必须在 Delta 客户端源码构建时应用补丁。

## 安装版本与源码补丁的生效边界（2026-11-24）

- 当前仓库 `main` 合并不代表用户已安装新的 Beta 包；必须按既有人工发布流程生成、安装并在隔离 Profile 中启用更新后的 Delta Suite 包，才能验证插件主题与悬浮卡修改。
- 原生会话菜单项的排序变更在 `scripts/apply-harness-ui-patch.mjs` 中，使用 `--check` 核对宿主源码结构后由客户端构建入口应用；仅更新普通插件无法重排该原生菜单。
- 针对会话信息卡新增 Light/Dark 双主题文字对比度单测（最低 4.5:1），覆盖标题、路径/时间与状态文字；CI 不能替代 Windows 客户端视觉检查。

## P0-3 自有 UI 配色修订（2026-11-24）

Delta 自有弹窗、搜索、MCP 和助手辅助组件只消费 `--dtd-*` 语义 Token，不在缺省链路回退到 Harness `--dsw-*`。浅色/深色颜色、弹窗、按钮与官方 Theme API override/dispose 添加静态回归检查。此修改不控制宿主第三方组件或原生菜单，也不能替代真实 Windows 的主题切换、对比度和回退验收。

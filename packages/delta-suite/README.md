# Delta Suite

嵌入 DeepSeek Harness 的原生扩展套件插件，不是独立桌面客户端。

- npm 包名：`@fongap-labs/delta-suite`
- 插件配置条目：`delta-suite`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## Harness 原生界面适配（按结构检测，不绑定版本）

### 已安装插件的运行时兼容层

独立打包/安装 `delta-suite` 后，新版 Client 会在 **Delta 模式**挂载受限的布局兼容层（`installLiveNativePresentation`）。它会在识别到当前 Harness 实际渲染的侧栏结构时隐藏顶部品牌和无用占位、在空白首页隐藏预览版并将鲸鱼显示到标题右侧、把「插件/自动化任务」导航标签改为「插件管理/定时任务」，并通过**已公开的 `sidebar.session.action` HOC + React Portal**，将原生「开始对话」按钮移动到定时任务下方，保留原生点击处理器、访问权限和快捷键。

运行时以 UI 语义和控件形状检测为准，不读取或比较 Harness 版本号；识别不到可用的导航结构、React Portal 不可用或当前为官方主题时保留原生界面。所有受控文字、ARIA 和节点标记必须在停用插件或切换主题时恢复，不移植或修改 Session 创建业务逻辑。此运行时层与前述 **源码构建阶段补丁**是两个入口：已安装的官方 Harness 不会自行执行仓库中的 `scripts/apply-harness-ui-patch.mjs`。即使 PR 已合并，也必须发布新版插件，用户重新安装/启用并重启，运行时代码才会进入客户端。

已将侧栏底部三图标和余额悬浮卡加入运行时兼容层，但均须安装最新插件并通过 Windows 客户端实测验证，不能把静态测试等同于界面完成。新增运行时 DOM 兼容是对原有“不接管宿主 DOM”规则的**显式且限域的例外**，必须继续评估性能、无障碍和上游改动带来的风险，优先迁移至正式 API。


仅执行仓库内 **源码补丁脚本** 时，Harness 原生侧栏和空白首页仍由宿主管理；这一段描述的是离线客户端构建阶段，不是新版插件中的运行时兼容层。需要将原生「新会话」移动到「定时任务」下方、折叠品牌占位、改变 Hero 图标顺序和宿主页面标题时，**必须在 Delta/Harness 客户端源码构建前应用补丁**。补丁不能修改用户设备上已安装的 Harness 二进制，也不会随 npm 插件加载自动修改宿主源码。

维护在 `scripts/apply-harness-ui-patch.mjs`，根据 Harness 包的 **package.json 身份 + 源码关键结构**定位目标；不比较版本号、Tag、Commit，也不固定安装路径。修改原生 Sidebar、Hero、插件管理、定时任务、账号底部布局、通用设置版本行、会话状态词典与 Session Log 宿主服务及设置注册共 16 个文件。改动严格限定在 Delta 模式的 CSS；中文与英文页面标签从宿主词典源头修改，保留原生按钮、React 事件、权限和快捷键。预览徽标仅在 Delta 模式隐藏，鲸鱼仍为原生 SVG 动画。

使用方式（`<checkout>` 指已经检出的 Harness/Delta 源码根目录，而非 `app.asar`）：

```sh
node packages/delta-suite/scripts/apply-harness-ui-patch.mjs --root <checkout> --check
node packages/delta-suite/scripts/apply-harness-ui-patch.mjs --root <checkout> --apply
```

先 `--check`，确认所有锚点可匹配，再 `--apply`。脚本在**所有目标检查成功后**才开始写入，可重复执行；如果上游改名、搬迁或改变 JSX/CSS/文案结构，会明确报错并停止，不猜测并不悄悄跳过。完成后由客户端本身的类型检查、UI 测试和 Windows 实机截图验收。当前补丁不自动为尚未具备源码构建流水线的 Delta 仓库接入构建；发布 npm 插件并不等于此布局已经在最终客户端生效。

宽侧栏底部采用一行图标布局：左侧为原生账号头像（无登录时为 24px 鲸鱼），右侧按顺序显示**有可用更新时的原生更新通知 → 设置 → 登录／退出登录**，所有图标视觉尺寸为 24px；源码构建补丁下，Delta 宽侧栏头像点击不再弹出账号菜单，仅悬停展示余额卡；设置与登录／退出通过独立按钮触发并保留原生运行任务检查及确认对话框。切换到官方主题或窄侧栏仍保留原生账号菜单。连接状态提示仍由宿主管理；窄侧栏保留原生菜单。新增布局仅在 Delta 主题启用后生效；额外图标借助原生菜单转发完成操作，不复制登录或更新业务状态，宿主结构无法识别时保留原行为。

登录后的账号头像支持鼠标悬停和键盘聚焦悬浮卡片，余额复用宿主 `getBalance` 的已脱敏钱包数据及原生货币格式化函数，不读取或保存账号 token；不额外读取凭据，也不发起新的余额接口请求，仅展示原生账号服务提供的当前快照。悬浮卡片的「今日消费」以 DeepSeek 平台 `/api/v0/usage/by_api_key/cost` 作为**候选官网口径**，要求 Host 端只读访问已授权账号、验证覆盖全部 API Key、与官网用量页一致的时区及 `[start,end)` 自然日区间、币种和金额字段，并以真实账号数据做对账验收。**目前尚无受验收的消费接口**，卡片继续显示“暂无数据／Unavailable”；接口不可用、鉴权失败或证据不完整时**不自动使用余额下降代替消费**，也不使用推测 Token 消耗或伪造 0 元。如未来需要余额差额，必须另列「余额净减少（估算）」，仅在完整零点基线且没有充值等干扰时显示；不得标注为官网消费。待 Host 接口通过实际鉴权、统计范围及时区验收后，才允许接入真实消费展示。用户仍可通过现有账号设置页进入平台用量页面。未登录、不在 Delta 模式或打开原生账号菜单时不显示卡片；已打过上一版底部布局补丁的源码支持增量应用悬浮功能。

预期宽侧栏顺序为 **插件管理 → 定时任务 → 开始对话**（仅在两项均存在时隐藏“更多”；原生未固定项目仍保留恢复入口），新会话实际处理器原样保留；窄侧栏/Windows 标题栏沿用原生创建入口。任务页面标题按「定时任务」执行，与页面用途保持一致。

## Gateway Reasoning Effort（公开模型目录兼容）

本套件的 `decodeGatewayReasoningCatalog`、`toHarnessReasoningEfforts`、`mapGatewayReasoningChoice` 和 `previewGatewayReasoningSync` 仍为无网络副作用的纯接口。另有 Harness 官方 Models 页面底部的 **Gateway 推理等级同步** 扩展区域：用户仅指定 Provider 设置命名空间，点击「读取当前会话并预览 Gateway」后，界面从 Harness 公开的 per-Session `modelDirectories` 获取当前 Provider/模型/Effort，再，插件 Host 侧才使用已配置的 Gateway HTTPS 地址和当前 Host Credential 请求 `/models`，返回等级差异；勾选明确批准后，才通过 Host `settings.mutate` 的版本化配置写入修改该模型。浏览器不接触或持久化 API Key，服务不在启动时主动刷新或探测；当前 Off 在原生适配器中仍不受支持。Gateway 模型的可选等级属于当前访问 Key 的请求范围，`native_confirmed` 不等于所有物理节点承诺。`Default` 不发送思考字段，显式 `Off` 的 Gateway 协议意图是 `none`（OpenAI 兼容）或 `thinking.type=disabled`（Anthropic）；但当前 Harness `llm-pi-ai` 把 Off 序列化为省略字段，因此 `toHarnessReasoningEfforts` **不向原生模型菜单声明 Off**。这两种语义不可混同。详见 [Gateway Effort 契约](../../docs/DELTA_SUITE_GATEWAY_REASONING.md)。

只有 Harness 已经公开的原生模型目录与 Effort 选择器负责真实用户选择和持久化；Delta 的模型标签仅提示 Host 已声明的等级，没有模型网络探测、凭据读取、菜单替换或自动配置写入。**目前不意味着模型目录自动从 Gateway 同步至 Harness，也不表示 #280 完成。**

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

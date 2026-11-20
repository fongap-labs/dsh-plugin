# Delta Suite · Delta 扩展套件

嵌入 DeepSeek Harness 的原生扩展套件插件，不是独立桌面客户端。

- npm 包名：`@fongap-labs/dsh-delta-suite`
- 插件配置条目：`dsh-delta-suite`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## Delta Suite 配置入口（仅适用于已安装新构建）

加载并启用 `dsh-delta-suite` 后，可以通过 Harness 的官方设置界面找到同一配置页：

- **设置 → Delta 扩展套件**（英文 Delta Suite）：独立的 `settings.section`。
- **设置 → 插件 → Delta 扩展套件**（英文 Settings → Plugins → Delta Suite）：`settings.plugins.tab` 中的插件配置标签。
- **插件 → 已安装插件 → Delta Suite**（英文 Plugins → Installed plugins → Delta Suite）：官方 `plugins.bundle.config` keyed 插槽，直接在安装包详情页显示同一配置页。

三个入口共享原有设置控制器，可以调整 Delta/官方主题及其他 Suite 选项。停用插件会撤销注册；不修改原生设置按钮、菜单或导航 DOM。

新版发行校验会直接检查实际 ZIP 和 TGZ 内的公共 `settings.section`、`settings.plugins.tab`、按插件包名绑定的 `plugins.bundle.config`、同页配置内容，以及独立模型标签 Slot 注册；缺少入口的旧构建会在发布前被拒绝。模型路由标签不再依赖可选的助手侧栏服务。

**代码合并与 CI 通过并不会自动更新正在运行的 Harness。** 先前安装的历史包不会自动覆盖新 Cordis ID `dsh-delta-suite`；必须发布包含新注册的 Suite 构建并在实际使用的 Profile 中安装/启用、重载客户端。若配置入口都不存在，先核实插件加载状态和是否出现 `[dsh-delta-suite] Settings mount failed` 或 `deferred Settings registration failed` 日志；不能通过私有 DOM 插入按钮伪装成功。

## 首次 Suite 身份的 Beta 安装候选

2026-11-12 的历史发行包与 `dsh-delta-suite-v0.1.0-beta.1` 标签不能代表当前 `main`；配置页新增的 `plugins.bundle.config` 和宿主能力提示不会自动出现在已安装旧版中。

当前源码的**下一安装测试候选版本为 `0.1.0-beta.2`**。只在全部代码和中央 CI 门禁通过后，由操作者打开 [Action Worker · 手动发布应用](https://github.com/fongap-labs/action-worker/actions/workflows/release-app.yml)，选择 **Run workflow**，填入：

- `source_repository`：`fongap-labs/dsh-plugin`
- `requested_version`：`0.1.0-beta.2`
- `product`：`dsh-delta-suite`

发布流程从当前已合并并经过审计的 `main` 构建并校验 `fongap-labs-dsh-delta-suite.zip` 和 `.tgz`，发布至相同 GitHub 仓库的 `dsh-delta-suite-v0.1.0-beta.2` 预发布版本。正式 Release/附件须等流水线验证成功后才能使用；输入参数本身不代表已发布。无须使用历史旧版 ZIP，也不应将 `dsh-delta-suite` 当作独立桌面程序启动。

Windows 实机验收应使用隔离 Profile：先备份并停用旧插件，安装并启用新 Suite；确认三个官方配置入口、Delta/官方主题来回切换、会话锁图标和必要的安全回退，之后停用/卸载、重启 Harness 并核对原生会话与第三方插件未受影响。**这些测试尚未完成**。宿主私有操作拒绝 API、Gateway Reasoning Effort 自动传递和完整侧栏重排不能因发布 Beta 自动标记完成；不做与纯原生 Harness 的 A/B 测试。

## 当前实现状态

功能交付以 `projects/dsh-delta-suite/feature-readiness.json` 为唯一状态源。当前以下五项具备明确的公开扩展接口和源码回归覆盖，并标记为已完成：

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

Vision 的 Host 侧识别服务和工具可以独立保留；由于没有稳定的公开 Composer/File API，客户端不再抢占 Harness 的全局图片粘贴、拖放事件，也不向原生编辑器私自插入路径或识别文字。原有 Vision 配置与状态不删除，`vision_bridge` 和 `vision_bridge_admission_adapter` 仍保持未交付，待正式 API 与 Windows 实机验证后再启用客户端集成。

公开的 `sidebar.panellist.actions` 只提供 More 菜单入口；`sidebar.session.row.hover` 只提供悬浮卡装饰区域。Suite 在此插槽内使用公开 Session 目录的 `updatedAt` 添加可选的本地化最近更新时间，并通过 `sessions.list.subscribe` 响应数据变化；无日期、未验证的保护状态、锁定/删除的会话均不显示此内容，也不读取 Host 私有路径。这**不是**完整的原生悬浮卡布局替换，更不意味着完整侧栏重排已经可用。

禁止使用宿主 DOM 选择器、私有 CSS 类、私有 Store、React setter monkey-patch 或服务方法替换来伪造能力。宿主不支持的功能必须保留原生行为，并继续标记为未完成。

## 后续模块规划（尚未验收）

计划继续围绕 `Theme`、`Sidebar`、`Search`、`Conversation`、`Workspace` 和 `Host Adapter` 分层；涉及宿主私有状态或缺少公开扩展接口的需求不做兼容性接管。所有可交付能力仍集成在**一个插件包**中，不添加新桌面进程。

## 安装迁移

旧版 `dsh-theme-delta` **不会被此包自动覆盖**。在隔离 Profile 中先停用并卸载旧主题插件，再安装 `dsh-delta-suite`，保留官方 `ui-layout`、`ui-renderer`、`ui-theme` 和第三方插件。新包使用独立的 Cordis ID、本地状态命名空间和 Release Key；不得启用新旧两个插件。如果新包启动或渲染失败，直接禁用 `dsh-delta-suite` 并重启恢复原生界面，禁止修改 `app.asar` 或隐藏宿主业务按钮。

更名后的插件包使用新的 Cordis ID、npm 名称与 Release Key，不自动覆盖先前安装项。旧 GitHub Tag、Release 与用户设备上的已安装包不改写；迁移前先备份 Profile 并停用旧插件，任何新版本都由手动发布任务明确输入。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
pnpm link:dev dsh-delta-suite
```

## 性能与安全优化

隐私观察器跳过普通聊天流的文字和节点更新，但保留会话、工作区、菜单和受保护控件的变化检测；同一隐藏节点重复同步不会再写入相同属性。搜索列表每次渲染只获取一次会话快照。这些优化不减少权限、会话删除保护和官方界面所有权，也不代表已有 Windows 实机性能指标。

## 验收

运行 `pnpm build && pnpm test && pnpm validate` 并通过 Central CI 后，在 Windows Harness 中实际检查已标记为 `true` 的插件加载、设置栏目、主题令牌和品牌插槽，以及停用回退。所有标记为 `false` 的功能均按未交付处理，不得以手工模拟或截图替代真实宿主能力。

## 交付口径

2026-11-12 的 ZIP 导入记录只说明历史源码合入，不构成功能验收证据。是否交付必须同时满足 `feature-readiness.json` 对应能力为 `true`、Central CI 通过，以及所需 Windows 真实宿主验收完成。

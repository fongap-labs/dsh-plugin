# Delta Suite · Delta 扩展套件

嵌入 DeepSeek Harness 的原生扩展套件插件，不是独立桌面客户端。

- npm 包名：`@fongap-labs/dsh-delta-suite`
- 插件配置条目：`dsh-delta-suite`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## Delta Suite 配置入口（仅适用于已安装新构建）

加载并启用 `dsh-delta-suite` 后，可以通过 Harness 的官方设置界面找到同一配置页：

- **设置 → Delta 扩展套件**（英文 Delta Suite）：独立的 `settings.section`。
- **设置 → 插件 → Delta 扩展套件**（英文 Settings → Plugins → Delta Suite）：`settings.plugins.tab` 中的插件配置标签。

两个入口共享原有设置控制器，可以调整 Delta/官方主题及其他 Suite 选项。停用插件会撤销注册；不修改原生设置按钮、菜单或导航 DOM。

**代码合并与 CI 通过并不会自动更新正在运行的 Harness。** 先前安装的历史包不会自动覆盖新 Cordis ID `dsh-delta-suite`；必须发布包含新注册的 Suite 构建并在实际使用的 Profile 中安装/启用、重载客户端。若两个入口都不存在，先核实插件加载状态和是否出现 `[dsh-delta-suite] Settings mount failed` 或 `deferred Settings registration failed` 日志；不能通过私有 DOM 插入按钮伪装成功。

## 当前实现状态

功能交付以 `projects/dsh-delta-suite/feature-readiness.json` 为唯一状态源。当前以下四项具备明确的公开扩展接口和源码回归覆盖，并标记为已完成：

1. **原生个性设置**：通过 `settings.section` 注册独立设置栏目。
2. **主题令牌**：通过公开 Theme API 覆盖品牌色，并由 disposer 释放。
3. **品牌插槽**：通过 `sidebar.brand.mark/name` 替换品牌图标和名称。
4. **通用模型名称偏好**：通过 `conversation.input.model.label` 显示公开插槽提供的模型名称，并由独立偏好控制；不读取凭证信息。

以上仅代表源码与公开接口层面的能力，不代表 Windows 实机验收已经完成。

### 尚未交付

以下能力在 `feature-readiness.json` 中仍为 `false`，不得描述为已实现：

- 侧栏搜索位置、导航顺序及完整间距重排。
- 原生会话运行状态文案替换，以及完整会话悬浮卡布局替换。
- 工作区首次默认折叠、默认工作区删除前置保护。
- Profile 上下文压缩、结构化检查点、原生引用选择、助手侧栏协作。
- 安全输入优化、DeepSeek Account 路由显示偏好、DeepSeek 模型路由切换、请求脱敏、Vision 和 MCP 管理。

公开的 `sidebar.panellist.actions` 只提供 More 菜单入口；`sidebar.session.row.hover` 只提供悬浮卡装饰区域，均不能据此推断完整侧栏重排或悬浮卡替换已可实现。

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

## 验收

运行 `pnpm build && pnpm test && pnpm validate` 并通过 Central CI 后，在 Windows Harness 中实际检查已标记为 `true` 的插件加载、设置栏目、主题令牌和品牌插槽，以及停用回退。所有标记为 `false` 的功能均按未交付处理，不得以手工模拟或截图替代真实宿主能力。

## 交付口径

2026-11-12 的 ZIP 导入记录只说明历史源码合入，不构成功能验收证据。是否交付必须同时满足 `feature-readiness.json` 对应能力为 `true`、Central CI 通过，以及所需 Windows 真实宿主验收完成。

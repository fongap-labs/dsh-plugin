# Delta Desktop · Delta 桌面

独立的 DeepSeek Harness 原生界面插件。

- npm 包名：`@fongap-labs/dsh-delta-desktop`
- 插件配置条目：`dsh-delta-desktop`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 当前实现状态

功能交付以 `projects/dsh-delta-desktop/feature-readiness.json` 为唯一状态源。当前只有以下三项具备明确的公开扩展接口并标记为已完成：

1. **原生个性设置**：通过 `settings.section` 注册独立设置栏目。
2. **主题令牌**：通过公开 Theme API 覆盖品牌色，并由 disposer 释放。
3. **品牌插槽**：通过 `sidebar.brand.mark/name` 替换品牌图标和名称。

以上仅代表源码与公开接口层面的能力，不代表 Windows 实机验收已经完成。

### 尚未交付

以下能力在 `feature-readiness.json` 中仍为 `false`，不得描述为已实现：

- 侧栏搜索位置、导航顺序及完整间距重排。
- 原生会话运行状态文案替换，以及完整会话悬浮卡布局替换。
- 工作区首次默认折叠、默认工作区删除前置保护。
- Profile 上下文压缩、结构化检查点、原生引用选择、助手侧栏协作。
- 安全输入优化、模型标签/路由偏好、请求脱敏、Vision 和 MCP 管理的完整宿主验收。

公开的 `sidebar.panellist.actions` 只提供 More 菜单入口；`sidebar.session.row.hover` 只提供悬浮卡装饰区域，均不能据此推断完整侧栏重排或悬浮卡替换已可实现。

禁止使用宿主 DOM 选择器、私有 CSS 类、私有 Store、React setter monkey-patch 或服务方法替换来伪造能力。宿主不支持的功能必须保留原生行为，并继续标记为未完成。

## 模块规划

`Theme`（配色与语言） / `Sidebar`（导航重排和输入框） / `Search`（会话、内容、工作区及插件搜索） / `Conversation`（对话状态和预览标识） / `Workspace`（视图状态、删除前校验） / `Host Adapter`（公开服务和策略）。所有模块集成在**一个插件包**中，不添加新桌面进程。

## 安装迁移

旧版 `dsh-theme-delta` **不会被此包自动覆盖**。在隔离 Profile 中先停用并卸载旧主题插件，再安装 `dsh-delta-desktop`，保留官方 `ui-layout`、`ui-renderer`、`ui-theme` 和第三方插件。新包使用独立的 Cordis ID、本地状态命名空间和 Release Key；不得启用新旧两个插件。如果新包启动或渲染失败，直接禁用 `dsh-delta-desktop` 并重启恢复原生界面，禁止修改 `app.asar` 或隐藏宿主业务按钮。

历史 `dsh-delta-desktop` 标识曾出现于旧版更新日志，不能覆盖旧 GitHub Tag 或重复使用已发布的版本号。任何新版本都由手动发布任务明确输入。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
pnpm link:dev dsh-delta-desktop
```

## 验收

运行 `pnpm build && pnpm test && pnpm validate` 并通过 Central CI 后，需在 Windows Harness 中实际检查插件加载、对话、搜索、工作区保护、主题切换、停用回退及第三方插件兼容性。任何未通过项不得声称已经完成实机交付。

## 合并说明（2026-11-12）

UI/界面实现以提供的 ZIP 为准；保留主仓原有的模型请求脱敏、Vision 桥接、上下文压缩投影及对应配置。新的 Host 会话/搜索/代理/隐私模块在原有能力上增量挂载。旧源码文件未被 ZIP 显式替代的仍保留。

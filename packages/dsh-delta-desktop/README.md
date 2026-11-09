# Delta Desktop · Delta 桌面

独立的 DeepSeek Harness 原生界面插件。

- npm 包名：`@fongap-labs/dsh-delta-desktop`
- 插件配置条目：`dsh-delta-desktop`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 已实现与受限能力

设置页可查看服务驱动搜索适配状态（等待服务、等待侧栏、已挂载、官方外观已停用），用于区分外观已启用与实际搜索入口就绪。

当前使用官方接口实现的是：个性设置、Delta/官方配色切换、侧栏品牌标识替换、通过宿主 Session Controller、Workspace Controller、UiWorkspace、Layout 服务提供的会话及工作区名称搜索、原生导航及插件管理/定时任务/开始对话快捷入口，以及在宿主已声明的会话悬浮插槽中附加会话编号和复制操作。官方会话、模型、插件、审批和窗口布局仍由宿主管理。

工作区搜索仅匹配宿主公开列表的显示名称，并通过 `uiWorkspace.openWorkspace()` 导航；不检索、显示或复制工作目录路径。会话搜索在打开前复核宿主公开的 `archivedSessionIds`；已归档、加载中或无法验证归档状态时拒绝快捷导航，并提示使用宿主官方列表，以免绕过原生归档保护。没有原生导航面板时，插件自有搜索仍可独立挂载。工作区视图展开与删除操作完全由宿主拥有。

**尚未实现**：原生搜索框完全搬迁（当前采用插件自有搜索框和快捷操作并保留原生搜索与导航）、侧栏导航重排、会话状态文案替换、工作区默认折叠和默认工作区业务层删除校验。不修改 Harness 上游；当前采用可撤销的版本限定适配器，未来需要对上述缺失能力实现独立、可验证的兼容策略。旧版依靠私有 DOM 选择器和 `workspaceRegistry.delete` 方法替换的实现已撤销，因为在 Windows 实机不能可靠生效，且会绕过宿主正式业务边界。

当前 `projects/dsh-delta-desktop/feature-readiness.json` 对未验收功能标记 `false`，`build-release.mjs` 会拒绝发布不完整版本。设置页会明确说明“已启用”仅指外观模块，不代表完整桌面布局已生效。参考 [兼容性说明](COMPATIBILITY.md) 和 [功能任务 #190](https://github.com/fongap-labs/dsh-plugin/issues/190)。

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

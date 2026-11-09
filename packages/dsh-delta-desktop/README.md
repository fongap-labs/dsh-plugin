# Delta Desktop · Delta 桌面

独立的 DeepSeek Harness 原生界面插件。

- npm 包名：`@fongap-labs/dsh-delta-desktop`
- 插件配置条目：`dsh-delta-desktop`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 现有功能

目前实现了原生设置页的“个性设置 / Personalization”、独立品牌色与官方主题切换。设置项随插件停用卸载；UI 服务延迟激活以避免可选服务导致原生启动失败。尚未实现完整侧栏、搜索、会话及工作区接管，不将已有主题功能冒充完整 Delta UI。

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

## 未完成的用户需求

搜索框取代顶部品牌按钮；插件管理、定时任务、开始对话按规定顺序、语言和间距排列；移除预览版；“任务执行中”多语言状态；会话悬浮卡片去除路径并重新排列状态/时间；工作区默认折叠；默认工作区仅在无会话且存在其他工作区时允许删除。

**实现必须通过受支持的组件适配/宿主服务，工作区删除保护须落在 Host 真实删除命令前。** 仅有 CSS 或测试模拟不能证明这些需求完成。真实 Windows Harness 安装、卸载、切换及对话仍需完成验收。

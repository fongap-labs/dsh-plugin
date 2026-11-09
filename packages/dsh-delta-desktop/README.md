# Delta Desktop · Delta 桌面

独立的 DeepSeek Harness 原生界面插件。

- npm 包名：`@fongap-labs/dsh-delta-desktop`
- 插件配置条目：`dsh-delta-desktop`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 现有功能

本包提供原生“个性设置”、Delta/官方主题切换、品牌替换，以及基于 Harness 0.2.2-rc.1 公开源码结构的侧栏兼容适配：搜索在插件管理前、插件管理与定时任务排序、开始对话原生命令代理、工作区首次折叠、会话状态与时间样式、悬浮路径隐藏和右下角通知。默认工作区删除须满足“没有会话且存在其他工作区”，规则同时部署在客户端和宿主 WorkspaceRegistry 删除入口。所有新增 DOM 节点在关闭 Delta 外观或停用插件时清理。

这一兼容方案不修改 `app.asar`，也不替换 Harness 的执行、会话和插件服务。代码和模拟契约测试通过后仍需要 Windows 真实宿主验收；宿主 DOM 版本变化可能导致兼容适配回退，不能将源码符合等同于实机已验证。

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

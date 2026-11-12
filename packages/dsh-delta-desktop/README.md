# Delta Desktop · Delta 桌面

独立的 DeepSeek Harness 原生界面插件。

- npm 包名：`@fongap-labs/dsh-delta-desktop`
- 插件配置条目：`dsh-delta-desktop`
- 源码版本仅保留 `0.0.0` 占位；真实发行版本由 Action Worker 手动发布时指定。

## 功能实现与 7 大模块交付

本插件针对 DeepSeek Harness 原生界面，完整实现了 7 大核心模块的功能与视觉重塑：

1. **左侧导航**：移除顶部 DeepSeek Harness Logo，统一调整搜索框、插件管理、定时任务、开始对话的排列顺序，保持 8px 统一间距与组件圆角高度。
2. **会话搜索**：保留 Harness 原生搜索能力，将入口移至左侧导航顶部，通过原生事件代理与 React setter 联动，并在 Escape 键时快速清空恢复。
3. **会话列表**：优化会话卡片悬浮动效与高度，时间采用 `tabular-nums` 规整显示，在会话悬浮卡中扩展会话编号及一键复制，彻底隐藏工作目录路径。
4. **工作区**：首次加载默认折叠所有未配置展开偏好的工作区；完整保留原生文件夹重命名与新建等操作；在客户端服务层对默认工作区增加删除拦截保护并弹出提示。
5. **个性设置**：接入原生设置界面，提供独立的「个性设置」面板，支持在 Delta 与官方主题之间一键无缝热切换。
6. **视觉体验**：应用浅色 `#286F78`、深色 `#60B4BF` 核心品牌青，覆盖品牌、主要按钮、发送按钮（`.GRgSLq_primary`）、输入框焦点环（2px teal）及状态提示。
7. **插件生命周期**：启用立即生效；切换至官方外观或停用插件时完全释放所有 DOM 节点与样式注入，恢复原生界面，不影响原生对话、会话历史与第三方插件。

功能尚需根据仓库 `projects/dsh-delta-desktop/feature-readiness.json` 的实时门禁和 Windows 实机验证确认；不得以本地编译通过代替验收。参考 [兼容性说明](COMPATIBILITY.md)。

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

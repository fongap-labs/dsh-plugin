# Delta Desktop（Delta 桌面）

基于 DeepSeek Harness **原生插件机制**的可扩展桌面体验。只有一个 Delta 桌面安装包，保留 Harness 原生模型、会话、工具、审批和其他插件。

## 仓库结构

- `packages/dsh-delta-desktop`：Delta Desktop，提供主题、搜索、会话辅助、Profile 级自动上下文压缩和独立设置；完整布局仍受 Harness 公开插槽能力限制。
- `packages/dsh-delta-code`：独立的 Delta 编程助手。
- `packages/shared`：无产品状态的通用工具和安全封装。
- `projects/dsh-delta-desktop/release.manifest.json`：Action Worker 的单产品发布清单。

**旧 `dsh-delta-desktop` 的自建网页、Host 路由和专属服务已从源码移除**，不再提供 `/dsh-ui-delta/app`。旧 `dsh-ui-delta` / `dsh-theme-delta` 开发目录亦已移除；旧版 Git Tag、Release 和历史记录不改写。安装新插件前应停用旧插件，先在隔离 Profile 中验收。

## 功能扩展

这是一个插件包，内部允许多个功能模块及设置栏目，不会将后续功能强制限制在“个性设置”。

每个模块须分别声明宿主依赖、配置/本地化、生命周期和失败回退。只有能力真正接通时才向 `settings.section` 注册独立设置页，避免出现无法生效的按钮或虚假开关。详见 [架构](docs/ARCHITECTURE.md) 和 [包内 README](packages/dsh-delta-desktop/README.md)。

Delta Desktop 的上下文功能组合 Harness 原生 `dsh-compaction-basic`、`message-quotes` 和公开 Client 插槽。Profile 层压缩后端在主会话与侧栏会话的模型请求前处理高压力上下文，并将较早消息压成结构化 checkpoint；不会删除会话原始日志。引用、侧栏、输入优化及显示开关的使用方式和实机验收边界见 [包内说明](packages/dsh-delta-desktop/README.md)。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
```

## 发行

源码中的 `package.json.version` 恒为 `0.0.0`，不随 PR 变更。统一由 Action Worker 手动发布（选择 `product=dsh-delta-desktop`，填写 `requested_version`），旧版本不得覆盖。未通过真实 Windows Harness 会话、停用和恢复测试前，不能称为正式可用。

## 许可证

本仓库自行拥有版权的代码以 [MIT License](LICENSE) 开源，各插件包及共享模块同样采用 MIT。第三方依赖及其原有版权和许可条款不因此变更；历史发行版本的既有许可证保持不变。

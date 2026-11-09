# Delta Desktop（Delta 桌面）

基于 DeepSeek Harness **原生插件机制**的可扩展桌面体验。只有一个 Delta 桌面安装包，保留 Harness 原生模型、会话、工具、审批和其他插件。

## 仓库结构

- `packages/dsh-desktop-delta`：Delta Desktop，内部可扩展主题、设置、导航、搜索、对话、工作区及 Host 适配。当前仅实现主题和独立个性设置。
- `packages/dsh-code-worker`：独立的 Delta 编程助手。
- `packages/shared`：无产品状态的通用工具和安全封装。
- `projects/dsh-desktop-delta/release.manifest.json`：Action Worker 的单产品发布清单。

**旧 `dsh-desktop-delta` 的自建网页、Host 路由和专属服务已从源码移除**，不再提供 `/dsh-ui-delta/app`。旧 `dsh-ui-delta` / `dsh-theme-delta` 开发目录亦已移除；旧版 Git Tag、Release 和历史记录不改写。安装新插件前应停用旧插件，先在隔离 Profile 中验收。

## 功能扩展

这是一个插件包，内部允许多个功能模块及设置栏目，不会将后续功能强制限制在“个性设置”。

每个模块须分别声明宿主依赖、配置/本地化、生命周期和失败回退。只有能力真正接通时才向 `settings.section` 注册独立设置页，避免出现无法生效的按钮或虚假开关。详见 [架构](docs/ARCHITECTURE.md) 和 [包内 README](packages/dsh-desktop-delta/README.md)。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
```

## 发行

源码中的 `package.json.version` 恒为 `0.0.0`，不随 PR 变更。统一由 Action Worker 手动发布（选择 `product=dsh-desktop-delta`，填写 `requested_version`），旧版本不得覆盖。未通过真实 Windows Harness 会话、停用和恢复测试前，不能称为正式可用。

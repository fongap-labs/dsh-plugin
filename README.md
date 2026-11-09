# DSH 插件仓库

多插件工作区。各插件独立安装、版本管理与发布；中央检查和发布由 Action Worker 负责。

- `packages/dsh-theme-delta`：Delta 主题，通过官方扩展点增强原生客户端外观与快捷操作。
- `packages/dsh-desktop-delta`：历史 Delta Desktop 独立界面插件，已停止新功能开发；保留源码及 Release。
- `packages/dsh-code-worker`：独立编码助手插件。

使用方式见各插件 README。开发命令：`pnpm install --frozen-lockfile && pnpm build && pnpm test && pnpm validate`。

项目架构在 `docs/ARCHITECTURE.md`，各插件独立发布清单位于 `projects/<plugin>/release.manifest.json`。

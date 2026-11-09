# Delta Desktop（Delta 桌面）

许可证：Apache-2.0。原先的 Delta Suite Release 保留为历史记录，不是新包。

Delta Desktop 是基于 DeepSeek Harness 运行内核的独立界面。单一插件 `@fongap-labs/dsh-desktop-delta`，不再提供 Tauri 桌面产品或 Delta Suite 原生 UI 注入。

## 结构

- `packages/dsh-desktop-delta`：独立对话 UI 和 Harness Host 插件（唯一 Delta 产品）。
- `packages/dsh-code-worker`：独立编码助手插件。
- `projects/dsh-desktop-delta/release.manifest.json`：便携 Bundle 发布清单（zip、tgz）。

## 使用

通过 GitHub Release 安装最新 `dsh-desktop-delta-v<版本>` 的 `fongap-labs-dsh-desktop-delta.tgz`。打开由 Harness 提供的带令牌启动地址完成一次认证后，在同一浏览器访问 `/dsh-ui-delta/app`，使用 Delta Desktop 独立界面。启动 Harness 时建议使用 `--no-open`，避免同时打开原生页面。旧 `.dsh-ui-delta` 配置目录和 `/dsh-ui-delta` 服务路径保留兼容。

main 已合并的功能不等于已发布的安装包。安装前请查看 GitHub Releases 中是否存在目标版本；不要把旧 `dsh-suite-delta` 安装包当成新包。可通过 `pnpm view @fongap-labs/dsh-desktop-delta versions --json --registry https://registry.npmjs.org` 查询 npm 发行版本。

## 开发

`pnpm install --frozen-lockfile`、`pnpm build`、`pnpm test`。发布由 Action Worker 按 `projects/dsh-desktop-delta/release.manifest.json` 执行。

当前独立 UI 仍处早期：完整 Markdown、复杂工具审批、文件/模型/设置 UI 尚未完全迁移。Harness 依然管理会话、权限、模型和工具。正式验证以实际运行结果为准。

## Delta 主题（新增独立插件）

`packages/dsh-theme-delta` 是通过官方扩展接口增强原生客户端主题与快捷操作的独立插件，包名为 `@fongap-labs/dsh-theme-delta`。其发布配置见 `projects/dsh-theme-delta/release.manifest.json`，安装、停用和恢复说明见包内 README。该插件不替换官方根布局；完整布局交接和真实宿主安装尚待验收。

## 插件版本管理

插件源码中的 `package.json.version` 固定为 `0.0.0` 占位值，包括本仓库根项目；它不是对外发行版本，也不得随功能提交递增。**唯一发布入口**是 Action Worker 的“手动 · 发布应用”，人工填写 `source_repository`、`product` 和 `requested_version`，该仓库不允许留空让流水线自动推算。构建脚本仅在隔离发布工作区临时把填写的版本注入产物，完成后恢复占位值。不得通过 Git Tag、普通 CI、提交历史或 `pnpm release` 自动发布插件。发布后的版本只以独立 Release Tag、资产和发行记录为准。

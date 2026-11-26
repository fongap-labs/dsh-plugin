# Delta / DeepSeek Harness 共用插件

文档导航：[文档索引](docs/README.md)


本仓库是 Delta 与 DeepSeek Harness 共用插件的 monorepo，包含 **Delta UI、Delta Code、Delta Suite 三个相互独立的插件项目**。它们共享仓库和构建入口，但各自拥有独立包名、插件入口、运行时生命周期、功能范围和发布边界；不是整合式客户端。

## 仓库结构

- `packages/delta-ui`：Delta UI，提供主题、搜索、会话辅助、Profile 级自动上下文压缩和独立设置；完整布局仍受 Harness 公开插槽能力限制。
- `packages/delta-code`：独立的 Delta Code。
- `packages/delta-suite`：独立的 Delta Suite，提供用户授权的模型、协议、能力和本地 API 桥接。
- `packages/shared`：无产品状态的通用工具和安全封装。
- `projects/delta-ui/release.manifest.json`、`projects/delta-code/release.manifest.json`、`projects/delta-suite/release.manifest.json`：三个插件的独立发布清单。

**早期实验性自建网页、Host 路由和专属服务已从源码移除**，不再提供 `/dsh-ui-delta/app`。旧 `dsh-ui-delta` / `dsh-theme-delta` 开发目录亦已移除；旧版 Git Tag、Release 和历史记录不改写。安装新插件前应停用旧插件，先在隔离 Profile 中验收。

三个插件均以 Harness Cordis 插件方式运行，互相不依赖；可分别安装、构建和验收。

## 功能扩展

每个插件包内部允许多个功能模块及设置栏目，不会将后续功能强制限制在“个性设置”。

每个模块须分别声明宿主依赖、配置/本地化、生命周期和失败回退。只有能力真正接通时才向 `settings.section` 注册独立设置页，避免出现无法生效的按钮或虚假开关。详见 [架构](docs/ARCHITECTURE.md) 和 [包内 README](packages/delta-ui/README.md)。

Delta UI 的上下文体验遵循公开 Host 能力；原生模型执行、压缩及日志仍由宿主负责。各功能的实现与实机验收状态以 [就绪清单](projects/delta-ui/feature-readiness.json) 为准，不将目标设计视为实际交付。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
```

PR 验证由 Action Worker 集中执行。新增的集中回归测试由 Action Worker 可信测试包维护；本仓库不新增独立 CI Runner。产品身份迁移涉及集中 CI 入口时，仅允许 Action Worker 对固定基线和精确变更进行校验，不开放通用修改例外。

## 发行

三个插件源码版本均保留 `0.0.0` 占位，不随 PR 修改。Delta UI、Delta Code 与 Delta Suite 均通过 Action Worker 按各自发布清单手动发布（`product=delta-ui`、`product=delta-code` 或 `product=delta-suite`，填写 `requested_version`）。

## 许可证

本仓库自行拥有版权的代码以 [MIT License](LICENSE) 开源，各插件包及共享模块同样采用 MIT。第三方依赖及其原有版权和许可条款不因此变更；历史发行版本的既有许可证保持不变。

升级说明：当前产品身份为 `delta-ui`、`delta-code` 和 `delta-suite`。本次将原 `delta-suite` UI 产品更名为 `delta-ui`，并将原 `delta-bridge` 模型桥接产品更名为 `delta-suite`；已安装旧版的用户需先在 Harness Profile 中卸载旧包、删除旧插件配置项，再安装新包。旧 npm 包和历史 Git Release 不会自动改名，不应同时加载新旧插件。

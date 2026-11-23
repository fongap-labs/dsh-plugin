# Delta / DeepSeek Harness 共用插件

文档导航：[文档索引](docs/README.md)


本仓库是 Delta 与 DeepSeek Harness 共用插件的 monorepo，包含 **Delta Suite、Delta Code 两个相互独立的插件项目**。它们共享仓库和构建入口，但各自拥有独立包名、插件入口、运行时生命周期、功能范围和发布边界；不是整合式客户端。

## 仓库结构

- `packages/delta-suite`：Delta Suite，提供主题、搜索、会话辅助、Profile 级自动上下文压缩和独立设置；完整布局仍受 Harness 公开插槽能力限制。
- `packages/delta-code`：独立的 Delta Code。
- `packages/shared`：无产品状态的通用工具和安全封装。
- `projects/delta-suite/release.manifest.json`、`projects/delta-code/release.manifest.json`：两个插件的独立发布清单。

**早期实验性自建网页、Host 路由和专属服务已从源码移除**，不再提供 `/dsh-ui-delta/app`。旧 `dsh-ui-delta` / `dsh-theme-delta` 开发目录亦已移除；旧版 Git Tag、Release 和历史记录不改写。安装新插件前应停用旧插件，先在隔离 Profile 中验收。

两个插件均以 Harness Cordis 插件方式运行，互相不依赖；可分别安装、构建和验收。

## 功能扩展

这是一个插件包，内部允许多个功能模块及设置栏目，不会将后续功能强制限制在“个性设置”。

每个模块须分别声明宿主依赖、配置/本地化、生命周期和失败回退。只有能力真正接通时才向 `settings.section` 注册独立设置页，避免出现无法生效的按钮或虚假开关。详见 [架构](docs/ARCHITECTURE.md) 和 [包内 README](packages/delta-suite/README.md)。

Delta Suite 的上下文功能组合 Harness 原生 `dsh-compaction-basic`、`message-quotes` 和公开 Client 插槽。Profile 层压缩后端在主会话与侧栏会话的模型请求前处理高压力上下文，并将较早消息压成结构化 checkpoint；不会删除会话原始日志。引用、侧栏、输入优化及显示开关的使用方式和实机验收边界见 [包内说明](packages/delta-suite/README.md)。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
```

## 发行

两个插件源码版本均保留 `0.0.0` 占位，不随 PR 修改。Delta Suite 与 Delta Code 均通过 Action Worker 按各自发布清单手动发布（`product=delta-suite` 或 `product=delta-code`，填写 `requested_version`）。

## 许可证

本仓库自行拥有版权的代码以 [MIT License](LICENSE) 开源，各插件包及共享模块同样采用 MIT。第三方依赖及其原有版权和许可条款不因此变更；历史发行版本的既有许可证保持不变。

升级说明：本次将两款插件的 npm 包名、Cordis 插件 ID 和发行资产由旧前缀统一改为 `delta-`。已安装旧版的用户需先在 Harness Profile 中卸载旧包、删除旧插件配置项，再安装新包；旧 npm 包和历史 Git Release 不会自动改名，不应同时加载新旧插件。

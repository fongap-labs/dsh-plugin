# Delta 插件项目

本仓库是 DeepSeek Harness 插件的 monorepo，包含 **Delta Suite、Delta Desktop、Delta Code 三个相互独立的插件项目**。它们共享仓库和构建入口，但各自拥有独立包名、插件入口、运行时生命周期、功能范围和发布边界；不是三合一客户端。

## 仓库结构

- `packages/dsh-delta-suite`：Delta Suite，提供主题、搜索、会话辅助、Profile 级自动上下文压缩和独立设置；完整布局仍受 Harness 公开插槽能力限制。
- `packages/dsh-delta-desktop`：独立的 Delta Desktop，方案 B2 的 API-first Root Shell 插件；目前属于实验原型，默认保留原生 UI 作为回退，未完成单 UI 裁剪与实机验收。
- `packages/dsh-delta-code`：独立的 Delta Code。
- `packages/shared`：无产品状态的通用工具和安全封装。
- `projects/dsh-delta-suite/release.manifest.json`：Delta Suite 的独立发布清单；Delta Desktop 尚未接入正式发布门禁。

**早期实验性自建网页、Host 路由和专属服务已从源码移除**，不再提供 `/dsh-ui-delta/app`。旧 `dsh-ui-delta` / `dsh-theme-delta` 开发目录亦已移除；旧版 Git Tag、Release 和历史记录不改写。安装新插件前应停用旧插件，先在隔离 Profile 中验收。

三个插件均以 Harness Cordis 插件方式运行，互相不依赖；Desktop 可复制 Suite 的 MIT 代码并独立维护，但不得调用 Suite 私有实现。即使同时安装，Desktop 的 Root Shell 仍可能使面向原生 Slot 的 Suite 功能不可见，需要另外验收共存行为。

## 功能扩展

这是一个插件包，内部允许多个功能模块及设置栏目，不会将后续功能强制限制在“个性设置”。

每个模块须分别声明宿主依赖、配置/本地化、生命周期和失败回退。只有能力真正接通时才向 `settings.section` 注册独立设置页，避免出现无法生效的按钮或虚假开关。详见 [架构](docs/ARCHITECTURE.md) 和 [包内 README](packages/dsh-delta-suite/README.md)。

Delta Suite 的上下文功能组合 Harness 原生 `dsh-compaction-basic`、`message-quotes` 和公开 Client 插槽。Profile 层压缩后端在主会话与侧栏会话的模型请求前处理高压力上下文，并将较早消息压成结构化 checkpoint；不会删除会话原始日志。引用、侧栏、输入优化及显示开关的使用方式和实机验收边界见 [包内说明](packages/dsh-delta-suite/README.md)。

## 开发

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
```

## 发行

三个插件源码版本均保留 `0.0.0` 占位，不随 PR 修改。Delta Suite 目前由 Action Worker 手动发布（`product=dsh-delta-suite`，填写 `requested_version`）；Delta Desktop 尚未配置正式发布流程。未经 Windows Harness 会话、停用与恢复验收，不得宣称 Desktop 可正式替换原生 UI。

## 许可证

本仓库自行拥有版权的代码以 [MIT License](LICENSE) 开源，各插件包及共享模块同样采用 MIT。第三方依赖及其原有版权和许可条款不因此变更；历史发行版本的既有许可证保持不变。

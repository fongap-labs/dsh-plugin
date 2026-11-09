# Delta Desktop 原生插件架构

## 独立产品

`dsh-plugin` 是多包工作区，每个插件单独安装及发布；Delta Desktop 是一个可持续扩展的原生客户端插件，而不是独立网页或第二套 Agent。

| 位置 | 职责 |
| --- | --- |
| `packages/dsh-delta-desktop/` | Delta 桌面唯一插件入口，原生体验层及未来 Host Adapter |
| `packages/dsh-delta-code/` | 独立的 Delta 编程助手 |
| `packages/shared/` | 中立的工具注册及安全执行能力 |
| `packages/plugin-template/` | 插件模板 |
| `projects/<plugin>/release.manifest.json` | Action Worker 单产品发行契约 |
| `tests/` | 与当前代码对应的真实契约及回归测试 |

## 功能模块

- **Theme**：品牌色、明暗配色、主题状态。已接入 `theme.overrideTokens`。
- **Settings**：可扩展的设置模块注册表（客户端 `settingsModules`）。已接入“个性设置 / Personalization”，后续可由不同功能分别贡献页面。
- **Sidebar**：侧栏导航布局、搜索框、顺序和国际化。待实现。
- **Search**：会话、内容、工作区、插件、快捷键等统一搜索。优先利用 Harness 原生搜索服务。待实现。
- **Conversation**：对话状态文案和界面布局；不改变原生推理、审批或模型。待实现。
- **Workspace**：默认折叠、悬浮卡片和默认工作区的删除保护。Host 删除前校验必需。待实现。
- **Host Adapter**：按需接入公开宿主服务，不迁入旧网页 HTTP 服务或无关 Host 功能。待实现。

**新增设置必须随相应功能启用或关闭，不能提前注册没有实现的空开关。** 未来可以在同一个插件内新增更多设置页面，保持导航统一、本地化统一和独立清理。

## 客户端技术契约

- `window.__ModuleLoader__.load` 使用宿主 React 和 Cordis 服务，保持单个客户端模块工厂，不能打包第二套 React。
- 通过 `ctx.inject` 等待可选服务，缺失能力时保留原生界面。
- `ctx.slots.inject/register` 注册可释放的设置页和图标，主题覆盖、样式和语言观察器由作用域负责清理。
- 当前 `src/client.ts` 为单文件入口；若后续拆分模块源码，必须先建立 bundler 和兼容性验证，确保输出仍符合宿主模块加载契约。
- 不直接改 `app.asar`、隐藏业务按钮或禁用官方 `ui-layout`。整栏替换必须满足 Slot 声明、子插槽、服务所有权和失败回退。
- 默认工作区删除保护须由 Host 业务操作校验；仅 UI 灰显不能满足保护要求。

## 替换范围与迁移

本次用原生客户端插件**整体替换了旧版 `dsh-delta-desktop` 实现**，删除旧 Host 网页路由、独立浏览器入口及对应测试、脚本；保留历史 Release 供查证，不在源码中保留无人维护的兼容分支。旧安装的 Profile/路由不是新插件的迁移输入，升级前应做好独立备份并在隔离 Profile 测试。

## 构建与发布

由 Action Worker 统一执行 CI、代码治理及人工发行。每包 `package.json` 和 `projects/<plugin>/release.manifest.json` 使用 Apache-2.0 一致的许可表达式；源码版本固定为 `0.0.0`，发布版本仅由手动输入决定。发行产物为 ZIP/TGZ，并强制 SBOM 和来源验证。

# Delta 主题

包名：`@fongap-labs/dsh-theme-delta`，插件条目：`dsh-theme-delta`。

## 当前实现

这是独立的 DeepSeek Harness 原生客户端扩展，不是新的聊天页面。使用 `ctx.theme.overrideTokens` 覆盖明暗品牌色，通过公开的 `settings.section` 插槽贡献独立的“个性设置 / Personalization”页面。页面随插件启停出现或消失，支持 Delta/官方配色切换。会话、模型、工具、审批与持久化均由宿主控制。

**本阶段尚未替换整个原生布局。** 官方 `ui-layout` 独占 `root`，并提供 `ctx.layout` 服务、主题呈现和下级插槽。没有完整的服务和子插槽职责交接证据前，不可直接禁用官方布局。本包不借用旧 Delta Desktop 的独立网页、私有选择器和启动跳转。

## 安装与恢复

从本插件独立 Release 的 ZIP 或 TGZ 安装到 **隔离** 的 Harness Profile，启用 `dsh-theme-delta` 条目，同时保留官方 `ui-layout`、`ui-theme` 与 `ui-renderer`。设置左侧导航新增“个性设置 / Personalization”，可在此切换 Delta 与官方配色。切换偏好使用独立命名空间并会进行非法数据恢复。

停用或卸载插件条目、重载客户端后，本插件主题层、样式和控件应随生命周期释放。**独立恢复路径**：若新模块导致设置页无法打开，关闭 Harness，在隔离 Profile 的 `cordis.patch.yml` 中将插件条目设置为 `disabled: true`，或移除该插件对应的 Bundle 配置，重新启动。不要改动官方 `ui-layout`、宿主安装目录或 `app.asar`。

> 切换外观不等于根布局热替换。真实停用/卸载流程仍须在目标桌面宿主验证。

## 开发与构建

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm validate
pnpm link:dev dsh-theme-delta
```

客户端源码位于 `src/client.ts`。它先由 TypeScript 编译，再由 `scripts/finalize-client.mjs` 将唯一维护源 `locale/*.json` 及 `src/theme.css` 注入单文件 ModuleLoader 工厂。React 从宿主模块表加载，不安装第二份共享运行时，不引入 Electron、Tauri 或独立桌面包。

## 验收状态

已建立模拟测试，覆盖 lazy 注册、模式切换、非法偏好、错误提示和重复释放；还必须在真实目标 DSH 的隔离 Profile 验证完整安装、真实会话、审批、第三方 UI、桌面窗口和多构建兼容。尚未复现的宿主缺陷不作推测性修复。

详细宿主证据和待验收范围见 `COMPATIBILITY.md`。

## 已确认的后续任务与宿主限制

待实施需求包括：侧栏顶部品牌行改为搜索（参照 `Nwflower/dsh-claude-style` 的搜索数据源）、插件管理/定时任务/开始对话顺序及统一间距、中英文文案、移除首页预览标签、将运行状态显示为“任务执行中”、会话右键卡片去路径与状态/时间同行、默认工作区删除保护及默认折叠。

目前 `ui-sidebar` 自行绘制品牌和新会话按钮；其 `sidebar.brand.mark/name` 插槽只允许替换图标和文字，父级仍是“新会话”按钮，不能安全地嵌入真正的搜索输入框。`ui-workspace` 管理会话/工作区浏览器及删除业务，`ui-chat` 与 `ui-conversation` 管理运行状态和预览。现有公开插件契约尚无对应的替换/业务保护钩子。**本 PR 未实现这些需求**；不能用私有 DOM 扫描、覆盖内置语言表或拦截删除事件伪造完成效果。

本插件设置页面当前仅提供真实生效的配色切换；不展示没有后端行为的假开关。若后续宿主提供稳定的业务扩展点，再逐项落实并做真实回归。

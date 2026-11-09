# Delta 主题

包名：`@fongap-labs/dsh-theme-delta`，插件条目：`dsh-theme-delta`。

## 当前实现

这是独立的 DeepSeek Harness 原生客户端扩展，不是新的聊天页面。使用 `ctx.theme.overrideTokens` 覆盖明暗品牌色，通过公开的 `settings.general.item` 与 `shell.overlay` 插槽贡献设置行和快捷操作面板。用户可返回对话、展开或折叠官方侧栏，并切换 Delta/官方外观。会话、模型、工具、审批与持久化均由宿主控制。

**本阶段尚未替换整个原生布局。** 官方 `ui-layout` 独占 `root`，并提供 `ctx.layout` 服务、主题呈现和下级插槽。没有完整的服务和子插槽职责交接证据前，不可直接禁用官方布局。本包不借用旧 Delta Desktop 的独立网页、私有选择器和启动跳转。

## 安装与恢复

从本插件独立 Release 的 ZIP 或 TGZ 安装到 **隔离** 的 Harness Profile，启用 `dsh-theme-delta` 条目，同时保留官方 `ui-layout`、`ui-theme` 与 `ui-renderer`。设置页的 Delta 主题行可切换外观；全局 Δ 入口提供快捷操作。切换偏好使用独立命名空间并会进行非法数据恢复。

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

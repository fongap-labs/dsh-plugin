# 原生侧栏文件夹树：扩展契约与边界

## 现状

Delta Suite 已通过官方 `sidebar.panellist` + `main` 扩展点提供完整的独立文件夹浏览面板；会话行标签和悬停详情使用 `sidebar.session.row.trailing` / `sidebar.session.row.hover`。文件夹拖放仅作用于 Delta 自有面板，不替换宿主的会话行或工作区拖拽。

DeepSeek Harness `ui-workspace` 当前独占 `sidebar.workspaces` 的单实例插槽，内部管理工作区分组、原生会话树、拖拽排序和会话操作。注册第二个该插槽会与宿主冲突。当前没有可靠的“组提供者 / 原生会话树过滤器”扩展接口。因此 **原生侧栏内嵌的 Delta 文件夹树暂不可安全实现**，不能通过 DOM 重新挂载、覆盖 `sidebar.workspaces` 或拦截 Host 原生 DnD 事件规避这一边界。

参考上游契约：

- `packages/client/ui-sidebar/src/client/contract/slots.ts` 中 `sidebar.workspaces` 为 `kind: 'single'`
- `packages/client/ui-workspace/src/client/contract/slots.ts` 仅开放 Session 行级装饰插槽
- `packages/client/ui-workspace/src/client/rows/Rows.tsx` 的 DnD 由宿主所有

## 如需在上游扩展

建议由宿主新增 **可组合、只读的 Session 组提供者**（例如 `sidebar.workspaces.sessionGroups`）。提供者只返回 `sessionId -> groupId`、组标题、顺序，不接管会话导航、菜单、归档、活动状态或拖拽的生命周期。宿主依然负责稳定键、置顶、归档、原生排序与工作区过滤，拖放后的写入通过提供者受控回调完成，并支持拒绝与回滚。

通过以下验收后才能接入：无插件降级、多个提供者冲突管理、跨工作区分组、搜索结果、已归档与未分类会话、键盘操作、拖放取消、窗口缩放与减少动态效果。不可将 Delta 的独立分组面板误当作原生树已经完成。

## 会话生命周期

文件夹归属以 Session ID 为键，所以会话标题修改不会改变归属；归档保留持久化文件，也不应解除归属。上游 `api-session/removed` 在活跃 Session 从 Host 内存中释放时也会触发，**不能把它当作永久删除事件清理归属**。

永久删除通过 Delta 的冷会话删除流程完成时会同步解除归属。对其他客户端可能已从磁盘删除的会话，设置页提供显式预览/确认的失效归属清理，并且要求完整的持久化记录列表与当前活跃会话状态；服务不可用或状态版本不一致时拒绝清理。

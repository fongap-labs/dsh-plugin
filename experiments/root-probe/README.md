# Delta Desktop Root 实验验证

本实验仅用于隔离的 Harness Web Profile。生产使用仍按原生 ui-layout 运行，绝对不能将实验覆盖层合并到默认 cordis.patch.yml。

## 目标与限制

重用现有 Delta Desktop 客户端包，以显式的本地测试标记启用 Root 所有权验证。在隔离 Profile 中，插件提供 root 注册、六个子插槽、最小三栏布局以及 layout 服务，停用时释放。它不提供完整的聊天、审批或兼容性承诺。

官方 ui-sidebar、ui-conversation、ui-chat 在 client manifest 中直接注入 @deepseek-ai/dsh-client-ui-layout。即使 Delta 自己实现 layout 服务，也不能满足对官方包身份的依赖。因此 overlay 禁用了这些原生 UI；它只能证明 Root 所有权和基本渲染，不能证明插件生态兼容。

基线：DeepSeek Harness v0.2.2-rc.3（2026-11-13）。

## 操作

1. 使用独立 DSH_HOME、独立 Profile、独立浏览器数据目录安装当前分支编译的 Delta Desktop，勿修改日常桌面环境。
2. 运行构建与测试：pnpm install --frozen-lockfile、pnpm build、pnpm test。
3. 在隔离环境使用以下命令预览配置，确认 ui-layout 和依赖 UI 被禁用、ui-renderer 与 ui-session 仍保留、Delta 插件存在。

~~~sh
dsh --profile web --dump-config --patch experiments/root-probe/cordis.patch.yml
dsh --profile web --patch experiments/root-probe/cordis.patch.yml
~~~

4. 在隔离浏览器打开实验 URL（例如 http://127.0.0.1:3080/?deltaRootProbe=1），在该页面的 DevTools 执行以下命令后刷新页面。**URL 参数与 localStorage 标记必须同时存在**，避免误触正常桌面：

~~~js
localStorage.setItem('fongap.delta.root-probe.v1', 'enabled')
~~~

5. 只有出现 data-delta-root-probe=active、Root ownership: Delta 和 console 中的 root registered in isolated Profile 时，才视为 Root 的实机渲染验收通过。
6. 保存启动审计、浏览器日志、截图；检查 Root 单占用、layout 服务、六个子插槽、面板拒绝、卸载释放。
7. 验收后从 DevTools 移除标记、关闭隔离进程、撤销 overlay，再恢复正常 Profile：

~~~js
localStorage.removeItem('fongap.delta.root-probe.v1')
~~~

## 失败恢复与验收边界

若空白或启动失败，撤回 --patch 并重启。Root 插件不能在运行时自动恢复被 Profile 禁用的官方 ui-layout；这不是自动回退机制。

| 检查项 | 当前状态 |
|---|---|
| Root 注册、六插槽及 layout 生命周期 | 单元/模拟测试覆盖 |
| 重复 Root 和缺失服务拒绝 | 单元/模拟测试覆盖 |
| Windows 实机注册与显示 | 待验收 |
| 真实会话发送、流式与停止 | 不在本轮实现 |
| 原生 UI 与第三方插件兼容 | 包依赖冲突，待架构解决 |
| 自动恢复原生 Root | 不支持；隔离 Profile 重启恢复 |

后续若要生产级完整接管，应先解决官方客户端的包级启动依赖和 service ownership，而不是伪装包名、修改 app.asar 或使用私有 DOM 注入。
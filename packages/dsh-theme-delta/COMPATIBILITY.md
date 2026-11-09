# 宿主契约与兼容性记录

公开源码基线：`deepseek-ai/deepseek-harness@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。基线只用于阅读，不等于已完成实际安装验证，也不代表全部后续宿主构建兼容。

| 能力 | 证据（DeepSeek Harness 相对路径） | 作用及必要性 | 缺失时 | 已验证 |
| --- | --- | --- | --- | --- |
| `__ModuleLoader__.load({id,factory})` | `packages/client/modules/src/client/manifest.ts` | 惰性客户端注册，必需 | 插件无法启动 | 单文件静态检查与模拟 |
| `ctx.theme.overrideTokens(source,tokens)` | `packages/client/ui-theme/src/client/index.ts` | 插件配色，返回拥有者 disposer | 官方色保留/出错提示 | 模拟 |
| `ctx.slots.inject/register` | `packages/client/ui-slots/README.md` | 安全等待插槽声明，自动释放贡献 | 对应控件不挂载 | 模拟 |
| `settings.general.item` | `packages/client/ui-theme/src/client/index.ts` | 设置页偏好入口 | 设置行不出现 | 模拟 |
| `shell.overlay` | `packages/client/ui-layout/src/client/index.ts` | 全局快捷操作 | 悬浮控件不出现 | 模拟 |
| `ctx.layout.toggleSidebar/selectPanel` | `packages/client/ui-layout/src/client/service.ts` | 调用官方导航/侧栏动作 | 仅该动作错误提示 | 模拟 |
| `root` 单占用与子插槽声明 | `packages/client/ui-layout/src/client/index.ts` | 完整原生布局替换的关键约束 | 不替换根布局 | 源码核实 |
| 桌面安全区 | `packages/client/ui-layout/README.md` | 尊重官方窗口边界 | 保留官方窗口结构 | 真实桌面待验 |

**尚未完成**：隔离 Profile 的安装/启用/停用/卸载及重启；主界面全布局替换与职责交接；真实会话发送/停止/流式展示；输入法与滚动；审批与设置；第三方 Fixture；两个不同宿主构建；Windows、macOS、Linux 桌面几何行为。没有使用私有 DOM 补丁，也没有对未经复现的缺陷叠加补丁。

开发边界：本插件只使用公开 Theme、Layout、Slots；不禁用 `ui-layout` 或其他无关条目，不执行 Profile 修改、模型请求或审批操作。宿主不提供事务性根布局热切换，因此本包不声称提供这种能力。

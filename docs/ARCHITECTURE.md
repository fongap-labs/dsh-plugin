# 仓库架构

本仓库提供 Delta 与 DeepSeek Harness 共用的独立 Cordis 插件，不提供独立客户端或第二套 Agent 运行时。

| 位置 | 职责 |
| --- | --- |
| packages/delta-ui | 通用体验、任务意图、助手协作及原生设置 |
| packages/delta-code | Coding 专项策略、代码编辑、仓库操作、验证交付 |
| packages/shared | 中立工具与安全执行封装 |
| projects | 产品身份、架构、就绪状态和发布清单 |
| tests | 产品契约及行为回归 |
| scripts | 项目构建、打包与验证入口 |

两个插件独立安装、启停、发布，不能依赖对方。宿主 API、权限及生命周期保持原生权威。组织治理、CI 和发布由 Action Worker 执行。

长期边界见 [架构治理](ARCHITECTURE_GOVERNANCE.md)，产品内部设计见 [Delta UI](DELTA_UI_MECE_ARCHITECTURE.md) 与 [Code](../packages/delta-code/ARCHITECTURE.md)。已实现与已验收的区别见 [兼容性规范](COMPATIBILITY.md)。

当前 Delta UI 已有组合入口、功能注册内核及宿主能力合同，但客户端和部分 Host 文件仍集中；不把目标目录当成完成情况。Code 已按专项功能模块组织，保留必要的兼容转发。逐步收敛时保持公开 API、单一客户端加载模块和既有回归约束。

宿主能力缺失时保留原生行为；不修改 app.asar、宿主源码、原生语言资源或权限实现。Gateway 纯函数存在不代表自动同步已启用；网络代理、Vision Bridge 不在产品范围内。

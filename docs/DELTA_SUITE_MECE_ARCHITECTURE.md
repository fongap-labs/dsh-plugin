# Delta Suite 能力所有权

本文件描述长期业务边界；机器合同为 [architecture-mece.json](../projects/delta-suite/architecture-mece.json)，就绪状态为 [feature-readiness.json](../projects/delta-suite/feature-readiness.json)。能力声明不代表功能已实现或已验收。

| 所有者 | 职责 |
| --- | --- |
| shell | 启动、主题、品牌、语言、功能设置、生命周期 |
| sessions | 会话和工作区状态及投影；会话操作请求安全策略判断，实际授权由宿主执行 |
| discovery | 搜索、索引、查询及导航，不直接修改会话 |
| context | 助手讨论、输入优化、上下文状态及通用任务意图 |
| security | 会话与工作区保护策略、脱敏和授权请求，不替代宿主权限 |
| integrations | 已确认的公开集成能力；MCP 原生配置与凭据仍由宿主负责 |

组合入口使用 DeltaFeatureRegistry 注册 Host 功能；缺失能力或可选功能故障不能破坏原生会话。适配层须逐步从业务实现分离，不新增第二个注册器。当前客户端仍有大型集中实现，按所有权逐步拆分并保持单一加载产物。

不允许 Vision Bridge、网络代理、源码 Patch、私有 DOM 接管、读取原始凭据或重复 Gateway 重试协调器。Gateway Effort 的纯契约不是启用的自动同步。未确认的公开 API 一律不接管。

相关 [宿主所有权](DELTA_SUITE_DOM_OWNERSHIP.md)、[Gateway 公开契约](DELTA_SUITE_GATEWAY_REASONING.md)、[UI 验收参考](DELTA_SUITE_ZIP_UI.md) 及 [兼容性规范](COMPATIBILITY.md)。历史设计不得覆盖现行安全边界。

## 会话保护实现边界

`src/delta-suite-security/session-protection.ts` 统一维护锁、墓碑、工作区成员快照和子 Agent 继承保护；只读取状态和公开宿主快照，不注册 HTTP 路由、不直接修改宿主或持久状态。`src/delta-suite-adapter/workspace-contract.ts` 定义已有 Host Workspace 接口类型。`src/host-sessions.ts` 保留操作编排及原有导出；发现模块通过同一安全判断接收搜索排除函数，避免重复授权策略。现有行为及实机验收要求不变。

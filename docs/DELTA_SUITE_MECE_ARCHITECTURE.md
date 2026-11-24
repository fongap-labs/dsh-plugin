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

## 浏览器构建边界

`src/client-context-projection.ts` 负责只读上下文、压缩摘要和消息标识投影；`src/client-totp-qr.ts` 负责本地 TOTP 二维码编码，不执行网络请求。`client.ts` 负责 UI 调用、资源与宿主生命周期。浏览器 `tsconfig.client.json` 是辅助脚本的有序构建清单；发布 finalizer 与隔离测试 fixture 按同一清单组装单一 `lib/client.js`，中间辅助文件不随包发布，不引入新的宿主模块加载或运行时依赖。Host TypeScript 构建排除浏览器脚本。现有算法与宿主边界不变。

## 会话搜索投影边界

`src/delta-suite-discovery/session-search-projection.ts` 负责会话文本的脱敏提取、检索词匹配、结果评分和摘要定位；只接受数据与查询参数，不读取宿主服务、不持有缓存、不注册路由。`src/host-search.ts` 保留 Host 观察租约、会话保护复核、内存 LRU、时间预算、查询编排及释放流程，并转发原有公开类型和函数。不得将安全策略或宿主读取权限移入纯投影模块；现有会话搜索行为测试继续验证真实入口。

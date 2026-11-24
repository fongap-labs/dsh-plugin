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

`src/delta-suite-discovery/session-search-projection.ts` 负责会话文本的脱敏提取、检索词匹配、结果评分和摘要定位；只接受数据与查询参数，不读取宿主服务、不持有缓存、不注册路由。`src/delta-suite-adapter/session-query-port.ts` 集中适配会话列表、兼容读取和观察租约释放，通过只读投影回调使用观察事件；不持有业务缓存或保护策略。`src/host-search.ts` 保留路由、会话保护复核、内存 LRU、时间预算与查询编排，并转发原有公开类型和函数。不得将安全策略或宿主读取权限移入纯投影模块；现有会话搜索行为测试继续验证真实入口。

## 客户端会话投影与保护边界

`src/client-workspace-projection.ts` 由 Sessions 域维护只读工作区快照投影及引用稳定性；`src/client-search-protection.ts` 由 Security 域维护 Suite Search 的只读保护判断，缺失可信成员快照时保持失败关闭。二者不调用 Host 服务、不修改宿主数据；`createClientFeatureManager` 通过显式快照参数调用，保留状态发布、授权请求和 UI 生命周期。浏览器构建仍按同一清单合并为唯一 `lib/client.js`。本阶段不宣称管理器全部拆分完成。

## 客户端功能注册生命周期

`src/client-registration-lifecycle.ts` 由 Shell 域维护同步的公共注册组清理：已获得的释放函数逆序执行，单项释放异常不阻断其他释放，重复停用无副作用。会话菜单及图标使用同一个 Cordis effect；注册失败立即回滚已返回的释放函数。无公开释放函数的旧版 Slot 仍由 Host/Cordis 所有，不使用私有 DOM 或 API 补偿。会话及导航引用的生命周期独立于可选搜索安装，不因搜索释放异常而跳过 Host 引用清理。该辅助函数不是第二个功能注册器，不接管 Cordis 调度。

宿主服务重新注入时，客户端注册生命周期辅助模块按绑定代次识别当前服务。工作区、会话/导航、主题、Layout 和右侧栏的引用仅由当前 Cordis effect 清理；旧绑定的延迟清理及过期会话观察事件不得清空或覆盖新引用。对工作区和会话目录仅检查已公布的快照读取接口，不根据宿主版本字符串推断权限。

## 功能级能力与授权声明

`architecture-mece.json` 的 `host_feature_access` 覆盖五项 Host 注册功能，列出启动前置条件、访问范围、宿主服务、降级和授权边界。组合入口将公开 Cordis 注册接口的可用性传给现有注册器；缺少 `inject` 或 `on` 时，仅跳过不满足前置条件的可选上下文功能。此检查不是版本化能力清单的协商，也不是权限授予。

隐私、搜索及会话操作保留既有安装器与延迟服务注入机制，不因启动瞬间缺少服务而整体关闭保护；实际服务缺失、权限拒绝或保护状态不明，按现有业务检查安全降级。权限最终由 Host 与既有保护策略决定，访问声明不替代逐操作检查。本轮仅覆盖 Host 组合入口，浏览器功能级声明和通用外发授权仍待完善。

浏览器侧 `browser_feature_access` 记录助手、原生会话菜单、搜索面板三组可选注册的公开方法前置条件及授权边界。助手服务不完整时不注册残缺 UI；菜单服务读取异常不阻断搜索；缺少导航方法时保留独立的会话目录及保护观察，不挂载无法执行导航的搜索面板。已有 Host 授权及逐操作检查保持原样，不新增权限系统；其余浏览器功能和通用外发授权不属于本次覆盖范围。

浏览器公共注册声明扩展至九组。Slots 根依赖必须具有公开注册及生命周期方法；独立的设置入口、品牌、模型标签、会话行装饰及工作区、会话、主题、布局注入各自隔离同步注册异常，避免某个旧版宿主接口缺失时中断后续功能。原有按操作复核与原生 UI 所有权保持不变；Locale、右侧栏及延迟回调错误仍依既有生命周期处理，不宣称所有宿主版本已经实测。

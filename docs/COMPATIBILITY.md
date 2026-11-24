# 宿主兼容性与验收

公开 API 源码核查仅证明参考版本中存在接口，运行时通过公开能力协商，不绑定宿主版本。缺失时保持原生行为，不使用私有 DOM、源码 Patch 或凭据读取补足。

| 等级 | 证据 |
| --- | --- |
| L1 静态 | 源码、类型、模块和机器合同 |
| L2 行为 | 真实单元或业务回归测试结果 |
| L3 模拟宿主 | Host API、权限、服务撤销、生命周期与回退 |
| L4 真实宿主 | 隔离 Profile 安装、启用、使用、停用、重启和卸载 |
| L5 兼容性 | 多个实际宿主版本及支持的操作系统重复 L4 |

每次记录源 SHA、测试或运行链接、宿主构建、操作系统及结果。未运行写未验证；中央 Windows 源码测试不等于 Windows 客户端验收。不得由静态结果推断真实宿主通过。正式发布仍遵循 Action Worker 现有门禁，不在此另建发布授权。

产品现行状态：[Suite](../projects/delta-suite/feature-readiness.json)、[Code](../projects/delta-code/feature-readiness.json)。专项证据：[Suite 现行兼容性及固定历史证据](../packages/delta-suite/COMPATIBILITY.md)、[Code Host 冒烟](CODE_WORKER_HOST_SMOKE.md)。历史记录保留原始结论，不覆盖现行合同。

# Delta Suite 宿主兼容性与迁移

现行状态以 [能力就绪清单](../../projects/delta-suite/feature-readiness.json) 为准；验收等级以 [仓库兼容性规范](../../docs/COMPATIBILITY.md) 为准。历史核查证据不代表当前阻塞状态。

## 公开契约与降级

| 能力 | 当前边界 |
| --- | --- |
| Theme / Slots / Settings | 通过公开 Theme API、Slot 和 Cordis 生命周期注册、释放；缺失时保留原生 |
| Locale | 只读官方 Locale 快照及订阅；只维护 Suite 自己的 zh/en；老宿主仅初始语言降级 |
| 会话与工作区 | Host 拥有最终权限；Suite 保护策略和操作编排分离，未知身份或保护状态保守拒绝 |
| 搜索与上下文 | 只读公开状态及查询，过滤受保护内容；不重新实现原生上下文压缩 |
| 模型与账户 | 仅公开 Slot 模型/提供方元数据；不读原始凭据，不替代模型选择 |
| Gateway Effort | 自动同步停用；纯适配函数不是已启用服务 |
| MCP | 原生 Host 配置、凭据与启停；不注入私有编辑器 |
| 代理、Vision Bridge | 产品范围外，已移除 |
| 原生布局、菜单、全局语言 | Host 所有；不接管私有 DOM、Store、源码或工作区方法 |

公开 API 阅读基线仅作参考：`deepseek-ai/deepseek-harness@2e39e70496aa02986ca6a820c5d497e816b69d7e`、`4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。不绑定运行时版本。

## 验收证据

| 项目 | 记录 |
| --- | --- |
| 源码、构建与自动回归 | [#576 中央 CI](https://github.com/fongap-labs/action-worker/actions/runs/45379576656)，提交 `0784e9c90c50408033f9a68fb15bedd64c715616`：Linux、Windows 和 Security 成功 |
| 模块所有权与源码边界 | [中央架构检查 #2028](https://github.com/fongap-labs/action-worker/pull/2028) 已合并 |
| 真实 Harness 安装、启用、停用、卸载及重启 | 未验证 |
| Windows 客户端交互、主题和第三方插件共存 | 未验证 |
| 第二个实际 Host 版本及跨平台兼容性 | 未验证 |

自动化 CI 不等于实际安装验收。保留现行功能就绪布尔值；不得以本次治理宣布 P0/P1 完整宿主交付。

## 迁移与回退

旧 `@fongap-labs/dsh-theme-delta` 与新 `@fongap-labs/delta-suite` 不自动互相覆盖。备份隔离 Profile，先停用旧插件，再安装实际发布的新包。异常时禁用 Suite 并重启，保留原生 Host 和第三方插件；禁止修改 app.asar、原生资源或重新引入私有补丁。

## 历史证据

- [完整历史兼容性与 31 项静态审计矩阵](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/packages/delta-suite/COMPATIBILITY.md)（固定提交，保留全部原文、日期、PR 与故障记录）。
- [历史原生 DOM 所有权逐项审计](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/docs/DELTA_SUITE_DOM_OWNERSHIP.md)；[当前边界](../../docs/DELTA_SUITE_DOM_OWNERSHIP.md)。
- [历史能力状态记录](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/projects/delta-suite/feature-readiness.json)；现行机器清单保留原有阶段字段供追溯。

新增证据记录源码 SHA、运行链接、Host 构建、操作系统和实际结果。阶段日志写入对应 PR/Issue；不再在发行包兼容性说明里累积历史故障正文。

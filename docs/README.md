# 文档索引

组织共用治理统一维护在 [Action Worker](https://github.com/fongap-labs/action-worker/tree/main/docs)。本仓库只维护产品专属内容。

## 现行规范

- [总体架构](ARCHITECTURE.md)
- [架构治理](ARCHITECTURE_GOVERNANCE.md)
- [开发与测试](DEVELOPMENT.md)
- [运维与发布](OPERATIONS.md)
- [产品安全](SECURITY.md)
- [宿主兼容性与验收](COMPATIBILITY.md)
- [仓库架构机器合同](../projects/architecture.json)

## 产品与专项参考

- [Delta UI](../packages/delta-ui/README.md)：[MECE](DELTA_UI_MECE_ARCHITECTURE.md)、[DOM 所有权](DELTA_UI_DOM_OWNERSHIP.md)、[Gateway 公开契约](DELTA_UI_GATEWAY_REASONING.md)、[UI 参考](DELTA_UI_ZIP_UI.md)、[兼容性及证据](../packages/delta-ui/COMPATIBILITY.md)
- [Delta Code](../packages/delta-code/README.md)：[架构](../packages/delta-code/ARCHITECTURE.md)、[宿主冒烟](CODE_WORKER_HOST_SMOKE.md)、[宿主结果契约](../packages/delta-code/docs/host-outcome-contract.md)、[可信 Skill](../packages/delta-code/docs/trusted-github-skills-governance.md)
- [Delta Suite](../packages/delta-suite/README.md)：用户授权模型适配、动态模型发现、视觉证据和本地 API 路由
- [Shared](../packages/shared/README.md)

历史记录及专项设计不是现行权威；发生冲突时以中央规则、仓库合同、产品合同和现行安全边界为准。

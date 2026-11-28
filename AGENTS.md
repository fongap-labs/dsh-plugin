# AGENTS
继承[中央规范](https://github.com/fongap-labs/action-worker/blob/main/AGENTS.md)。必读 docs/README.md、ARCHITECTURE_GOVERNANCE.md、SECURITY.md、COMPATIBILITY.md（均在docs/）及产品合同。禁止跨插件内部引用、私有宿主Patch、第二Agent；能力缺失保持原生。桥接必须与中央模板一致，外置测试归中央。仅桥接可持AW_DISPATCH_TOKEN；禁止绑定Runner。

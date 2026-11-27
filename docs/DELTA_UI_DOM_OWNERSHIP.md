# Delta UI 宿主界面与操作所有权

本文件是当前边界，不是阶段日志。完整 Issue #333 历史审计见 [固定提交原文](https://github.com/fongap-labs/plugins/blob/ed772aa0cecb0e4d20ed80f88418f49c19e995d6/docs/DELTA_UI_DOM_OWNERSHIP.md)，历史缺口以当前源码和就绪状态重新核对。

| 对象 | 现行所有权 |
| --- | --- |
| 侧栏布局、固定导航、账号、原生菜单、默认折叠、原生悬浮卡与全局语言 | Harness 原生组件；无公开契约不重排、不隐藏、不模拟点击 |
| 品牌、个性设置、模型标签、公开 Session 悬浮/Trailing 插槽 | Delta UI 在公开 Slot 中贡献自有 UI；不改写宿主私有 DOM |
| 主题和 Locale | 官方 Theme/Locale Service；主题覆盖可撤销，Delta UI 自有词典独立 |
| Search Palette | 公开输入 Slot 与只读会话查询/导航；不替换原生搜索及布局 |
| 会话锁、墓碑、工作区保护 | Host 权限优先；Delta UI 安全域统一保护判断，Host 操作域执行已授权调用 |
| 原生归档与恢复 | 通过公开 Host Service；缺少 Delta 原生归档归属证明不取消归档，客户端不执行补偿写入 |
| 工作区删除、重命名、全局模型和原生会话执行 | Host 权威；不包装私有方法、不写私有 workspace.json、不接管模型运行时 |
| 凭据、代理、Vision Bridge | 凭据归宿主；代理与 Vision Bridge 已移除 |

Delta UI 安全判断缺少可信身份、工作区成员或保护状态时不得展示受保护内容、执行未授权修改或伪造成功。停用必须释放自有注册及订阅，不能撤销宿主和其他插件的独立贡献。

新增功能须以公开 API 和生命周期证据为前提，缺失即降级。原生布局等未交付能力以 [feature-readiness.json](../projects/delta-ui/feature-readiness.json) 为准。真实 Windows、不同 Host 版本与第三方共存仍须单独验证。

参见 [架构治理](ARCHITECTURE_GOVERNANCE.md)、[安全边界](SECURITY.md)、[Delta UI 兼容性](../packages/delta-ui/COMPATIBILITY.md)。

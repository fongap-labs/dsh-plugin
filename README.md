# dsh-plugin

DeepSeek harness 插件仓库。harness 指驱动模型完成任务的运行框架，本仓库是其中面向 DeepSeek 的插件。

本仓库属于 Fongap Labs 受管仓库。PR 检查、CI、发布与部署、任务执行等共用治理由 [action-worker](https://github.com/fongap-labs/action-worker) 统一负责，本仓库只保留插件本身。

## 当前状态

仓库目前只包含许可证与本说明，插件源码尚未推送。在源码进入仓库之前，中央治理无法对其执行构建与测试。

## 目录说明

| 路径 | 作用 |
|------|------|
| `AGENTS.md` | Agent 入口，只指向 `CLAUDE.md` |
| `CLAUDE.md` | Agent 指南：共用治理入口与本项目的禁止事项 |
| `CHANGELOG.md` | 变更记录；条目文件放在 `changelog.d/`，发布时汇总进本文件 |
| `.github/workflows/notify-action-worker.yml` | 分发桥接：只通知 Action Worker，不检出代码，也不运行项目命令 |

## 接入所需的仓库配置

维护者需要完成两步：

1. 在本仓库的 Actions 密钥中设置 `AW_DISPATCH_TOKEN`，桥接只用它发送通知。
2. 由 Action Worker 的维护者把 `fongap-labs/dsh-plugin` 加入其仓库变量 `AW_REPOSITORY_POLICY`，例如 `"fongap-labs/dsh-plugin": ["pr"]`。

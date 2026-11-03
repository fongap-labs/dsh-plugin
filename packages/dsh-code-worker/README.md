# dsh-code-worker

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内原子地批量改文件：整文件覆盖，或 `find` / `replace` 字面量替换；支持 `dryRun` 预演。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_project_profile` | 只读检测项目技术栈、规则文件和项目现有测试脚本；不加载大段源码。 |
| `code_lsp_probe` | 探测配置的 LSP 服务端是否在 PATH 中可用（`--version` 探测），输出逐语言结论。 |

除工具外，插件还通过 `ctx.systemPrompt.section()` 注入一段编码工作流指引（与 `TOOL_EDIT` 同级排序），提示模型优先使用批量编辑与 Git 工具。

## 宿主兼容与依赖

与 `dsh-ui-delta` 一致，Code Worker 使用 Harness 的原生 `ctx.tools` 工具注册服务，不将 `@deepseek-ai/dsh-tools` 作为发布包的运行时或 peer 依赖。它的 TypeScript 类型仅供开发时校验，编译后不会强制安装另一份 Host tools。工具注册前仍检查宿主服务是否存在；缺少服务时工具不可用，不会绕过 Harness 的权限或沙箱。

开发构建继续使用仓库锁文件中固定的依赖，**固定开发依赖不等于限定宿主可运行版本**。兼容性由宿主服务接口、回归测试及真实宿主验证共同决定，而不是把每一个候选版本硬编码到包元数据中。若未来 Harness 接口发生不兼容变更，应适配接口并增加验证，而不是无条件声称兼容所有版本。

已发布的旧版包不会因为仓库源码更新而自行改变依赖声明。修复合并并发布新版本后，需要安装新版本才能解除旧版本的安装拦截。

## 安装到本地 Profile

```bash
# 根目录下安装/链接
pnpm link:dev dsh-code-worker
```

脚本会软链 `packages/dsh-code-worker` 到 `~/.dsh/profiles/<profile>/node_modules/`，
并把 `dsh-code-worker` 追加到 profile 的 `dsh.profile.bundles`。

也可使用 DSH 官方通道（等价于 `plugin_manager.install_bundle`）：

```bash
dsh plugin --profile desktop add link:/absolute/path/to/packages/dsh-code-worker
```

## 配置

配置写在 profile 的 `cordis.patch.yml`（用户层）或本包的 `cordis.patch.yml`（Bundle 层）：

```yaml
- id: dsh-code-worker
  name: 'dsh-code-worker'
  config:
    enabled: true
    workspaceRoot: ''
    git:
      enabled: true
      command: 'git'
    lsp:
      servers:
        - language: typescript
          command: 'typescript-language-server'
          args: ['--stdio']
        - language: javascript
          command: 'typescript-language-server'
          args: ['--stdio']
        - language: python
          command: 'pyright-langserver'
          args: ['--stdio']
        - language: rust
          command: 'rust-analyzer'
          args: ['--stdio']
        - language: go
          command: 'gopls'
          args: ['serve']
```

## 测试

```bash
pnpm test
```

## GitHub 多账号连接

在本机 **用户 Profile** 的 `cordis.patch.yml` 中，对 `dsh-code-worker` 配置 `github.accounts`。每个 GitHub 账号只需填写 **用户名或组织名 `owner` 与访问令牌 `token`**。账号数量不限：

```yaml
github:
  enabled: true
  allowWrites: false
  accounts:
    - owner: fongap-labs
      token: "<此处填写该组织仓库可用的 Token>"
    - owner: my-personal-name
      token: "<此处填写个人 Token>"
    - owner: third-organization
      token: "<此处填写另一个组织的 Token>"
```

支持只配置 1 个、2 个或者多个账号。实际授权来源是 Token 持有者，组织名不意味着组织有自己的 Token：填写组织名时，需要使用已获授权访问该组织仓库的 GitHub 账号的 Token。推荐细粒度个人访问令牌，并仅授权必要仓库及最小权限。

调用 GitHub 工具时，插件自动读取当前 Git 工作区 `origin` 仓库地址（或显式传入 `repository: owner/repo`），使用 `owner` 匹配对应 Token：例如 `fongap-labs/delta` 和 `fongap-labs/dsh-plugin` 都选择 `owner: fongap-labs`，不需要手动绑定仓库。不区分大小写，同一 `owner` 不允许重复，未匹配时拒绝操作，不会使用其他账号的 Token。

**安全要求：** Token 只应填写在本机未纳入版本控制的用户 Profile 中。不要将真实 Token 提交到公开仓库、Bundle 默认配置、PR、Issue 或聊天。不要启用 Profile 文件的云端明文同步。如果需要避免在配置文件中保存明文 Token，可以在每个账号使用 `tokenEnv: GITHUB_TOKEN_NAME` 代替 `token`，两者只能选一个，并在启动 Harness 前注入对应环境变量。Token 不会返回给模型，但本地 Profile 仍应限制文件访问权限。

| GitHub 工具 | 用途 |
| --- | --- |
| `code_github_connection` | 检查仓库连接及令牌权限 |
| `code_github_file` | 读取远程仓库文件或目录 |
| `code_github_pulls` | 查询 PR |
| `code_github_checks` | 查看 PR 检查结果、失败上下文及 Action Worker 检查链接 |
| `code_github_jobs` | 查看指定 GitHub Actions 运行的作业和失败步骤 |
| `code_github_branch` | 创建远程功能分支（写入需授权） |
| `code_github_commit_file` | 更新功能分支文件（写入需授权） |
| `code_github_create_pr` | 发起 PR（写入需授权） |

写入默认关闭。设为 `github.allowWrites: true` 后才允许创建远程分支、提交文件或创建 PR，但不会直接修改 `main` 或自动合并 PR。正式 CI 和合并门禁继续由 Action Worker 管理。

## 一体化工程工具

不用安装额外编程插件或 Skill 包。Code Worker 直接注册以下工具，运行时复用 Harness 的宿主能力与项目已有工具链。

| 工具 | 用途 |
| --- | --- |
| `code_workspace_map` | 用查询关键词对 Git 已跟踪的文件排序，只返回有限数量的文件名，避免整仓库占用上下文 |
| `code_git_worktree` | 查看工作树或为新任务创建隔离工作树和功能分支 |
| `code_verify` | 在 Harness 子进程服务中运行项目声明的测试、检查、构建脚本并返回有界证据 |

写入和执行操作需要在用户 Profile 中分别显式启用，默认为关闭：

```yaml
execution:
  allowWorktreeWrites: false
  allowCommands: false
```

启用 `allowCommands` 后只允许调用项目 `package.json` 中已存在的 `test`、`typecheck`、`build`、`lint`、`check` 脚本。运行项目脚本可能执行该仓库中的任意代码，应仅对可信工作区开启。没有 Harness 子进程服务时，这两项高权限工具拒绝执行，不绕过宿主执行能力与审批边界。

## 原生图形配置页面

在 DSH **插件 → Code Worker → 组件 dsh-code-worker → 配置** 打开原生配置表单。该页面通过官方 `plugins.row.config` 注册，配置通过 Host 的 `ConfigForm.mutate`（修订号冲突保护）写入当前 Profile。

- Git、执行权限、工作区、LSP、GitHub 多账号可直接编辑；权限默认关闭。
- Token 为 Schema `role('secret')`，Host 不会回显。已有账号留空 Token 即保留；新账号必须填 Token 或 tokenEnv。
- 插件热更新接收 `loader/volatile-update` 并重新注册工具。启用后请重新安装/重载新版插件（旧 release 包不包含本页面）。


## 内置编程技能（无需额外插件）

通过宿主原生 `ctx.skills.register` 注册；Harness 的 Skills 注册表、目录发现、按需加载及用户命令仍由宿主负责。插件不自建第二个技能管理系统，也不向用户配置目录写入文件。支持：

- `code-fast-change`：小任务快速定位、最小修改、针对性测试。
- `code-feature-delivery`：将复杂需求拆成可验证步骤，先测试再实现，交付 PR。
- `code-root-cause-debugging`：先复现和定位根因，再实施回归修复。
- `code-review-readiness`：核对正确性、安全、兼容性和实际测试证据。

模型按任务加载匹配的技能，不会把全部技能正文常驻放入系统提示词。宿主缺少 `ctx.skills` 时，编码工具仍正常注册，只有这些技能不可用。安装本插件即可使用上述技能；无需另行导入 Skill 压缩包。

建议流程：先 `code_project_profile` 获取轻量项目画像，读取适用的项目规则，再用宿主搜索、编辑、LSP、终端能力完成实现。测试调用 `code_verify` 仍必须显式开启 `execution.allowCommands`，并且要求宿主子进程服务。当前 `code_multi_edit` 是逐项执行、逐项报告结果，**不提供跨文件事务回滚**；失败时应检查返回值和 Git diff。

本插件不是第二个 Agent Runtime：不覆盖宿主子 Agent、任务跟踪、长循环、工具审批、上下文压缩、Skills 发现或终端实现。GitHub 写入和 CI 合并门禁沿用现有权限模型。

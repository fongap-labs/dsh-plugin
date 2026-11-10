# dsh-delta-code

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内顺序批量编辑，支持覆盖、字面量替换、`dryRun` 及可选 `preflight` 整批预检；拒绝同条编辑混合 `content` 与 `find`，写入阶段不保证事务原子性。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_lsp_probe` | 探测配置的 LSP 服务端是否在 PATH 中可用（`--version` 探测），输出逐语言结论。 |

除工具外，插件还通过 `ctx.systemPrompt.section()` 注入一段编码工作流指引（与 `TOOL_EDIT` 同级排序），提示模型优先使用批量编辑与 Git 工具。

## 宿主兼容与依赖

与 `dsh-ui-delta` 一致，Code Worker 使用 Harness 的原生 `ctx.tools` 工具注册服务，不将 `@deepseek-ai/dsh-tools` 作为发布包的运行时或 peer 依赖。它的 TypeScript 类型仅供开发时校验，编译后不会强制安装另一份 Host tools。工具注册前仍检查宿主服务是否存在；缺少服务时工具不可用，不会绕过 Harness 的权限或沙箱。

开发构建继续使用仓库锁文件中固定的依赖，**固定开发依赖不等于限定宿主可运行版本**。兼容性由宿主服务接口、回归测试及真实宿主验证共同决定，而不是把每一个候选版本硬编码到包元数据中。若未来 Harness 接口发生不兼容变更，应适配接口并增加验证，而不是无条件声称兼容所有版本。

已发布的旧版包不会因为仓库源码更新而自行改变依赖声明。修复合并并发布新版本后，需要安装新版本才能解除旧版本的安装拦截。

## 安装到本地 Profile

```bash
# 根目录下安装/链接
pnpm link:dev dsh-delta-code
```

脚本会软链 `packages/dsh-delta-code` 到 `~/.dsh/profiles/<profile>/node_modules/`，
并把 `dsh-delta-code` 追加到 profile 的 `dsh.profile.bundles`。

也可使用 DSH 官方通道（等价于 `plugin_manager.install_bundle`）：

```bash
dsh plugin --profile desktop add link:/absolute/path/to/packages/dsh-delta-code
```

## 配置

配置写在 profile 的 `cordis.patch.yml`（用户层）或本包的 `cordis.patch.yml`（Bundle 层）：

```yaml
- id: dsh-delta-code
  name: 'dsh-delta-code'
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

## DSH 宿主能力诊断

在隔离的真实 DSH Profile 加载本插件后，调用 `code_host_probe` 检查本次会话实际可访问的 FS、子进程、工作目录和工具注册方法。诊断只枚举方法是否存在，不读取内容、不执行命令、不写文件，也不会探测或回显 Token。

**注意：方法存在不代表拥有写入/命令权限，也不代表 `writeText` 的调用协议兼容。** 工具始终返回 `writeContract: unverified`；必须在真实 DSH Host 上另行运行拒绝/允许编辑、Skills、工作树和 LSP 冒烟测试，记录 DSH 版本、Profile 和结果，才能完成端到端验收。

## GitHub 多账号连接

在本机 **用户 Profile** 的 `cordis.patch.yml` 中，对 `dsh-delta-code` 配置 `github.accounts`。每个 GitHub 账号需填写 **用户名或组织名 `owner` 与 Token 环境变量名 `tokenEnv`**。Token 真实值**永不写入配置文件**，而是由运行环境在启动前注入对应环境变量。账号数量不限：

```yaml
github:
  enabled: true
  allowWrites: false
  accounts:
    - owner: fongap-labs
      tokenEnv: GITHUB_TOKEN_FONGAP
    - owner: my-personal-name
      tokenEnv: GITHUB_TOKEN_PERSONAL
    - owner: third-organization
      tokenEnv: GITHUB_TOKEN_THIRD
```

支持只配置 1 个、2 个或者多个账号。实际授权来源是 Token 持有者，组织名不意味着组织有自己的 Token：填写组织名时，需要使用已获授权访问该组织仓库的 GitHub 账号的 Token。推荐细粒度个人访问令牌，并仅授权必要仓库及最小权限。

调用 GitHub 工具时，插件自动读取当前 Git 工作区 `origin` 仓库地址（或显式传入 `repository: owner/repo`），使用 `owner` 匹配对应账号的 `tokenEnv` 环境变量：例如 `fongap-labs/delta` 和 `fongap-labs/dsh-plugin` 都选择 `owner: fongap-labs`，不需要手动绑定仓库。不区分大小写，同一 `owner` 不允许重复，未匹配时拒绝操作，不会使用其他账号的 Token。

**安全要求：** 配置文件**不保存任何 Token**，只记录环境变量名。Token 必须在启动 Harness 前注入对应环境变量。不要将 Token 环境变量值提交到公开仓库、Bundle 默认配置、PR、Issue 或聊天。不要启用 Profile 文件的云端明文同步。Token 不会返回给模型，但本地 Profile 仍应限制文件访问权限。

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
| `code_verify_suite` | 顺序运行最多 5 项白名单验证，整批先预检，失败后停止并报告跳过项 |

写入和执行操作需要在用户 Profile 中分别显式启用，默认为关闭：

```yaml
execution:
  allowWorktreeWrites: false
  allowCommands: false
```

启用 `allowCommands` 后只允许调用项目 `package.json` 中已存在的 `test`、`typecheck`、`build`、`lint`、`check` 脚本。运行项目脚本可能执行该仓库中的任意代码，应仅对可信工作区开启。没有 Harness 子进程服务时，这两项高权限工具拒绝执行，不绕过宿主执行能力与审批边界。

## 原生图形配置页面

在 DSH **插件 → Code Worker → 组件 dsh-delta-code → 配置** 打开原生配置表单。该页面通过官方 `plugins.row.config` 注册，配置通过 Host 的 `ConfigForm.mutate`（修订号冲突保护）写入当前 Profile。

- Git、执行权限、工作区、LSP、GitHub 多账号可直接编辑；权限默认关闭。
- GitHub 多账号只通过 `tokenEnv` 环境变量名引用凭据；Token 永不写入配置，页面也不会回显。
- 插件热更新接收 `loader/volatile-update` 并重新注册工具。启用后请重新安装/重载新版插件（旧 release 包不包含本页面）。

## 原生规划与执行闭环

Code Worker 借鉴工程实践中的**可执行规划**和**连续执行**，不绑定任何特定模型，也不新建 Agent Runtime：

- **小任务**：识别影响范围，执行最小修改，运行针对性验证，再检查 Diff；不强制生成计划。
- **复杂任务**：先给出目标、非目标、受影响文件、依赖顺序、验收条件和验证命令。使用宿主原生 `todo_write`（如果已挂载）记录 `pending`、`in_progress`、`completed`，每次更新完整列表。
- **执行**：一次完成一个就绪任务；先定位与测试，再修改、验证、检查差异；只有确实通过验收才标记完成。新证据推翻原计划时更新剩余步骤，不盲目重试。
- **复核**：有原生子 Agent 时，可以将独立审查交给不同 Agent；否则明确使用同一 Agent 自审，不声称完成了独立复核。PR 和合并继续由既有 CI 门禁把关。
- **权限**：规划不等于授权修改文件、执行命令、远程推送或发布；所有危险操作仍经过 DSH 原生权限边界。

该方案只调整现有编程 Skills 的策略，不新增工具名称、模型调用、持久化数据库或 MCP 服务。宿主未提供 `todo_write` 时使用对话内计划，不假装任务已被持久化。

### 文件服务权限与覆盖保护

- 当 DSH 已注入文件服务但缺少 `resolve`、`readText` 或 `writeText` 时，Code Worker 明确失败，不会退回本地 Node 文件系统；没有注入 FS 服务的兼容路径保持原有真实路径沙箱检查。
- 在 `code_multi_edit` 中设置 `preflight: true` 时，整文件覆盖编辑可以提供 `expectedSha256`（**原文件 UTF-8 内容的 64 位小写 SHA-256**）。预检阶段校验文件版本，写入前再次核对原内容；不匹配则拒绝写入并停止后续编辑。
- `expectedSha256` 仅支持 `content` 覆盖模式并且要求 `preflight: true`；不提供该参数时沿用原有行为。该检查不保证原子性，也不能消除两次检查与写盘间的并发竞态。

- `dryRun: true` 现在无论是否显式设置 `preflight`，都会只读校验整批目标路径、宿主文件服务能力、编辑参数和重复目标；若有任一无效项，所有预演结果均显示未通过，且不写盘。实际编辑未开启 `preflight` 时仍按原有逐项处理方式执行。

### 连续工程验证

对复杂任务可调用 `code_verify_suite`，例如 `scripts: ["typecheck", "test", "build"]`。检查必须是工作区中已声明或预置的项目验证命令；先验证**整个清单**，再按指定顺序通过 DSH Host subprocess 执行，任一检查失败、超时、输出不完整或被宿主拒绝则停止，后续项标记为未执行。每项输出均保留脱敏和长度限制。最多 5 项且不得重复。

权限仍由 `execution.allowCommands` 控制；不会新增 shell 命令入口或绕过 DSH 审批。原有 `code_verify` 接口不变。

### 工程概况与宿主文件服务

当 DeepSeek Harness 已注入 `fs` 服务时，`code_project_profile` 仅通过该 Host FS 的 `resolve`、`contains`、`stat` 和 `readText` 识别项目文件与脚本；宿主拒绝访问或缺少必需能力会明确失败，**不会退回 Node 本地读取**。没有 Host FS 的旧兼容路径保持原有行为。工具只输出文件名和脚本名，不输出脚本定义或文件正文。

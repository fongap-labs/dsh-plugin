# dsh-delta-code

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内顺序批量编辑，支持覆盖、字面量替换、`dryRun` 及默认多文件 `preflight` 整批预检；拒绝同条编辑混合 `content` 与 `find`，写入阶段不保证事务原子性；可选版本保护补偿恢复；普通逐项查找替换会在写盘前复核来源内容。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_lsp_probe` | 探测配置的 LSP 服务端是否在 PATH 中可用（`--version` 探测），输出逐语言结论。 |

除工具外，插件还通过 `ctx.systemPrompt.section()` 注入一段编码工作流指引（与 `TOOL_EDIT` 同级排序），提示模型优先使用批量编辑与 Git 工具。

### 实测问题修复：子进程注入与多仓库检索

Code Worker 将 `tools` 和 `subprocess` 声明为正式 Cordis 必需服务，避免工具已注册但调用时产生 `cannot get property "subprocess" without inject`。若 Host 未挂载原生 `subprocess`，插件保持未激活，不用 Node 本地进程绕过权限；修复后需重新构建并安装插件才能生效。

`code_workspace_map` 默认工作区不是 Git 仓库时，会只扫描直属子目录，按安全边界及数量限制发现真正的 Git 仓库，返回附带子目录前缀的相对路径。查询使用正向关键词匹配：中英文混合、不匹配的额外词不再抵消已命中的文件名。显式 `cwd` 仅检索指定路径，不擅自跨仓库搜索；宿主拒绝执行、超时、截断或不完整的 Host subprocess 均不允许退回 Node。

工作区搜索失败后应使用宿主原生文件搜索定位，而不是重复相同失败调用或读取完整的大型文件索引。自动降级仅限已授权的发现/只读操作；不提供绕过权限的进程或文件访问。

## 宿主兼容与依赖

与 `dsh-ui-delta` 一致，Code Worker 使用 Harness 的原生 `ctx.tools` 工具注册服务，不将 `@deepseek-ai/dsh-tools` 作为发布包的运行时或 peer 依赖。它的 TypeScript 类型仅供开发时校验，编译后不会强制安装另一份 Host tools。工具注册前仍检查宿主服务是否存在；缺少服务时工具不可用，不会绕过 Harness 的权限或沙箱。

开发构建继续使用仓库锁文件中固定的依赖，**固定开发依赖不等于限定宿主可运行版本**。兼容性由宿主服务接口、回归测试及真实宿主验证共同决定，而不是把每一个候选版本硬编码到包元数据中。若未来 Harness 接口发生不兼容变更，应适配接口并增加验证，而不是无条件声称兼容所有版本。

已发布的旧版包不会因为仓库源码更新而自行改变依赖声明。修复合并并发布新版本后，需要安装新版本才能解除旧版本的安装拦截。

### 本地文件句柄锚定（Linux）

当 DSH 未挂载 Host FS 时，Linux 本地兼容路径通过 `/proc/self/fd` 与逐级打开的目录句柄进行文件读取和写入；父目录在打开后被替换，不会把后续路径解析转向工作区外目录。写入也拒绝最终符号链接、非普通文件与多重硬链接（避免经硬链接覆盖外部文件）。该路径需要可用的 `/proc/self/fd`；无法使用时明确失败，不回退到非锚定写入。

Windows/macOS 的本地兼容路径改为**先打开文件句柄，复核工作区根目录、父目录、目标真实路径及打开句柄的文件身份，再读取或截断写入**。写入不会在安全复核前使用 `O_TRUNC`；拒绝持久符号链接、非普通文件与多重硬链接目标，并响应取消信号。新建文件可能在校验失败前留下空文件，需要清理。

该策略可缩小普通并发修改和路径替换导致的风险，但**无法完全消除恶意父目录并发置换竞态**：Node 文件路径检查无法替代操作系统的目录句柄相对寻址，尤其 Windows reparse point/junction。严格隔离场景应挂载受信任的 DSH Host FS；Linux 的目录句柄锚定同样不提供跨文件事务原子性。所有宿主授权继续由 DSH 负责。

### 批量编辑宿主身份与写入不确定性

`code_multi_edit` 在预检时，若 DSH Host FS 提供 `resolve/contains`，会对每个目标的宿主规范身份进行对比；同一文件即使通过不同路径、别名或大小写访问，也拒绝在同一批次中重复修改。对旧版未提供 `contains` 的 FS，保留原有路径去重行为；严格的 `guarded-intent` 写入仍要求宿主包含关系校验。

预检写入或逐项写入如果在调用宿主写入后出现异常，结果会明确提示「Host write outcome unconfirmed」，要求检查目标后再重试；不能把抛错等同于确认未修改。开启受控恢复时，只回滚宿主返回版本的已确认早期写入；失败目标不能凭空重写或自动删除。本能力不提供跨文件事务原子性。

### 批量编辑部分失败与受控恢复

`code_multi_edit` 新增可选参数 `rollbackOnFailure: true`，**仅在** `preflight: true`、非 Dry Run、`execution.fsWriteContract: guarded-intent` 且所有目标均为现有、可读取、带版本的文件时启用。开启后，预检保存每个文件修改前的内容（单文件上限 2 MiB）；成功写入必须由宿主返回该次写入的版本。若后续写入失败，插件按逆序尝试以 `replaceIfVersion` 恢复已确认成功的写入。

恢复遵守宿主原生授权和取消信号；如果文件已再次改变、宿主拒绝、写入结果缺失版本或操作已取消，**不允许无条件回写**。响应包含可见的 `rollback` 统计；恢复调用不仅必须成功返回，还必须携带有效的宿主版本令牌，否则标记为**恢复状态未确认**，不能报告成功。逐项结果会说明已验证恢复、恢复失败或结果不确定的修改。失败的那一次写入可能有不确定结果，需人工核对。

不支持自动删除本批次新建的文件，不保证跨文件事务原子性，也不自动开启恢复。多文件批量编辑默认先预检；显式 `preflight: false` 保留旧行为。该能力仍需真实 DSH Host 验收。

### DSH Host FS 写入协议

使用 `execution.fsWriteContract` 明确选择实际宿主的写入契约：

- `legacy-overwrite`（默认）：沿用当前锁定 DSH SDK 的 `writeText(target, content, 'overwrite', signal)` 行为，不修改现有用户配置。
- `guarded-intent`（显式开启）：对照上游 `FsWriteIntent`，必须具备宿主 `resolve/contains/stat/writeText`。宿主返回已有文件的版本后执行 `replaceIfVersion`；不存在则执行 `createIfAbsent`。批量预检时会固定版本或“文件不存在”的条件，后续写入不得改用更新后的版本；并发导致版本变化时由宿主拒绝，插件不会改为无条件覆盖。

无法安全地通过函数参数数量或写入探测判断宿主协议，因此不会自动切换。选择新模式却缺失 Host FS、文件版本、路径权限或必需方法时，将明确拒绝操作；所选协议不匹配时需要人工校正设置。此适配只证明接口调用与模拟测试，**不等于实际 DSH 写入审批或端到端验收完成**。


### 多仓库与工作树隔离

`code_workspace_map` 在 Host FS 挂载时通过原生 `listDir/lstat/resolve/contains` 发现直属子仓库，所有 Git 文件枚举走 Host subprocess，绝不退回插件本地目录读取；有界发现、符号链接拒绝及跨仓路径过滤仍保留。`code_git_worktree` 的列举、显式授权创建及受管工作树清理均使用宿主 `processPath`，目标和已有父目录由 Host FS 检查，父目录符号链接或新建目标已存在时阻断；并发同名工作树由 Git 的分支/目录唯一性最终拒绝冲突。清理需 `allowWorktreeWrites`，只接受明确注册的 `code-worker/<task>` 分支、干净工作树，使用非强制 `git worktree remove`；只有显式请求时才尝试 `git branch -d` 删除已合并分支。未挂载 Host FS 时继续使用本地兼容路径。

### 基础 Git 与 GitHub Origin 的跨模块一致性

`code_git_status`、`code_git_diff` 和未显式指定仓库时的 GitHub `origin` 检查使用同一 Host FS 工作区授权与 `processPath` 执行目录。挂载 Host FS 后，禁止从本地 Node 读取远程工作区或在宿主子进程拒绝后降级执行。Diff 的 `path` 以工作区根目录为基准，必须处于所选 `cwd` 仓库内，且被转换为 Git 字面量 pathspec；远程 Host 以原生 `resolve/contains` 决定真实路径，避免从 A 仓库探查 B 仓库或逃逸符号链接。无 Host FS 时保留本地路径兼容校验。以上为自动化契约测试，不代替真实 DSH 宿主验收。

### Git 工作区宿主授权

`code_resume` 和 `code_delivery_gate` 的 Git 工作目录统一遵循宿主权限：安装了 DSH Host FS 时，使用原生 `resolve/contains/stat/processPath` 确认目录并获取子进程的执行路径，Git 和交付测试均使用同一宿主执行路径；宿主拒绝、接口缺失、目标不是目录或路径越界均直接阻断，绝不改用 Node 本地 `realpath`。仅在未安装 Host FS 时使用原有本地真实路径检查；Git 命令仍必须通过 Host subprocess 执行。此变更需要真实 DSH 运行验证，不以模拟测试代替宿主验收。

### 跨轮恢复与基线核对（P0）

`code_resume` 在**同一个 Agent Session** 内读取 DSH 持久化 `todo/write` 事件的最新有效快照。普通 `todos` 投影在 `turn/start` 时清空，因此续接使用单独的**只读宿主投影**保留最后的任务快照；不新建数据库、不写入独立任务文件，也不调度第二个 Agent。重新打开相同 Session 时由 DSH 原生投影机制回放历史。

通过 DSH Host 子进程只读获取当前 Git HEAD 和工作区状态；若传入旧检查点的 `expectedHead`，HEAD 不一致直接 `blocked`。未提供旧 HEAD 或存在未提交修改时返回 `reconcile`，要求先检查现有代码与历史完成证据；基线匹配、工作区干净且确有待办时才返回 `resume`（仅为可续接建议，不等于验证通过）。历史缺失时返回 `empty`，全部 Todo 标记完成时返回 `complete`，宿主拒绝或不完整时返回 `blocked`。

此工具不会执行文件修改、Git 写入、测试、合并或发布；续接后仍应通过 `code_delivery_gate` 做真实测试与最终核验。它只识别当前 Agent Session，不能推断其他会话或子代理的任务。模拟回归不能替代真实 DSH H01–H10 安装与权限验收。

### 持续执行与交付核验（P0）

`code_resume` 可使用 `expectedSeq`（原生 Todo 写入序号）与 `expectedHead`（Git 基线）拒绝过期续接，仅对明确临时故障有限重试只读 Git。`code_verify_suite` 区分权限、临时依赖故障、验证失败和未知结果，但不自动重跑可能有副作用的测试命令。

`code_delivery_gate` 在最终完成声明前检查**真实 Git 状态和重新执行的测试**，而不是仅信任模型的完成描述。插件注册的原生 Todo 投影可用时，会先核对模型传入的任务列表与 DSH 持久化快照；快照缺失、状态不一致或验证期间出现新的 Todo 写入，均拒绝声称已验证。它使用 DSH 原生 `todo_write` 保存任务计划，**不创建第二套任务数据库或 Agent Runtime**。延续会话时先恢复原生 Todo 中尚未完成的任务，而不是重做已完成项目。此工具不会主动唤醒模型或在用户离线时后台执行。

调用时提供完整任务状态 `tasks`（与最近一次 `todo_write` 一致）、逐项 `taskAcceptance`（每项含与原生 Todo 对应的 `task`、明确 `criterion`、必须在本次执行的 `checks`）、当前仓库 `expectedHead`（40 或 64 位 Git HEAD SHA）、`scripts`（允许的 1–5 项 `test/typecheck/build/lint/check`）和可选 `cwd`。若仍有 `pending` 或 `in_progress`，直接返回下一项任务，**不执行任何命令**。

只有任务全部标记完成、逐项验收条件映射完整、Host 明确允许命令执行、所有脚本通过、Git HEAD 保持一致、已暂存/未暂存 Diff 格式检查通过、Git 状态及追踪文件 Diff 内容在验证前后未变化且没有未跟踪文件时，才返回 `stage: verified`。它在执行脚本之前验证整份检查清单，结果的 `taskEvidence` 仅将每项验收条件关联到本次真实通过的脚本和退出码，不把模型自报条件当成语义验收证明；Host 拒绝时不降级本地 Node；测试失败停止后续测试；发生取消直接停止。返回的结论只表明**本次自动化交付核验通过**，不等于独立审查、变更内容正确性、无竞争条件或允许自动合并。新文件应先评估并暂存，避免未跟踪内容脱离 `git diff --check` 的覆盖范围。

若要继续下一任务，可复制原生 Todo 中待办项目并重新检查当前仓库状态；不要以旧的核验结果抵充新 HEAD 的通过记录。单测使用模拟 Host 验证拒绝、失败和未完成任务行为，真实 DSH Host 仍须 H01–H10 验收。

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

`code_github_commit_file` 使用 GitHub 的 Git Trees/Commits API 创建基于当前 feature HEAD 的提交，最后执行 `force:false` 的分支引用更新。可传入 `expectedHead`（40 位 Git SHA）要求与审阅时的 HEAD 一致；分支被并发推进时，非快进更新由 GitHub 拒绝，不自动重试、不强制推送。读取已有文件时使用固定 HEAD 的树证据并保留普通文件执行权限；拒绝符号链接目标。写入可能在创建未引用 Git 对象后失败，但不能据此声明分支已更新。

`code_github_create_pr` 先查询相同仓库、head、base 下的开放 PR；发现已有 PR 就返回现有号码和 `reused: true`，不重复创建。并发创建被 GitHub 拒绝或 POST 响应丢失时，只进行一次只读查询，不再次发起 POST。401/403 权限错误直接停止；API 或网络异常的写入结果可能不确定，需要核对远程状态。此机制不自行合并或发布版本。

## 一体化工程工具

不用安装额外编程插件或 Skill 包。Code Worker 直接注册以下工具，运行时复用 Harness 的宿主能力与项目已有工具链。

| 工具 | 用途 |
| --- | --- |
| `code_workspace_map` | 用查询关键词对 Git 已跟踪的文件排序，只返回有限数量的文件名，避免整仓库占用上下文 |
| `code_git_worktree` | 查看、创建及安全清理受管工作树，拒绝未注册或未提交修改，分支删除仅用 `-d` |
| `code_verify` | 在 Harness 子进程服务中运行项目声明的测试、检查、构建脚本并返回有界证据；Node 项目允许已声明的 `test:unit` 等安全命名检查 |
| `code_verify_suite` | 顺序运行最多 5 项白名单验证，整批先预检，失败后停止并报告跳过项 |
| `code_lsp_probe` | 只在真实工作区范围内探测 LSP 可执行性；符号链接越界直接拒绝，取消时立即终止后续探测 |

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
- **复杂任务**：先给出目标、非目标、受影响文件、依赖顺序、验收条件和验证命令。要并行时，必须向 `code_workflow_route` 提交每个任务的显式 `taskPaths` 写入集合及 `taskDependencies` 前置索引，只有路径无重叠且原生子代理可用时才允许同波次执行；缺少写集时顺序执行。复杂缺陷修复先定位根因，再进入可执行计划和逐项验证；根因未明确前不进行推测性并行修改。使用宿主原生 `todo_write`（如果已挂载）记录 `pending`、`in_progress`、`completed`，每次更新完整列表。
- **执行**：一次完成一个就绪任务；先定位与测试，再修改、验证、检查差异；只有确实通过验收才标记完成。新证据推翻原计划时更新剩余步骤，不盲目重试。
- **复核**：有原生子 Agent 时，可以将独立审查交给不同 Agent；否则明确使用同一 Agent 自审，不声称完成了独立复核。PR 和合并继续由既有 CI 门禁把关。
- **权限**：规划不等于授权修改文件、执行命令、远程推送或发布；所有危险操作仍经过 DSH 原生权限边界。

该方案只调整现有编程 Skills 的策略，不新增工具名称、模型调用、持久化数据库或 MCP 服务。宿主未提供 `todo_write` 时使用对话内计划，不假装任务已被持久化。

### 文件服务权限与覆盖保护

本地兼容写盘路径在支持的平台使用 `O_NOFOLLOW` 打开目标文件，拒绝在检查与打开之间被换成的最终路径符号链接。不支持该标志的平台保留原有路径预检。此措施**不能消除父目录并发替换的 TOCTOU 风险**，不保证跨文件事务原子性；宿主 FS 已挂载时仍交由 DSH 宿主执行与授权。


- 当 DSH 已注入文件服务但缺少 `resolve`、`readText` 或 `writeText` 时，Code Worker 明确失败，不会退回本地 Node 文件系统；没有注入 FS 服务的兼容路径保持原有真实路径沙箱检查。
- 在 `code_multi_edit` 中设置 `preflight: true` 时，整文件覆盖编辑可以提供 `expectedSha256`（**原文件 UTF-8 内容的 64 位小写 SHA-256**）。预检阶段校验文件版本，写入前再次核对原内容；不匹配则拒绝写入并停止后续编辑。
- `expectedSha256` 仅支持 `content` 覆盖模式并且要求 `preflight: true`；不提供该参数时沿用原有行为。该检查不保证原子性，也不能消除两次检查与写盘间的并发竞态。

- `dryRun: true` 现在无论是否显式设置 `preflight`，都会只读校验整批目标路径、宿主文件服务能力、编辑参数和重复目标；若有任一无效项，所有预演结果均显示未通过，且不写盘。实际编辑未开启 `preflight` 时仍按原有逐项处理方式执行。

### 连续工程验证

`code_verify` 与 `code_verify_suite` 在挂载 DSH Host FS 时，预检项目文件后还会通过相同的宿主工作区校验取得 `processPath`，并将该路径传给 Host subprocess。插件本地路径仅用于识别工作区范围，不作为 Host 执行目录；Host FS 缺失必要能力、拒绝目录元数据或返回无效进程路径时，不执行脚本，也不退回本地文件系统。未挂载 Host FS 的旧兼容路径继续使用真实路径检查。真实 DSH 环境验收仍留待集中执行。


预检项目清单、锁文件和脚本声明时，已挂载 DSH Host FS 的环境仅使用宿主 `resolve/contains/stat/readText`：宿主拒绝、符号链接越界或接口不完整都直接失败，不回退 Node 本地读取。未挂载 Host FS 的旧环境保留本地真实路径校验。这一限制同时适用于 `code_verify` 与 `code_verify_suite`。


对复杂任务可调用 `code_verify_suite`，例如 `scripts: ["typecheck", "test", "build"]`。检查必须是工作区中已声明或预置的项目验证命令；先验证**整个清单**，再按指定顺序通过 DSH Host subprocess 执行，任一检查失败、超时、输出不完整或被宿主拒绝则停止，后续项标记为未执行。每项输出均保留脱敏和长度限制。最多 5 项且不得重复。

权限仍由 `execution.allowCommands` 控制；不会新增 shell 命令入口或绕过 DSH 审批。原有 `code_verify` 接口不变。

### LSP 探测与宿主路径权限

`code_lsp_probe` 在 DSH Host FS 已挂载时，沿用 `resolveAuthorizedGitCwd` 目录校验并获取 `processPath`，不使用 Node `realpath` 读取宿主虚拟路径。目录越界、非目录、缺失接口或授权拒绝会阻断探测；Host FS 存在但宿主 subprocess 不可用时，不回退本地进程。未挂载 Host FS 时保留原有真实路径越界检查。该功能仍需要真实 DSH Host 集成验收。

### 工程概况与宿主文件服务

当 DeepSeek Harness 已注入 `fs` 服务时，`code_project_profile` 仅通过该 Host FS 的 `resolve`、`contains`、`stat` 和 `readText` 识别项目文件与脚本；宿主拒绝访问或缺少必需能力会明确失败，**不会退回 Node 本地读取**。没有 Host FS 的旧兼容路径保持原有行为。工具只输出文件名和脚本名，不输出脚本定义或文件正文。

# dsh-code-worker

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内逐项批量修改文件（非跨文件事务）：整文件覆盖，或 `find` / `replace` 字面量替换；支持 `dryRun` 预演。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_workflow_route` | 按任务类型、风险和规模确定执行路径，只推荐宿主已具备的能力，不自动启动 Agent。 |
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
| `code_verify` | 通过宿主子进程运行 Node 声明的脚本或 Rust、Go、Python 的固定验证命令，返回实际退出码和有界输出 |

写入和执行操作需要在用户 Profile 中分别显式启用，默认为关闭：

```yaml
execution:
  allowWorktreeWrites: false
  allowCommands: false
```

启用 `allowCommands` 后，Node 项目只允许调用 `package.json` 中已声明的 `test/typecheck/build/lint/check` 脚本；Rust 使用 `cargo test/check/build/clippy`，Go 使用 `go test/vet/build`，Python 使用已安装的 `pytest/mypy/ruff/build` 或标准库 `compileall`。所有命令通过 DSH 原生子进程服务执行，传入固定参数而非任意 Shell 片段；不自动下载依赖。缺少工具链或测试失败时，如实报告失败。Go 的 `typecheck` 只编译、不运行测试，Python 的 `check` 是语法编译检查（会生成缓存），不等于静态类型检查。运行项目代码有副作用风险，仅对可信工作区开启。

`code_verify` 默认 `ecosystem: auto`；单项目目录自动识别，混合语言根目录明确报错，需指定 `ecosystem` 或使用 `cwd` 进入子项目。单次执行默认超时 120 秒，可在 10–600 秒之间配置，输出上限约 32 KiB。宿主没有子进程服务时拒绝执行，不进行无权限回退。

## 原生图形配置页面

在 DSH **插件 → Code Worker → 组件 dsh-code-worker → 配置** 打开原生配置表单。该页面通过官方 `plugins.row.config` 注册，配置通过 Host 的 `ConfigForm.mutate`（修订号冲突保护）写入当前 Profile。

- Git、执行权限、工作区、LSP、GitHub 多账号可直接编辑；权限默认关闭。
- Token 为 Schema `role('secret')`，Host 不会回显。已有账号留空 Token 即保留；新账号必须填 Token 或 tokenEnv。
- 插件热更新接收 `loader/volatile-update` 并重新注册工具。启用后请重新安装/重载新版插件（旧 release 包不包含本页面）。


## 内置端到端 Coding 工作流

本插件通过 DSH 原生 `ctx.skills.register` 挂载 **21 个按需调用的技能**。这不是另一个 Agent Runtime：DSH 负责执行、会话、权限、子 Agent、Workflow、LSP、终端与 Skills 加载；Code Worker 提供工程方法、项目预检、Git/GitHub 集成及验证门禁指引。无需另行安装 Superpowers 或其他 Coding Skill 插件。

**按任务选择路径，而不是所有任务都跑完整流程：**

`code_workflow_route` 为中大型任务提供可测试的确定性路由：输入任务类型、范围、风险和是否已确认 DSH 原生子 Agent 可用，输出技能顺序、并行候选与必须核实的证据。小修改直接使用 `code-fast-change`，无需为一次简单编辑多调用路由工具。此工具本身只读，不执行操作或绕过审批。

| 任务类型 | 工作路径 |
| --- | --- |
| 小修改 | `code-fast-change` → 修改 → 针对性验证 |
| 新功能 | `code-workflow` → `code-brainstorming`（仅需求不清时）→ `code-writing-plans` → `code-executing-plans` / `code-subagent-delivery` → `code-verification-gate` |
| Bug / CI 红叉 | `code-root-cause-debugging` / `code-ci-repair` → 定向回归测试 → 根因修复 → `code-verification-gate` |
| PR 审查 | `code-request-review` / `code-review-readiness` → `code-receive-review` → `code-finish-branch` |
| 大型仓库 | `code-context-discipline` + `code_project_profile` + 宿主搜索/LSP，限制上下文 |
| 多独立任务 | `code-parallel-work` + DSH 原生子 Agent；同文件修改不并行 |
| 长时自主迭代 | `code-autonomous-loop` + DSH 原生 Ralph/Workflow；遵守轮次上限、审批和停止条件 |

基础能力覆盖需求澄清、方案设计、细粒度计划、测试驱动、单 Agent 执行、原生子 Agent 协作、并行任务、工作树隔离、审查与反馈、结果验证、分支收尾、技能编写、上下文节制和失败会话诊断。

**可验证的边界：**

- `code_project_profile` 读取项目结构元信息、约束文件名和已声明的验证脚本，不把整个项目源码塞进上下文。
- `code_workspace_map` 只是按关键词排序的已跟踪**文件名**，不声称已有 Aider 那样的符号依赖图；需要符号与调用关系时用 DSH 原生 LSP 与搜索。
- `code_verify` 执行项目已有的 `test/typecheck/build/lint/check` 脚本，需要用户在配置中开启 `execution.allowCommands` 且宿主提供子进程服务。默认不执行任何工程脚本。
- `code_git_worktree` 创建隔离工作树须独立开启权限；GitHub 写权限也默认关闭。PR 的 CI、审核及合并门禁继续由 Action Worker 负责。
- `code_multi_edit` 是逐文件、逐项执行，**没有跨文件事务回滚**，单次返回结果不能替代检查最终 diff。
- 技能是按需加载的操作指导；不能仅凭安装保证自动执行完整流程、拥有某个原生 Agent 能力，或宣称未实际跑过的测试通过。

**参考项目与取舍：** [GSD](https://github.com/gsd-build/get-shit-done)（按依赖分批与上下文隔离）、[OpenSpec](https://github.com/Fission-AI/OpenSpec)（可验收的变更规格）、[BMAD](https://github.com/bmad-code-org/BMAD-METHOD)（按复杂度调节交付流程）、[Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin)（多视角审查与复盘）、[gstack](https://github.com/garrytan/gstack)（角色化审查）；以及 [Superpowers](https://github.com/obra/superpowers)（端到端流程与 TDD）、[Aider Repo Map](https://aider.chat/docs/repomap.html)（聚焦上下文）、[OpenCode](https://opencode.ai/docs/skills)（Skills 按需加载及原生权限）、[SWE-agent](https://github.com/SWE-agent/SWE-agent)（工具反馈与真实验证）、[Anthropic Skills](https://github.com/anthropics/skills)（渐进披露）。借鉴公开方法而非复制这些项目的 Runtime、依赖或原文。


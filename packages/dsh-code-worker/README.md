# dsh-code-worker

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内原子地批量改文件：整文件覆盖，或 `find` / `replace` 字面量替换；支持 `dryRun` 预演。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_lsp_probe` | 探测配置的 LSP 服务端是否在 PATH 中可用（`--version` 探测），输出逐语言结论。 |

除工具外，插件还通过 `ctx.systemPrompt.section()` 注入一段编码工作流指引（与 `TOOL_EDIT` 同级排序），提示模型优先使用批量编辑与 Git 工具。

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

在运行 DeepSeek Harness 的机器上，以环境变量保存每个账号的 Personal Access Token（PAT）。不要把真实 Token 写入仓库、`cordis.patch.yml`、日志或聊天。推荐使用细粒度 Token，按实际仓库授予最小权限：只读操作需要仓库内容读取；创建分支、提交文件需要仓库内容读写；创建 PR 需要 Pull requests 读写。

在**用户 Profile 的** `cordis.patch.yml` 对应 `dsh-code-worker` 节点追加以下 `github` 配置；Bundle 自带 patch 不保存任何账号凭据：

```yaml
github:
  enabled: true
  allowWrites: false  # 默认只读；确需推送分支与创建 PR 时设为 true
  accounts:
    - id: work
      tokenEnv: GITHUB_TOKEN_WORK
      repositories:
        - fongap-labs/*
    - id: personal
      tokenEnv: GITHUB_TOKEN_PERSONAL
      repositories:
        - personal-user/*
    - id: special
      tokenEnv: GITHUB_TOKEN_SPECIAL
      repositories:
        - fongap-labs/special-repo
```

选择账号时首先匹配完整仓库名（`owner/repo`），然后匹配 `owner/*`。大小写不敏感，精确规则优先；同优先级多个账号匹配时拒绝操作。没有匹配规则、Token 环境变量缺失或无访问权限时也会拒绝，不会回退到别的账号。账号名 `id` 只作标识，`tokenEnv` 是运行环境中的变量名称，不是 Token 本身。

不传 `repository` 时，插件运行 `git remote get-url origin`，自动识别标准的 GitHub HTTPS/SSH 仓库地址；也可显式传入 `repository: owner/repo`。插件通过 GitHub API 使用匹配账号，不修改全局 `git credential.helper`，不会影响本机其他 Git 客户端。Token 需在启动 Harness 之前注入其进程环境，并在重新启动后生效。

| 工具 | 用途 |
| --- | --- |
| `code_github_connection` | 检查远端仓库连接及当前令牌权限 |
| `code_github_file` | 读取指定分支的文件或目录 |
| `code_github_pulls` | 查看 PR 列表 |
| `code_github_branch` | 依据现有分支创建功能分支（要求开启写入） |
| `code_github_commit_file` | 向功能分支新增或更新单个文本文件（要求开启写入） |
| `code_github_create_pr` | 创建 PR（要求开启写入），合并继续由仓库治理流程控制 |

注意：设置 `allowWrites: true` 后，自动选中的 Token 能执行其实际 GitHub 权限允许的上述写入操作。应针对不同账号限制仓库范围，切勿使用超出需要的管理权限 Token。该插件不会自动合并 PR，也不支持直接推送到 `main` 或 `master`。

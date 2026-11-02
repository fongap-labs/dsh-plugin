# dsh-plugin

**DSH (DeepSeek Harness) 原生 Bundle / Host Plugin 多插件 Monorepo**

> 采用 pnpm Workspace + ESM + Cordis 微内核架构，集中开发、维护、测试、发布面向 DeepSeek Harness 的各类插件。

---

## 插件列表

| 插件 | 类型 | 路径 | 核心能力 |
| --- | --- | --- | --- |
| **`dsh-ui-delta`** | UI 界面插件 (Web + Host) | `packages/dsh-ui-delta` | Delta 设计系统色彩与视觉层叠、精细排版、视觉分析代理、网络搜索代理与端侧安全配置 |
| **`dsh-code-worker`** | 编程插件 (Host Tools) | `packages/dsh-code-worker` | MultiEdit 批量编辑、Git 状态与差异分析、LSP 服务探测与编码工作流系统提示注入 |
| **`@dsh-plugin/shared`** | 内部共享库 | `packages/shared` | `defineTool` 回退机制、`subprocess` 安全调用降级、路径沙箱校验 |
| **`@dsh-plugin/plugin-template`** | 脚手架模板 | `packages/plugin-template` | 新插件标准模板，规范 manifest、patch 与国际化结构 |

---

## 在线安装指南 (DeepSeek Harness)

DeepSeek Harness（DSH）支持以下两种在线安装方式：

### 方案一：通过 npm 包名一键安装（推荐）

在 DeepSeek Harness 插件管理器搜索框或控制台中直接输入插件包名：

```text
@fongap-labs/dsh-ui-delta@0.1.0-beta.1
```

正式包名为 `@fongap-labs/dsh-ui-delta`。GitHub Release 标签 `dsh-ui-delta-v0.1.0-beta.1` 不属于 npm 版本号。使用 npm 安装前，须确认该版本已发布到所选 Registry（包括国内镜像）；若镜像尚未同步，请使用 Release 文件。

- **适用场景**：日常使用、版本更新与自动依赖解析。
- **运行原理**：使用前须确认插件包已发布至所选 npm Registry，安装包根目录完整包含 `cordis.patch.yml` 与 `package.json`，DSH 的包管理器（pnpm）可自动下载并挂载插件。

### 方案二：通过 GitHub Release `.tgz` 资产直链安装

在 DeepSeek Harness 插件管理器的安装输入框中粘贴对应插件 Release 的 `.tgz` 资产直链：

```text
https://github.com/fongap-labs/dsh-plugin/releases/download/<release-tag>/<plugin-name>.tgz
```

**示例**：
```text
https://github.com/fongap-labs/dsh-plugin/releases/download/dsh-ui-delta-v0.1.0-beta.1/fongap-labs-dsh-ui-delta.tgz
```

- **适用场景**：内网/离线环境、安装特定历史构建版本、或者无法访问 npm 镜像源时。
- **运行原理**：每个插件在 GitHub Release 发布时，均包含独立打包的标准 npm tarball（`.tgz`），单包打包结构完全满足 DSH 安装解压协议，避免了 Monorepo 根目录无插件清单导致识别失败的问题。

---

## 目录结构

```
dsh-plugin/
├── .dsh/
│   └── skills/SKILL.md               # Monorepo 全局与开发期共享技能文档
├── packages/
│   ├── dsh-ui-delta/                 # 1. UI 界面插件（Web 客户端 + Host 服务）
│   ├── dsh-code-worker/              # 2. 编程插件（MultiEdit, Git, LSP）
│   ├── shared/                       # 内部共享库（defineTool 回退、subprocess 降级、路径沙箱）
│   └── plugin-template/              # 官方脚手架模板
├── scripts/
│   ├── link-profile.mjs              # 链接/安装/移除插件到本地 Profile
│   └── pack-bundles.mjs              # 校验 Bundle 规范并打包 zip
├── tests/
│   ├── shared.test.mjs               # shared 库单元测试
│   ├── dsh-ui-delta.test.mjs         # dsh-ui-delta 单元与集成测试
│   └── dsh-code-worker.test.mjs      # dsh-code-worker 集成与回归测试
├── .gitignore
├── package.json                      # 根包配置
├── pnpm-workspace.yaml               # pnpm 工作区定义
└── README.md                         # 本文档
```

---

## 快速开始

```bash
# 1. 安装依赖（根目录）
pnpm install

# 2. 类型检查 + 编译（TypeScript 源码 → packages/*/lib）
pnpm typecheck
pnpm build

# 3. 运行全部测试（Node 内置 test runner，针对编译产物 lib/）
pnpm test

# 4. 校验所有 Bundle 合规性（CI 推荐）
pnpm validate

# 5. 生成发布 zip 到 dist/
pnpm pack:bundles

# 6. 调试：将插件软链接到本机 DSH Profile 并自动启用
pnpm link:dev dsh-ui-delta
pnpm link:dev dsh-code-worker

# 7. 移除链接
pnpm link:dev dsh-ui-delta --unlink
pnpm link:dev dsh-code-worker --unlink
```

> **环境要求**：Node.js ≥ 20.10，pnpm ≥ 9。DSH 宿主包（`@deepseek-ai/*`）在运行时由 DSH 提供，仓库中以 `peerDependencies` 声明，离线开发或 CI 均可脱离宿主独立运行。

---

## 命令速查

| 脚本 | 作用 | 关键参数 |
| --- | --- | --- |
| `pnpm test` | 执行 `tests/` 下所有 `*.test.mjs` 测试套件（针对编译产物 `lib/`） | — |
| `pnpm typecheck` | `tsc --noEmit`，检查 TypeScript 源码类型 | — |
| `pnpm build` | `tsc` 编译 TypeScript 源码到各包 `lib/` | — |
| `pnpm validate` | 校验所有 Bundle 资源完整性（静态检查） | — |
| `pnpm pack:bundles` | 校验通过后打包 zip 到 `dist/` | — |
| `pnpm link:dev <name>` | 软链插件到 `~/.dsh/profiles/<profile>/node_modules/` 并写入 `dsh.profile.bundles` | `--profile <name>`、`--unlink`、`--install` |
| `pnpm install:bundle <name>` | 走 DSH 官方通道安装（等价 `plugin_manager.install_bundle`） | `--profile <name>` |

---

## 两个核心插件说明

### 1. `dsh-ui-delta` (UI 界面插件)

- **定位**：为 DeepSeek Harness 提供统一的视觉层、交互层与端侧增强。
- **架构**：
  - **客户端** (`lib/client.js`)：声明 `dsh.client.platform = "web"`，在浏览器环境覆盖 49 个 UI Token，精修侧边栏、对话气泡、圆角与滚动条。
  - **宿主端** (`lib/index.js`)：注入 Cordis WebServer 路由，提供 `/dsh-ui-delta/config`、`/dsh-ui-delta/vision`、`/dsh-ui-delta/search` 和 `/dsh-ui-delta/version` API。
  - **安全性**：Windows 下采用 DPAPI 对用户 API 密钥安全加密存储在本地，不上传任何遥测数据。

### 2. `dsh-code-worker` (编程插件)

- **定位**：增强模型在代码编辑、工程感知与环境探测方面的自动化工具集。
- **核心工具**：
  - `code_multi_edit`：工作区内原子批量编辑，支持整文件覆盖与精确的 `find/replace`，支持 `dryRun`。
  - `code_git_status`：结构化解析 Git 状态（分支、暂存、未暂存、未跟踪）。
  - `code_git_diff`：快速获取当前代码差异（支持暂存区对比与路径过滤）。
  - `code_lsp_probe`：探测环境中的语言服务器（TypeScript, Python, Rust, Go 等）可用性。
  - **提示词注入**：通过 `ctx.systemPrompt.section()` 在 `TOOL_EDIT` 级别注入代码工作流指引。

---

## 新建插件 SOP（标准操作程序）

1. **复制模板**：
   ```bash
   cp -r packages/plugin-template packages/dsh-my-plugin
   cd packages/dsh-my-plugin
   ```
2. **修改 `package.json`**：设置 `name`、`version`、`description` 与 `dsh.bundle.patch`。
3. **修改 `cordis.patch.yml`**：设置全局唯一 `id` 与 `name`。
4. **补充国际化与图标**：`locale/en.json`、`locale/zh.json`（含 `meta.title` 和 `meta.description`），以及 ≤ 256 KiB 的 `icon.svg`。
5. **实现入口**：在 `src/index.ts` 中导出 `apply(ctx, config)` 和 `inject`。
6. **添加测试**：在 `tests/` 目录下添加对应的 `*.test.mjs` 测试文件。
7. **执行验证**：运行 `pnpm test` 与 `pnpm build` 确认全部通过。

---

## 质量与规范清单

- [x] **Monorepo 工作区管理**：通过 `pnpm-workspace.yaml` 与 `workspace:*` 规范依赖管理。
- [x] **Cordis 插件规范**：全包 ESM 规范，严格实现 `apply(ctx)` 与 `inject`。
- [x] **沙箱安全保障**：所有文件工具强制经由 `resolveInside` 校验，杜绝越界跳出工作区。
- [x] **高测试覆盖率**：共享库、UI 插件生命周期与编程工具全部具备独立自动化测试。
- [x] **自动化打包验证**：内置 `pack-bundles.mjs` 实现 CRC32 纯原生 zip 格式打包与元数据校验。

## 发布流程（Action Worker per-plugin）

本仓库通过 [action-worker](https://github.com/fongap-labs/action-worker) 的 `release-app.yml` 进行 **每个插件独立发布**，各插件独立 tag、独立版本、独立产物。

### 触发方式

在 **action-worker 仓库** 的 Actions 页面手动运行 `release-app.yml`（手动·发布应用），填入：

| 输入 | 说明 | 示例 |
|---|---|---|
| `source_repository` | 源仓库 | `fongap-labs/dsh-plugin` |
| `requested_version` | 发布版本号（正式版 `vX.Y.Z`，预发布 `vX.Y.Z-beta.N`） | `v1.2.3` |
| `product` | 要发布的插件目录名（必填，三选一） | `dsh-code-worker` / `dsh-ui-delta` / `plugin-template` |

### 构建流程（Action Worker 内部执行）

1. Action Worker 从源仓库的 `projects/<product>/release.manifest.json` 读取清单。
2. 清单声明 `root: "packages"`、`script: "<product>/build-release.ps1"`、`assets: ["<safe-name>.zip"]`。
3. Runner 依次准备环境：`node_version_file` 解析到 `packages/.nvmrc`（纯文本 `24`），`target` 必须是 **rustup target triple**（`x86_64-pc-windows-msvc`），因为 Action Worker 会把它直接传给 `rustup toolchain install --target`。
   构建日志第一行是 `Source revision: <sha>`：Action Worker 按固定提交检出源码，若日志里的 sha 不是你以为的版本，说明这次运行用的是旧提交（workflow_dispatch 的输入在运行创建时就固定了，改动需重新派发而不是 Re-run）。
4. 运行 `build-release.ps1 -Package <product> -Target x86_64-pc-windows-msvc -Version X.Y.Z -OutputDir <dir>`：
   - 将目标插件 `package.json` 的 `version` 从占位符 `0.0.0` 暂时注入为发布版本；
   - 解析包管理器：优先 `pnpm`，缺失时依次回退 `npm exec pnpm@<packageManager 版本>`、`corepack pnpm`；同名的多个候选（runner 上 `npm.cmd` 同时存在于 hosted toolcache 与 `C:\Program Files\nodejs`）只取 PATH 中的第一个真实文件，且每个候选先跑一次 `--version` 探针，不通过则继续回退；
   - `pnpm install --frozen-lockfile`；
   - `pnpm build` 全量编译（workspace:* 解析需要所有包）；
   - `pnpm pack:bundles --package=<name>` 仅打包该插件；
   - 产物 `dist/<safe-name>-<version>.zip` → `OutputDir/<safe-name>.zip`；
   - `finally` 恢复 `package.json` 原值（版本回到 `0.0.0`）。
5. Action Worker 生成 SBOM、打包 governed release artifact、派发 release 事件。

### 发布包内容

`dist/<safe-name>-<version>.zip` 是一个可直接安装的 Bundle 包，始终包含 `package.json`（与 `npm pack` 一致，不受 `files` 字段限制），因此注入的发布版本会随产物一起分发。包内文件为 `package.json`、`lib/**/*.js`、`lib/**/*.d.ts`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README.md`。

`tests/release-manifest.test.mjs` 把上述清单契约固定为测试：布局唯一性、`root`/`script` 路径、rustup target triple、资产名与打包名一致、跨产品唯一性、`.nvmrc` 编码以及包内必须含 `package.json`。清单写错时 `pnpm test` 就会失败，不必等到远端发布。

### 产物对应表

| 插件 | release_key | Release 产物 (.zip / .tgz) | npm 包名 | manifest 路径 |
|---|---|---|---|---|
| `dsh-code-worker` | `dsh-code-worker` | `dsh-code-worker.zip`<br>`dsh-code-worker.tgz` | `dsh-code-worker` | `projects/dsh-code-worker/release.manifest.json` |
| `dsh-ui-delta` | `dsh-ui-delta` | `dsh-ui-delta.zip`<br>`dsh-ui-delta.tgz` | `dsh-ui-delta` | `projects/dsh-ui-delta/release.manifest.json` |
| `plugin-template` | `dsh-plugin-template` | `dsh-plugin-plugin-template.zip`<br>`dsh-plugin-plugin-template.tgz` | `dsh-plugin-plugin-template` | `projects/plugin-template/release.manifest.json` |

> **提示**：通过 `action-worker` 触发发布时，系统会自动将编译出的 `.tgz` 资产同步发布到 npm 仓库（支持正式版与带 `--tag beta` 的预发布版）。

> **注意**：内部共享包 `@dsh-plugin/shared` **不单独发布**，仅作为 `workspace:*` 依赖参与编译。

### 本地发布（开发/预览用）

```bash
# 预览：inject → build → pack，不实际发布
pnpm release:dry-run --tag v1.2.3

# 实际发布到 npm（全部插件按依赖顺序 shared → code-worker → ui-delta → template）
pnpm release --tag v1.2.3
```

本地脚本 `scripts/release.mjs` 从本地 git tag 读版本；Action Worker 从 `requested_version` 读版本。两套流程互不干扰。

## Fongap Labs 治理接入

本仓库属于 Fongap Labs 受管仓库。PR 检查、CI、发布与部署、任务执行等共用治理由 [action-worker](https://github.com/fongap-labs/action-worker) 统一负责，本仓库只保留插件本身。

| 路径 | 作用 |
|------|------|
| `AGENTS.md` | Agent 入口，只指向 `CLAUDE.md` |
| `CLAUDE.md` | Agent 指南：共用治理入口与本项目的禁止事项 |
| `CHANGELOG.md` | 变更记录；条目文件放在 `changelog.d/`，发布时汇总进本文件 |
| `.github/workflows/notify-action-worker.yml` | 分发桥接：只通知 Action Worker，不检出代码，也不运行项目命令 |

### 接入所需的仓库配置

维护者需要完成两步：

1. 在本仓库的 Actions 密钥中设置 `AW_DISPATCH_TOKEN`，桥接只用它发送通知。
2. 由 Action Worker 的维护者把 `fongap-labs/dsh-plugin` 加入其仓库变量 `AW_REPOSITORY_POLICY`，例如 `"fongap-labs/dsh-plugin": ["pr"]`。

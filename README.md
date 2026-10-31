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
  - **客户端** (`client.js`)：声明 `dsh.client.platform = "web"`，在浏览器环境覆盖 49 个 UI Token，精修侧边栏、对话气泡、圆角与滚动条。
  - **宿主端** (`index.js`)：注入 Cordis WebServer 路由，提供 `/dsh-ui-delta/config`、`/dsh-ui-delta/vision`、`/dsh-ui-delta/search` 和 `/dsh-ui-delta/version` API。
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
5. **实现入口**：在 `src/index.js` 中导出 `apply(ctx, config)` 和 `inject`。
6. **添加测试**：在 `tests/` 目录下添加对应的 `*.test.mjs` 测试文件。
7. **执行验证**：运行 `pnpm test` 与 `pnpm build` 确认全部通过。

---

## 质量与规范清单

- [x] **Monorepo 工作区管理**：通过 `pnpm-workspace.yaml` 与 `workspace:*` 规范依赖管理。
- [x] **Cordis 插件规范**：全包 ESM 规范，严格实现 `apply(ctx)` 与 `inject`。
- [x] **沙箱安全保障**：所有文件工具强制经由 `resolveInside` 校验，杜绝越界跳出工作区。
- [x] **高测试覆盖率**：共享库、UI 插件生命周期与编程工具全部具备独立自动化测试。
- [x] **自动化打包验证**：内置 `pack-bundles.mjs` 实现 CRC32 纯原生 zip 格式打包与元数据校验。

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

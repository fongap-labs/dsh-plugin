---
name: dsh-plugin-dev
description: DSH (DeepSeek Harness) 原生 Bundle / Host Plugin 开发与测试技能，适用于 `dsh-plugin` Monorepo 内的所有插件包。
---

# DSH Plugin Monorepo 开发技能
本技能文档定义 `dsh-plugin` Monorepo 内的规范开发工作流与界限。

## 命令速查

| 任务 | 命令 |
|---|---|
| 安装依赖（根目录） | `pnpm install` |
| 运行单元测试 | `pnpm test` |
| 编译/打包所有 Bundle | `pnpm build` |
| 仅校验（CI） | `pnpm build --check` 或 `pnpm validate` |
| 将本地插件链接到本地 Profile（软链+启用） | `pnpm link:dev <plugin-name>` |
| 将本地插件按指定通道安装到本地 Profile | `pnpm install:bundle <plugin-name>` |
| 从本地 Profile 移除插件 | `pnpm link:dev <plugin-name> --unlink` |
| 发布到 npm（读最新 git tag） | `pnpm release` |
| 预览发布（不实际发布） | `pnpm release:dry-run` |
| 生成发布 zip 到 `dist/` | `pnpm pack:bundles` |

## 目录结构

```
packages/
  shared/                  # 内部共享库：defineTool 封装、subprocess 安全调用、路径解析与沙箱校验
  dsh-ui-delta/            # UI 界面插件：Delta 样式系统、视觉/搜索代理端点
  dsh-code-worker/         # 编程插件：MultiEdit 批量编辑、Git 状态与差异、LSP 服务探测与工作流指引
  plugin-template/         # 标准模板插件：cp -r 即可创建新插件
scripts/
  link-profile.mjs         # 链接/安装/移除插件到本地 Profile
  pack-bundles.mjs         # 校验源码并打包 zip
  release.mjs              # 从 git tag 读版本、临时注入、编译、发布、还原
  build-release.ps1        # Action Worker per-plugin 构建脚本（通用入口）
tests/
  shared.test.mjs          # shared 单元测试
  dsh-ui-delta.test.mjs    # dsh-ui-delta 单元与集成测试
  dsh-code-worker.test.mjs # dsh-code-worker 单元与集成测试
```

## 新建插件 SOP（标准操作流程）

1. **复制模板**
   ```bash
   cp -r packages/plugin-template packages/plugin-my-awesome
   cd packages/plugin-my-awesome
   ```

2. **修改 `package.json`**
   - `"name": "@dsh-plugin/plugin-my-awesome"`
   - `"description": "你的插件一句话描述"`
   - `files` 保持默认；新增入口时同步添加。

3. **修改 `cordis.patch.yml`**
   - `id: my-awesome`（全局唯一、kebab-case）
   - `name: '@dsh-plugin/plugin-my-awesome'`（与包名一致）
   - `config:` 定义可配置参数，用户可在 profile 的 `cordis.patch.yml` 里覆盖。

4. **替换国际化文案**
   - `locale/en.json`、`zh.json`：填写 `meta.title`、`meta.description`
   - 双语标题不超过 40 字，描述不超过 120 字。

5. **替换图标**
   - `icon.svg`：原创或再分发许可（MIT / Apache-2.0 / CC-BY 等），≤ 256 KiB。
   - 不要用位图、外链 URL、带 symlink 的图标。

6. **编写 `src/index.ts`**
   - 必须导出 `apply(ctx, config)`，可选 `export const inject = [...]`
   - 使用 `@dsh-plugin/shared` 注册工具：
     ```ts
     import { defineTool, registerTool, resolveInside } from "@dsh-plugin/shared";

     export const inject = ["tools"];

     export function apply(ctx: Context, config: Record<string, unknown> | undefined) {
       const tool = defineTool({ name: "...", ... });
       registerTool(ctx, tool);
     }
     ```
   - 所有文件路径必须经 `resolveInside(workspaceRoot, userPath)` 校验越界。
   - 子进程统一用 `runCommand(ctx, { command, args, ... })`，自动回退到 `node:child_process`。
   - 宿主能力（`fs`、`workingDirectory`、`systemPrompt`、`subprocess`）用 `ctx.get?.("name")` 获取，不要写在 `inject` 里。

7. **本地调试**
   ```bash
   pnpm link:dev plugin-my-awesome
   ```
   脚本会在 `~/.dsh/profiles/<profile>/node_modules/` 下建软链，并写入 `dsh.profile.bundles`。
   - 默认 Profile 是 `desktop`，可用 `--profile <name>` 或 `DSH_PROFILE` 环境变量切换。
   - 标准通道等价 `dsh plugin --profile desktop add link:/abs/path/to/plugin-my-awesome`。

8. **运行测试与校验**
   ```bash
   pnpm test
   pnpm build
   ```

## Bundle 发布清单（发布前必检）

| 项 | 规则 |
|---|---|
| `package.json` | `"type": "module"`、`exports["."]`、`dsh.bundle.patch` 指向存在的文件 |
| `cordis.patch.yml` | 必须 `- insert:`，每行含 `id` 与 `name`（相等），可选 `config` |
| 国际化文案 | `locale/en.json`、`zh.json` 含 `meta.title`、`meta.description` |
| 图标 | `icon.svg` ≤ 256 KiB，合法 SVG，无外部引用 |
| 入口 | `src/index.ts` 导出 `apply` 与 `inject` |
| `files` | 含 `lib/**/*.js`、`lib/**/*.d.ts`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README.md` |
| 依赖隔离 | `shared` 不对外暴露业务逻辑；业务插件可依赖 `shared`（workspace:*） |

## 常见问题与排查

| 现象 | 原因 | 解决 |
|---|---|---|
| `pnpm install` 报 peer dependency 缺失 | `autoInstallPeers: false` 且未装宿主包 | 这是预期行为，宿主由 DSH 运行时提供，CI 用 `peerDependenciesMeta.optional: true` 闲置 |
| 插件在 Profile 不生效 | `cordis.patch.yml` 的 `id` 冲突，或未加载到 `dsh.profile.bundles` | 检查 `pnpm link:dev` 输出与 profile 的 `package.json` |
| `defineTool` 行为与宿主不一致 | 未 `await primeHostTools()` 或宿主未加载 | 建议在 `apply` 前 `await primeHostTools()`，或接受宿主本地定义 |
| 路径越界抛出 `SandboxViolationError` | `resolveInside` 拦截了越界路径 | 确保用户输入路径相对于工作区根目录，不要传绝对路径 |
| `ctx.subprocess` 不可用 | Profile 缺 `dsh-subprocess-local` | `runCommand` 会自动回退到 `node:child_process`，行文统一用它 |

## 发布流程

### Action Worker per-plugin 发布（推荐，生产环境）

`dsh-plugin` 走 Action Worker 的 `release-app.yml`，每个插件独立发布、独立 tag：

1. **源仓库合并到 `main`**：在 GitHub Actions 页面运行 `Notify Action Worker`，触发 central CI，合并后的 `main` 必须有通过的 CI 证据。
2. **在 action-worker 仓库手动运行 `release-app.yml`**：
   - `source_repository`: `fongap-labs/dsh-plugin`
   - `requested_version`: `vX.Y.Z`（如 `v1.2.3`），或 `vX.Y.Z-beta.N`
   - `product`: 要发布的插件目录名（三选一）
     - `dsh-code-worker` → `projects/dsh-code-worker/release.manifest.json`
     - `dsh-ui-delta` → `projects/dsh-ui-delta/release.manifest.json`
     - `plugin-template` → `projects/plugin-template/release.manifest.json`
   - `release-app.yml` 会读取 manifest，按 `-Package <product> -Target x86_64-pc-windows-msvc -Version X.Y.Z -OutputDir <dir>` 调用 `packages/<product>/build-release.ps1`。
3. **构建脚本做什么**：
   - 将目标插件的 `package.json` `version` 从占位符 `0.0.0` 暂时注入为 tag 版本；
   - 解析包管理器：优先 `pnpm`，缺失时回退 `npm exec pnpm@<packageManager 版本>`，再回退 `corepack pnpm`（runner 镜像不保证提供 pnpm shim）；同名候选只取 PATH 中第一个真实文件，逐个跑 `--version` 探针，不可用就继续回退；
   - `pnpm install --frozen-lockfile`；
   - `pnpm build` 编译全部 TypeScript 包（workspace:* 解析需要）；
   - `pnpm pack:bundles --package=<name>` 仅打包该插件；
   - 产物 `dist/<safe-name>-<version>.zip` 复制到 `OutputDir/<safe-name>.zip`；
   - `finally` 中恢复 `package.json` 原值（版本回到 `0.0.0`）。
4. **产物**：`dist/*.zip`，每个插件一个 zip；zip 内始终含 `package.json`（与 `npm pack` 一致），所以发布版本会随产物分发。Action Worker 会生成 SBOM 并派发 release 事件。
5. **清单字段的铁律**：`builds[].target` 必须是 rustup target triple（如 `x86_64-pc-windows-msvc`），因为 Action Worker 直接把它传给 `rustup toolchain install --target`；`node_version_file` 相对 `root` 解析（这里是 `packages/.nvmrc`），且必须是纯 ASCII 文本。`tests/release-manifest.test.mjs` 会校验这些约束。

### 本地预览发布（不走 Action Worker）

```bash
# 预览：inject → build → pack，不实际发布到 npm
pnpm release:dry-run --tag v1.2.3

# 实际发布到 npm（全部插件按依赖顺序）
pnpm release --tag v1.2.3
```

本地预览和 Action Worker 发布使用不同版本源：本地从本地 git tag 读；Action Worker 从 `requested_version` 输入读。

### `scripts/pack-bundles.mjs` 参数

| 参数 | 作用 |
|---|---|
| `--check` | 仅校验，不生成 zip（CI 推荐） |
| `--package=<name>` | 仅校验/打包指定包（Action Worker 构建脚本使用） |
| 无参数 | 校验 + 打包全部包 zip 到 `dist/` |

### `scripts/release.mjs` 参数

| 参数 | 作用 |
|---|---|
| `--tag vX.Y.Z` | 指定发布的 git tag（默认读 `git describe --tags --abbrev=0`） |
| `--dry-run` | 预览：注入版本、编译，但不执行 `pnpm publish` |
| `--registry <url>` | 发布到私有 npm 源 |

> **版本号约定**：所有 `package.json` 的 `version` 保持占位符 `0.0.0`，不在日常开发中维护。`scripts/release.mjs` 从 git tag 读取版本号，临时注入 `package.json`（同时设 `private: false`），编译、发布后自动还原原值。

## 关键内部 API 速查

### `@dsh-plugin/shared`（三模块）

```js
import { defineTool, primeHostTools, registerTool } from "@dsh-plugin/shared/tool";
await primeHostTools();         // 尝试加载宿主 defineTool
const tool = defineTool({ ... });
registerTool(ctx, tool);
```

```js
import { runCommand, runCommandOrThrow } from "@dsh-plugin/shared/subprocess";
await runCommand(ctx, { command, args, cwd, timeoutMs: 30_000 });
```

```js
import { resolveInside, isPathInside, SandboxViolationError } from "@dsh-plugin/shared";
const abs = resolveInside(workspaceRoot, userPath); // 越界抛错
```

### `scripts/link-profile.mjs` 参数

| 参数 | 作用 |
|---|---|
| `<plugin-name>` | 包名或 `packages/` 下目录名（支持前缀匹配） |
| `--profile <name>` | 目标 Profile，默认 `desktop` |
| `--install` | 走 DSH 官方安装通道（等价 `plugin_manager.install_bundle`） |
| `--unlink` | 移除链接并从 `dsh.profile.bundles` 摘除 |

## 约束与限制

- 不得修改只读的 `app.asar` 打包产物。
- 不得在插件中引入重型构建工具；DSH 原生 Bundle 仅需 TypeScript 源码经 `tsc` 编译。
- 不得使用 `require()` 加载 ESM；全链路 `"type": "module"`。
- 不要在 `cordis.patch.yml` 中写入 `disabled: true`（默认禁用），除非是为了覆盖 shipped 行。
- 版本号遵循语义化版本；破坏性改动升主版本，新增功能升次版本，修复升补丁版本。

## 相关链接

- 官方 DSH 文档：`dsh --help`、`dsh plugin --help`
- Cordis Loader patch 规范：`cordis-plugin-loader` README
- DSH 官方示例插件：`@deepseek-ai/dsh-base` 的 `cordis.patch.yml`
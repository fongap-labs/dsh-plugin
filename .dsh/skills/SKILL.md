---
name: dsh-plugin-dev
description: DSH (DeepSeek Harness) 原生 Bundle / Host Plugin 开发与调试技能。适用于创建、修改、校验、安装、发布本 Monorepo 内的任何插件包。
---

# DSH Plugin Monorepo 开发技能

本技能记录 `dsh-plugin` Monorepo 内的标准开发工作流与约定。

## 命令速查

| 任务 | 命令 |
| --- | --- |
| 安装依赖（根目录） | `pnpm install` |
| 运行全部测试 | `pnpm test` |
| 校验/打包所有 Bundle | `pnpm build` |
| 仅校验（CI） | `pnpm build --check` 或 `pnpm validate` |
| 将某插件链接到本地 Profile（软链 + 启用） | `pnpm link:dev <plugin-name>` |
| 将某插件按官方通道安装到本地 Profile | `pnpm install:bundle <plugin-name>` |
| 从本地 Profile 移除插件 | `pnpm link:dev <plugin-name> --unlink` |
| 生成发布 zip 到 `dist/` | `pnpm pack:bundles` |

## 目录约定

```
packages/
  shared/                  # 内部共享库：defineTool 回退、subprocess 降级、路径沙箱
  dsh-ui-delta/            # UI 界面插件：Delta 设计系统、样式层与端侧服务代理
  dsh-code-worker/         # 编程插件：MultiEdit 批量编辑、Git 与 LSP 工具
  plugin-template/         # 官方脚手架模板：cp -r 即可新建插件
scripts/
  link-profile.mjs         # 链接/安装/移除插件到本地 Profile
  pack-bundles.mjs         # 校验资源并打包 zip
tests/
  shared.test.mjs          # shared 库单元测试
  dsh-ui-delta.test.mjs    # dsh-ui-delta 单元与集成测试
  dsh-code-worker.test.mjs # dsh-code-worker 集成与回归测试
```

## 新建插件 SOP（标准操作程序）

1. **复制模板**
   ```bash
   cp -r packages/plugin-template packages/plugin-my-awesome
   cd packages/plugin-my-awesome
   ```

2. **修改 `package.json`**
   - `"name": "@dsh-plugin/plugin-my-awesome"`
   - `"description": "你的插件一句话描述"`
   - `files` 保持默认；新增资源时同步追加。

3. **修改 `cordis.patch.yml`**
   - `id: my-awesome`（全局唯一，kebab-case）
   - `name: '@dsh-plugin/plugin-my-awesome'`（与包名一致）
   - `config:` 声明可调参数，用户可在 profile 的 `cordis.patch.yml` 中覆盖。

4. **替换国际化资源**
   - `locale/en.json`、`zh.json`：填入 `meta.title` 与 `meta.description`。
   - 两语言必填，标题不超过 40 字，描述不超过 120 字。

5. **替换图标**
   - `icon.svg`：原创或可再分发（MIT / Apache-2.0 / CC-BY 等），≤ 256 KiB。
   - 不要用绝对路径、外链 URL、跳出包的 symlink。

6. **编写 `src/index.ts`**
    - 必须导出 `apply(ctx, config)`，可选 `export const inject = [...]`。
    - 使用 `@dsh-plugin/shared` 注册工具：
      ```ts
      import { defineTool, registerTool, resolveInside } from "@dsh-plugin/shared";

      export const inject = ["tools"];

      export function apply(ctx: Context, config: Record<string, unknown> | undefined) {
        const tool = defineTool({ name: "...", ... });
        registerTool(ctx, tool);
      }
      ```
    - 所有文件路径必须经 `resolveInside(workspaceRoot, userPath)` 校验沙箱。
    - 子进程统一用 `runCommand(ctx, { command, args, ... })`，自动回退到 node:child_process。
    - 宿主可选服务（`fs`、`workingDirectory`、`systemPrompt`、`subprocess`）用 `ctx.get?.("name")` 动态获取，不要写在 `inject` 里。

7. **本地联调**
    ```bash
    pnpm link:dev plugin-my-awesome
    ```
    脚本会在 `~/.dsh/profiles/<profile>/node_modules/` 下建立软链并把包名写入 `dsh.profile.bundles`。
    - 默认 Profile 为 `desktop`，可用 `--profile <name>` 或 `DSH_PROFILE` 环境变量切换。
    - 官方通道等价：`dsh plugin --profile desktop add link:/abs/path/to/plugin-my-awesome`。

8. **运行测试与校验**
    ```bash
    pnpm test
    pnpm build
    ```

## Bundle 合规清单（提交前必检）

| 项 | 规则 |
| --- | --- |
| `package.json` | `"type": "module"`、`exports["."]`、`dsh.bundle.patch` 指向存在的文件 |
| `cordis.patch.yml` | 顶层 `- insert:`，每行含 `id` 与 `name`（值等于包名），可选 `config` |
| 国际化 | `locale/en.json`、`zh.json` 均含 `meta.title`、`meta.description` |
| 图标 | `icon.svg` ≤ 256 KiB，合法 SVG，无外部引用 |
| 入口 | `src/index.ts` 导出 `apply` 与 `inject` |
| `files` | 包含 `lib/**/*.js`、`lib/**/*.d.ts`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`README.md` |
| 无循环依赖 | `shared` 不依赖任何业务插件；业务插件只依赖 `shared`（workspace:*） |

## 常见问题与排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| `pnpm install` 报 peer dependency 缺失 | `autoInstallPeers: false` 且未装宿主包 | 这是预期行为；宿主包由 DSH 运行时提供，CI 中以 `peerDependenciesMeta.optional: true` 静默 |
| 插件在 Profile 中不生效 | `cordis.patch.yml` 的 `id` 冲突，或未追加到 `dsh.profile.bundles` | 检查 `pnpm link:dev` 输出与 profile 的 `package.json` |
| `defineTool` 行为与宿主不一致 | 未 `await primeHostTools()` 或宿主版本差异 | 建议在 `apply` 前 `await primeHostTools()`，或接受本地回退语义 |
| 路径越界被拒绝 | `resolveInside` 抛 `SandboxViolationError` | 确认用户输入路径相对于工作区根，不要传绝对路径 |
| `ctx.subprocess` 不可用 | Profile 未挂载 `dsh-subprocess-local` | `runCommand` 会自动降级到 `node:child_process`，行为一致 |

## 发布流程

1. 确保 `pnpm test && pnpm build` 无错误。
2. 将 `package.json` 的 `"private": true` 改为 `false`。
3. 执行 `pnpm pack:bundles` 生成 `dist/*.zip`。
4. 对外发布时：
   - npm: `npm publish --access public`（需先登录）。
   - 私有源: `npm publish --registry <url>`。
5. 发布后可把 `private` 改回 `true` 以防误发。

> **注意**：本 Monorepo 仅维护源码与打包产物；`dist/*.zip` 不纳入版本控制。发布后建议把 zip 同步到内部制品库或 GitHub Releases。

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
| --- | --- |
| `<plugin-name>` | 包名或 `packages/` 下目录名（支持前缀匹配） |
| `--profile <name>` | 目标 Profile，默认 `desktop` |
| `--install` | 走 DSH 官方安装通道（等价 `plugin_manager.install_bundle`） |
| `--unlink` | 移除链接并从 `dsh.profile.bundles` 摘除 |

### `scripts/pack-bundles.mjs` 参数

| 参数 | 作用 |
| --- | --- |
| `--check` | 仅校验，不生成 zip（CI 推荐） |
| 无参数 | 校验 + 打包 zip 到 `dist/` |

## 约束与限制

- 不得修改只读的 `app.asar` 打包产物。
- 不得在插件中引入重型构建工具（Webpack、Vite、esbuild、rollup 等）；DSH 原生 Bundle 仅需 TypeScript 源码经 `tsc` 编译。
- 不得使用 `require()` 加载 ESM；全链路 `"type": "module"`。
- 不要在 `cordis.patch.yml` 中写入 `disabled: true`（默认禁用），除非是为了覆盖 shipped 行。
- 版本号遵循语义化版本；破坏性改动升主版本，新增功能升次版本，修复升补丁版本。

## 相关链接

- 官方 DSH 文档：`dsh --help`、`dsh plugin --help`
- Cordis Loader patch 语法：`cordis-plugin-loader` README
- DSH 示例插件：`@deepseek-ai/dsh-base` 的 `cordis.patch.yml`
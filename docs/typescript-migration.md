# TypeScript 标准化：迁移依据与工程边界

本文件记录 `dsh-plugin` 将产品源码统一为 TypeScript 的**架构依据**、**范围**与**验证方式**。它是共用治理要求的架构变更依据材料，不是新的共用规则。

---

## 1. 决策

产品源码统一使用 TypeScript：

- Host 插件源码 → `tsc` 编译为 `lib/*.js`（ESM），声明文件与 JS 同目录（`lib/*.d.ts`）。
- Browser 客户端源码 → `tsc` 编译为 `lib/client.js`，保留 `window.__ModuleLoader__.load({ factory(require) { … } })` 包装结构，不做打包。
- 工程脚本（`scripts/*.mjs`）与测试（`tests/*.mjs`）保留原生 JavaScript，因为它们直接由 Node 执行，没有类型契约收益。
- 构建基础只有 `tsc`；不引入 Vite / Webpack / esbuild / rollup / tsx。

---

## 2. 为什么这不是"仅为统一技术栈而重写"

`action-worker` 的 `01_SHARED_GOVERNANCE.md` §3 与 `ARCHITECTURE_GOVERNANCE.md` §2.1 明确禁止"仅为统一技术栈"的重写，并要求每一个长期保留的语言边界都能回答"这个边界为什么需要这种语言"。

本仓库的迁移依据不是语言偏好，而是三条具体事实：

### 2.1 偏离了上游官方的发布形态

上游 `deepseek-ai/deepseek-harness` 的生产级插件（例如 `packages/shell/tool-bash`）结构为：

| 项 | 上游官方做法 |
| --- | --- |
| 源码 | `src/index.ts`（TypeScript） |
| 运行时入口 `main` | `lib/index.js`（tsc 编译产物） |
| 类型入口 `types` | `lib/types/index.d.ts` |
| `exports["."]` | `{ types, default }` 双条件 |
| 发布 `files` | `locale/*.json`、`lib/index.js`、`lib/types/**/*.d.ts` |
| 构建 | 仅 `tsc`，无打包器 |

本仓库此前把 `main` 直接指向 `src/index.js`，即**把源码当发行产物**。这不是风格问题：它让发行包不携带任何类型契约，也让源码结构与官方 Bundle 约定长期分叉。

### 2.2 缺失编译期契约会直接放大版本漂移风险

项目目标之一是"尽可能不受 deepseek-harness 版本影响"。当前 `peerDependencies` 声明为 `@deepseek-ai/dsh-tools@0.2.1-rc.3`、`@deepseek-ai/cordis@~4.0.5`，这两个包**自带完整的 `.d.ts`**（`lib/types/*.d.ts`）。

在纯 JavaScript 下，上游契约变化（`ctx.tools.register` 签名、`ParameterSchemaSpec` 结构、`Context` 服务增强）只会在运行时暴露。迁移后，同一变化在 `tsc` 阶段即失败。这是可用于验证的具体收益，而非"统一语言"的收益。

### 2.3 消除重复的本地契约

`packages/shared` 目前自行实现了 `defineTool` 回退与 Schema 编译器。迁移后这些实现直接对齐官方 `ParameterSchemaSpec` / `ValueSchemaSpec` / `DefineToolOptions` 类型，本地实现与上游编译器共享同一套类型定义，避免两套契约各自漂移。

> 仍然保留回退实现本身：它服务于"宿主包缺失"的运行环境（单元测试、CI、脚手架预览），这是既有安全与可用性设计，迁移不改变它。

### 2.4 成本侧

- 不新增运行时依赖：`typescript` 与 `@deepseek-ai/*` 类型包全部是 **devDependencies**，不会进入发行 Bundle。
- 不新增运行时：Node 仍是唯一运行时，产物是标准 ESM。
- 不引入打包器，不改变模块解析体系。

---

## 3. `tsc` 与"禁止重型构建工具"

`.dsh/skills/SKILL.md` 现行约束为：

> 不得在插件中引入重型构建工具（Webpack、Vite、esbuild 等）；DSH 原生 Bundle 仅需 ESM 源码。

本迁移对该约束的处理：

1. `tsc` 是**类型编译器**，不是打包器。它不做模块合并、不注入运行时、不改变模块边界；输入是 ESM 源码，输出仍是逐文件 ESM。
2. 约束中列举的工具（Webpack / Vite / esbuild）都会改变产物形态或引入运行时胶水；`tsc` 不会。
3. 上游官方插件同样只用 `tsc`，因此"只用 `tsc`"是与官方一致的形态，而不是新增的构建负担。

结论：**约束中"重型构建工具"指打包器，`tsc` 不在其内**。该判断需要写入 `SKILL.md` 正文（见 PR-4），否则文档与实际实现会互相矛盾。

---

## 4. 范围

### 4.1 纳入迁移的产品源码

| 现文件 | 目标文件 | 分类 | 实测行数 |
| --- | --- | --- | ---: |
| `packages/shared/src/index.js` | `packages/shared/src/index.ts` | 共享模块 | 84 |
| `packages/shared/src/tool.js` | `packages/shared/src/tool.ts` | 共享模块 | 359 |
| `packages/shared/src/subprocess.js` | `packages/shared/src/subprocess.ts` | 共享模块 | 267 |
| `packages/dsh-code-worker/src/index.js` | `packages/dsh-code-worker/src/index.ts` | Host 插件 | 608 |
| `packages/dsh-ui-delta/index.js` | `packages/dsh-ui-delta/src/index.ts` | Host 插件 | 454 |
| `packages/dsh-ui-delta/client.js` | `packages/dsh-ui-delta/src/client.ts` | Browser 客户端 | 3135 |
| `packages/plugin-template/src/index.js` | `packages/plugin-template/src/index.ts` | 插件模板 | 85 |

合计 7 个文件、4992 行（`wc -l` 口径，含文件末尾空行差异；规划文档中的 4533 行为另一种统计口径）。

`dsh-ui-delta` 的 Host 入口同时从包根迁移到 `src/`，这是目录结构调整而非重命名。

### 4.2 明确保留 JavaScript

| 文件 | 保留原因 |
| --- | --- |
| `scripts/*.mjs`（6 个） | Node 直接执行的工程脚本，无宿主类型契约可对齐 |
| `tests/*.mjs`（3 个） | Node 内置测试运行器入口；测试对象是编译产物 `lib/`，不是源码 |
| `locale/*.json`、`cordis.patch.yml`、`icon.svg`、`*.md` | 非源码资源，保持原格式 |

---

## 5. 运行与发布形态

### 5.1 Host

```
src/*.ts --tsc--> lib/*.js + lib/*.d.ts
package.json: main = ./lib/index.js, types = ./lib/index.d.ts
exports["."] = { types: ./lib/index.d.ts, default: ./lib/index.js }
```

生产 Bundle 内只有可执行 JavaScript，不含 `.ts` 源码。

### 5.2 Browser

`packages/dsh-ui-delta` 使用两份 tsconfig：

- `tsconfig.json`：Node 半（`src/index.ts`），`module`/`moduleResolution` 为 `node16`，`lib` 仅 ES2022。
- `tsconfig.client.json`：Browser 半（`src/client.ts`），`module: es2022`、`lib: ["ES2022","DOM","DOM.Iterable"]`、`declaration: false`、`verbatimModuleSyntax: false`、`types: []`、`moduleResolution: bundler`。

`tsc` 不改变 `window.__ModuleLoader__.load({ id, factory(require) { … } })` 结构；`require` 由宿主模块加载器在运行时注入，不是 Node 的 `require`。

---

## 6. 验证

每个 PR 必须独立通过：

```bash
tsc -p packages/shared/tsconfig.json            # 先产出 shared 的 .d.ts（依赖方类型检查的前提）
tsc -p <每个 host 包>/tsconfig.json --noEmit    # typecheck
tsc -p <每个包>/tsconfig.json                   # build
node --test "tests/**/*.test.mjs"                # 针对 lib/ 的回归
node scripts/pack-bundles.mjs --check            # Bundle 完整性
```

Host 插件通过 `@dsh-plugin/shared` 的 `lib/*.d.ts` 取得共享类型。干净检出时这些声明文件尚不存在，
因此 typecheck 阶段先编译 shared 包（编译本身即完成 shared 的类型检查），再对依赖方执行
`--noEmit` 检查；否则依赖方会以“找不到模块 `@dsh-plugin/shared`”失败。

`typecheck` 通过不等于迁移成功；测试、Bundle 校验与真实 Profile 安装验证各自独立成立。

### 6.1 已记录的验证限制

- `skipLibCheck: true` 是必需的：宿主 peer 依赖图（`dsh-agent`、`dsh-session`、`dsh-scope` 等）只由运行时提供，本地未安装；它们在被引用的 `.d.ts` 中退化为 `any`。本仓库实际消费的契约（`Context`、`defineTool`、Schema、`ToolDefinition`、`ToolRuntime`）均来自已安装的 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-tools`，是真实检查的。

---

## 7. 回退策略

迁移按四个 PR 递进，每个 PR 都可独立回退：

1. 基础设施 + `packages/shared`
2. Host 插件 + Bundle 打包校验
3. Browser 客户端
4. 模板、文档与收尾

任一 PR 回退后，仓库仍应处于"可构建、可测试、Bundle 可校验"的状态。因此每个 PR 只改自己范围内的包，不留下半迁移状态。

---

## 8. 批准状态

- 依据材料：本文件。
- 范围与验收标准：由仓库所有者下达的迁移任务书定义。
- 治理冲突点：`01_SHARED_GOVERNANCE.md` §3 的"禁止仅为统一技术栈重写"与本次全量迁移之间的张力，由 §2 的工程依据消解；如果审查认为依据不足，应在本文件补充证据后再实施，而不是绕过该条规则。

# @dsh-plugin/shared

DSH 插件 Monorepo 内部共享库。为各 Bundle 提供与宿主解耦的通用能力，使插件在
「有完整 DSH 宿主」与「无宿主的测试 / CI / 脚手架预览」两种环境下都能工作。

## 模块

源码为 TypeScript（`src/*.ts`），经 `pnpm build` 编译为 `lib/*.js` 与同目录的 `lib/*.d.ts`。

| 模块 | 职责 |
| --- | --- |
| `src/tool.ts` → `lib/tool.js` | `defineTool` 容错封装与 Schema 校验。 |
| `src/subprocess.ts` → `lib/subprocess.js` | `ctx.subprocess` 安全调用与降级。 |
| `src/index.ts` → `lib/index.js` | 路径解析与沙箱校验，并再导出上述两个模块。 |

## `lib/tool.js`

```ts
import { defineTool, primeHostTools, registerTool } from "@dsh-plugin/shared";

await primeHostTools();   // 可选：尝试加载宿主 @deepseek-ai/dsh-tools 的 defineTool

const tool = defineTool({
  name: "my_tool",
  description: "...",
  parameters: { path: { type: "string", required: true, description: "..." } },
  output: {
    schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean", required: true } } },
    render: (_args, value) => [{ type: "text", text: String(value.ok) }],
  },
  async execute(args, exec) { return { ok: true }; },
});

const result = registerTool(ctx, tool);   // { registered, disposer?, error? }
```

- 参数与输出声明使用官方 `ParameterSchemaSpec` / `ValueSchemaSpec` 形状，`args` 与
  `value` 自动推导，因此对象节点必须显式声明 `additionalProperties`。
- `primeHostTools()` 幂等；加载失败时静默降级，插件不会因一次 import 失败而不可用。
- 本地回退实现复刻宿主 `defineTool` 的编译产物形状：参数属性映射会被编译成
  `type: "object"` 根的 JSON Schema，`required: true` 标记会聚合成 `required` 数组。
  回退实现支持 `type` / `enum` / `items` / `properties` / `description` 子集，
  更复杂的 schema 请确保宿主依赖可用。
- `registerTool()` 在 `ctx.tools` 缺失时降级为 warn 并返回 `{ registered: false }`，
  不会让整个 profile 启动失败。

## `lib/subprocess.js`

```ts
import { runCommand, runCommandOrThrow } from "@dsh-plugin/shared";


const result = await runCommand(ctx, {
  command: "git",
  args: ["status", "--porcelain=v1"],
  cwd: workspaceRoot,
  timeoutMs: 30_000,
});
// { stdout, stderr, exitCode, signal, timedOut, lossy, source: "host" | "node" }
```

宿主 `ctx.subprocess` 可用时走 `ctx.subprocess.spawn()`（继承凭据清洗、作业对象托管、
输出上限与 spill），否则回退到 `node:child_process`，两者返回同一形状。

## `lib/index.js` 路径与沙箱

```ts
import { resolveInside, isPathInside, SandboxViolationError } from "@dsh-plugin/shared";

const absolute = resolveInside(workspaceRoot, userSuppliedPath); // 越界即抛错
```

- `resolveInside(root, candidate)`：解析为 root 内的绝对路径，越界抛 `SandboxViolationError`。
- `isPathInside(root, target)`：布尔判定，不解析符号链接。
- `tryResolveInside(root, candidate)`：失败返回 `undefined`，用于可选路径。

## 使用约束

- 本包仅供本 Monorepo 内部使用（`private: true`），不作为公开 npm 包发布。
- 插件之间通过它共享能力，但不得形成循环依赖：本包不依赖任何业务插件。

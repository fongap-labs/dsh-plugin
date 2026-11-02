# @fongap-labs/shared

DSH 插件工作区共享库，为业务插件提供工具注册、子进程调用、路径解析与沙箱校验能力。本包是可分发的 npm 依赖，不是独立的 DSH 插件；依赖它的插件通过 `bundleDependencies` 将其一并打入安装包。

## 模块

源码使用 TypeScript（`src/*.ts`），由根目录 `pnpm build` 编译为 `lib/*.js` 与同目录声明文件。

| 模块 | 导出 | 职责 |
| --- | --- | --- |
| `@fongap-labs/shared/tool` | `defineTool`、`primeHostTools`、`registerTool` | 宿主工具注册与无宿主测试环境回退 |
| `@fongap-labs/shared/subprocess` | `runCommand`、`runCommandOrThrow` | 优先使用宿主子进程服务，并提供受限回退 |
| `@fongap-labs/shared` | `resolveInside`、`isPathInside`、`tryResolveInside`、`SandboxViolationError` | 工作区路径解析与越界校验 |

## 工具注册

```ts
import { defineTool, primeHostTools, registerTool } from "@fongap-labs/shared/tool";

await primeHostTools(); // 可选且幂等：尝试加载宿主 defineTool

const tool = defineTool({
  name: "my_tool",
  description: "...",
  parameters: {
    path: { type: "string", required: true, description: "..." },
  },
  async execute(args, exec) {
    return { ok: true };
  },
});

registerTool(ctx, tool);
```

参数和输出声明遵循当前宿主的 `ParameterSchemaSpec` / `ValueSchemaSpec` 类型。宿主工具服务不可用时，注册过程会返回未注册结果，不应导致整个 Profile 启动失败。

## 子进程

```ts
import { runCommand, runCommandOrThrow } from "@fongap-labs/shared/subprocess";

const result = await runCommand(ctx, {
  command: "git",
  args: ["status", "--porcelain=v1"],
  cwd: workspaceRoot,
  timeoutMs: 30_000,
});
```

宿主 `ctx.subprocess` 可用时优先使用宿主服务；否则回退到 `node:child_process`。调用方统一处理同一结果结构，不应自行拼接 shell 命令。

## 路径与沙箱

```ts
import { resolveInside, isPathInside, SandboxViolationError } from "@fongap-labs/shared";

const absolute = resolveInside(workspaceRoot, userSuppliedPath);
```

- `resolveInside(root, candidate)`：解析为 root 内绝对路径；越界时抛出 `SandboxViolationError`。
- `isPathInside(root, target)`：判断路径是否位于 root 内，不解析符号链接。
- `tryResolveInside(root, candidate)`：无法安全解析时返回 `undefined`。

## 依赖边界

- 本包不依赖任何业务插件，不得形成循环依赖。
- 不在此处放置 Delta UI、Code Worker 等产品专属逻辑。
- 业务插件使用 `workspace:*` 声明依赖，并在 `bundleDependencies` 中列出本包。
- 根目录默认许可证为 Apache-2.0；本包当前显式采用 Apache-2.0。许可证变更必须同步本目录 `LICENSE` 与对应发布元数据。

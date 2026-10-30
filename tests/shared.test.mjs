/**
 * @dsh-plugin/shared 单元测试
 * 运行：pnpm test
 */

import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const tool = await import("../packages/shared/src/tool.js");
const subprocess = await import("../packages/shared/src/subprocess.js");
const index = await import("../packages/shared/src/index.js");

const NODE_PRINT = [resolve(process.execPath), "-e", "process.stdout.write('hello')"];

describe("shared/tool.js", () => {
  it("compileParameterSchema: required 标记聚合到 required 数组", () => {
    const spec = { path: { type: "string", required: true, description: "desc" } };
    const compiled = tool.compileParameterSchema(spec);
    assert.deepEqual(compiled.type, "object");
    assert.ok(compiled.required.includes("path"));
    assert.equal(compiled.properties.path.type, "string");
    assert.ok(!compiled.properties.path.required);
  });

  it("compileValueSchema: nested properties 与 items 编译", () => {
    const spec = {
      type: "object",
      additionalProperties: false,
      properties: { files: { type: "array", required: true, items: { type: "string" } } },
    };
    const compiled = tool.compileValueSchema(spec);
    assert.equal(compiled.type, "object");
    // compileValueSchema 用于 output.schema：根节点不应有 required，required: true 标记在子属性上被消费
    assert.ok(!Array.isArray(compiled.required));
    assert.equal(compiled.properties.files.type, "array");
    assert.equal(compiled.properties.files.items.type, "string");
  });

  it("validateAgainstSchema: required 字段缺失产生违规", () => {
    const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const violations = tool.validateAgainstSchema(schema, {}, "root");
    assert.ok(violations.some((v) => v.includes("root.a") && v.includes("required")));
  });

  it("validateAgainstSchema: type mismatch 产生违规", () => {
    const schema = { type: "object", properties: { n: { type: "number" } } };
    const violations = tool.validateAgainstSchema(schema, { n: "not-a-number" }, "args");
    assert.ok(violations.some((v) => v.includes("args.n") && v.includes("number")));
  });

  it("defineTool (fallback): 产出可直接 register 的 definition 形状", async () => {
    // 确保未加载宿主，使用 fallback
    const t = tool.defineTool({
      name: "test_tool",
      description: "desc",
      parameters: { x: { type: "string", required: true } },
      output: { schema: { type: "object", properties: { ok: { type: "boolean", required: true } } }, render: () => [{ type: "text", text: "ok" }] },
      async execute(args) { return { ok: true }; },
    });
    assert.equal(t.name, "test_tool");
    assert.ok(t.parameters.required.includes("x"));
    assert.ok(typeof t.output.render === "function");
    assert.ok(typeof t.execute === "function");
  });

  it("defineTool fallback: 参数校验失败抛出 ToolArgsError", async () => {
    const t = tool.defineTool({
      name: "test_validate",
      description: "d",
      parameters: { req: { type: "string", required: true } },
      output: { schema: { type: "string" }, render: (_, v) => [{ type: "text", text: v }] },
      async execute(args) { return args.req; },
    });
    let thrown = false;
    try {
      await t.execute({}, { signal: new AbortController().signal });
    } catch (error) {
      assert.ok(error instanceof tool.ToolArgsError);
      thrown = true;
    }
    assert.ok(thrown);
  });

  it("assertToolDefinition: 通过最小合法 definition", () => {
    const def = {
      name: "ok",
      description: "ok",
      parameters: { type: "object", properties: {} },
      output: { schema: { type: "string" }, render: () => [] },
      execute: async () => {},
    };
    assert.doesNotThrow(() => tool.assertToolDefinition(def));
  });

  it("registerTool: ctx.tools 缺失时返回 { registered: false }", () => {
    const def = { name: "t", description: "d", parameters: {}, output: { schema: { type: "string" }, render: () => [] }, execute: async () => {} };
    const result = tool.registerTool({}, def);
    assert.equal(result.registered, false);
    assert.ok(result.error instanceof tool.ToolDefinitionError);
  });
});

describe("shared/subprocess.js", () => {
  it("isSubprocessAvailable: ctx.subprocess.spawn 为函数时返回 true", () => {
    const ctx = { subprocess: { spawn: () => {} } };
    assert.ok(subprocess.isSubprocessAvailable(ctx));
  });

  it("isSubprocessAvailable: 缺失时返回 false", () => {
    assert.ok(!subprocess.isSubprocessAvailable({}));
    assert.ok(!subprocess.isSubprocessAvailable({ subprocess: {} }));
    assert.ok(!subprocess.isSubprocessAvailable(null));
  });

  it("runCommand: 降级到 node:child_process 并返回统一形状", async () => {
    const result = await subprocess.runCommand(null, {
      command: NODE_PRINT[0],
      args: NODE_PRINT.slice(1),
      timeoutMs: 5000,
      maxOutputBytes: 1024,
    });
    assert.ok(result.source === "node");
    assert.ok(typeof result.stdout === "string");
    assert.ok(result.stdout.includes("hello"));
    assert.ok(Number.isInteger(result.exitCode));
  });

  it("runCommandOrThrow: 非零退出码抛出 SubprocessError", async () => {
    let thrown = false;
    try {
      await subprocess.runCommandOrThrow(null, {
        command: process.platform === "win32" ? "cmd" : "sh",
        args: process.platform === "win32" ? ["/c", "exit", "1"] : ["-c", "exit 1"],
        timeoutMs: 5000,
      });
    } catch (error) {
      assert.ok(error instanceof subprocess.SubprocessError);
      assert.ok(error.exitCode === null || error.exitCode === 1);
      thrown = true;
    }
    assert.ok(thrown);
  });
});

describe("shared/index.js 路径与沙箱", () => {
  const winRoot = resolve("/root");
  const winProjectRoot = resolve("/workspace/project");

  it("resolveInside: 合法相对路径返回绝对路径", () => {
    const abs = index.resolveInside(winProjectRoot, "src/index.js");
    assert.equal(abs, resolve("/workspace/project/src/index.js"));
  });

  it("resolveInside: 越界路径抛出 SandboxViolationError", () => {
    assert.throws(() => index.resolveInside(winProjectRoot, "../../../etc/passwd"), index.SandboxViolationError);
    assert.throws(() => index.resolveInside(winProjectRoot, "/absolute/outside"), index.SandboxViolationError);
  });

  it("isPathInside: 判定正确", () => {
    assert.ok(index.isPathInside(winRoot, resolve("/root/sub/file.txt")));
    assert.ok(index.isPathInside(winRoot, winRoot));
    assert.ok(!index.isPathInside(winRoot, resolve("/root/../outside")));
    assert.ok(!index.isPathInside(winRoot, resolve("/other")));
  });

  it("tryResolveInside: 越界返回 undefined 而不抛错", () => {
    const ok = index.tryResolveInside(winRoot, "sub/file");
    assert.equal(ok, resolve("/root/sub/file"));
    assert.equal(index.tryResolveInside(winRoot, "../../../etc/passwd"), undefined);
  });

  it("SandboxViolationError 携带 root/target", () => {
    let caught;
    try { index.resolveInside(winRoot, "../../out"); } catch (e) { caught = e; }
    assert.ok(caught instanceof index.SandboxViolationError);
    assert.equal(caught.root, winRoot);
    assert.ok(caught.target.endsWith("out"));
  });
});
/**
 * dsh-code-worker 集成/回归测试
 * 通过 mock 的 Cordis ctx 捕获插件真实注册的工具，并直接执行它们。
 * 运行：pnpm test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const codeWorker = await import("../packages/dsh-code-worker/src/index.js");
const shared = await import("../packages/shared/lib/index.js");

const NODE_PRINT = [resolve(process.execPath), "-e", "process.stdout.write('hello')"];

function createContext() {
  const registered = new Map();
  const warnings = [];
  const ctx = {
    registered,
    warnings,
    logger: { warn: (message) => warnings.push(String(message)) },
    inject: (deps, callback) => {
      callback({
        systemPrompt: {
          getSectionOrder: () => 1300,
          section: () => () => {},
        },
      });
    },
    get: () => undefined,
    tools: {
      register(definition) {
        registered.set(definition.name, definition);
        return () => registered.delete(definition.name);
      },
    },
  };
  return ctx;
}

describe("dsh-code-worker", () => {
  let workspace;
  let ctx;

  before(async () => {
    workspace = await mkdtemp(join(tmpdir(), "dsh-code-worker-"));
    ctx = createContext();
    const disposer = codeWorker.apply(ctx, {
      enabled: true,
      workspaceRoot: workspace,
      git: { enabled: true, command: "git" },
      lsp: { servers: [{ language: "typescript", command: "typescript-language-server", args: ["--stdio"] }] },
    });
    assert.ok(typeof disposer === "function");
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("插件声明元信息正确", () => {
    assert.equal(codeWorker.name, "dsh-code-worker");
    assert.deepEqual(codeWorker.inject, ["tools"]);
  });

  it("注册了预期的工具集合", () => {
    const names = [...ctx.registered.keys()].sort();
    assert.deepEqual(names, ["code_git_diff", "code_git_status", "code_lsp_probe", "code_multi_edit"]);
  });

  it("code_multi_edit: dryRun 不写盘", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      { edits: [{ path: "a.txt", content: "hello" }], dryRun: true },
      { signal: new AbortController().signal },
    );
    assert.equal(result.dryRun, true);
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].action, "overwrite");
    await assert.rejects(readFile(join(workspace, "a.txt"), "utf8"));
  });

  it("code_multi_edit: 实际写入文件内容", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      { edits: [{ path: "nested/b.txt", content: "world" }] },
      { signal: new AbortController().signal },
    );
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].ok, true);
    assert.equal(await readFile(join(workspace, "nested/b.txt"), "utf8"), "world");
  });

  it("code_multi_edit: find/replace 替换首个匹配", async () => {
    await writeFile(join(workspace, "c.txt"), "alpha beta alpha", "utf8");
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      { edits: [{ path: "c.txt", find: "alpha", replace: "gamma" }] },
      { signal: new AbortController().signal },
    );
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].action, "replace");
    assert.equal(await readFile(join(workspace, "c.txt"), "utf8"), "gamma beta alpha");
  });

  it("code_multi_edit: 越界路径被沙箱拒绝且不影响其它编辑", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      {
        edits: [
          { path: "../../../../escape.txt", content: "nope" },
          { path: "safe.txt", content: "yes" },
        ],
      },
      { signal: new AbortController().signal },
    );
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].note, /sandbox/i);
    assert.equal(result.results[1].ok, true);
    assert.equal(await readFile(join(workspace, "safe.txt"), "utf8"), "yes");
  });

  it("code_multi_edit: find 未命中时跳过该编辑", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      { edits: [{ path: "c.txt", find: "not-present", replace: "x" }] },
      { signal: new AbortController().signal },
    );
    assert.equal(result.applied, 0);
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].note, /not present/i);
  });

  it("code_git_status: 返回结构化结果", async () => {
    const tool = ctx.registered.get("code_git_status");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.ok(Array.isArray(result.staged));
    assert.ok(Array.isArray(result.unstaged));
    assert.ok(Array.isArray(result.untracked));
    assert.equal(typeof result.clean, "boolean");
  });

  it("code_git_diff: 返回 diff 字段", async () => {
    const tool = ctx.registered.get("code_git_diff");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.equal(typeof result.diff, "string");
    assert.equal(typeof result.truncated, "boolean");
  });

  it("code_lsp_probe: 返回逐服务探测结论", async () => {
    const tool = ctx.registered.get("code_lsp_probe");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.ok(Array.isArray(result.servers));
    assert.equal(result.servers.length, 1);
    assert.equal(result.servers[0].language, "typescript");
    assert.equal(typeof result.servers[0].available, "boolean");
  });

  it("code_lsp_probe: 可注入探测成功的虚构命令", async () => {
    const probeCtx = createContext();
    codeWorker.apply(probeCtx, {
      enabled: true,
      workspaceRoot: workspace,
      lsp: {
        servers: [
          {
            language: "dummy",
            command: NODE_PRINT[0],
            args: NODE_PRINT.slice(1),
          },
        ],
      },
    });
    const tool = probeCtx.registered.get("code_lsp_probe");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.equal(result.servers[0].language, "dummy");
    assert.equal(result.servers[0].available, true);
  });

  it("disposer 可卸载所有已注册工具", () => {
    const unregisterCtx = createContext();
    const disposer = codeWorker.apply(unregisterCtx, {
      enabled: true,
      workspaceRoot: workspace,
    });
    assert.equal(unregisterCtx.registered.size, 4);
    disposer();
    assert.equal(unregisterCtx.registered.size, 0);
  });
});

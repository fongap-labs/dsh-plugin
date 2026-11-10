/**
 * dsh-delta-code integration and regression tests
 * 通过 mock 的 Cordis ctx 捕获插件真实注册的工具，并直接执行它们。
 * 运行：pnpm test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const codeWorker = await import("../packages/dsh-delta-code/lib/index.js");
const shared = await import("../packages/shared/lib/index.js");

const NODE_PRINT = [resolve(process.execPath), "-e", "process.stdout.write('hello')"];

function createContext() {
  const registered = new Map();
  const warnings = [];
  const skills = new Map();
  const ctx = {
    registered,
    warnings,
    registeredSkills: skills,
    logger: { warn: (message) => warnings.push(String(message)) },
    inject: (deps, callback) => {
      if (deps.includes("skills")) {
        callback({ skills: { register(skill) {
          skills.set(skill.name, skill);
          return () => skills.delete(skill.name);
        } } });
        return;
      }
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


function createGitSubprocess(output, exitCode = 0) {
  return { spawn() {
    return {
      done: Promise.resolve({ exitCode }),
      collected: {
        stdout: { readFrom: () => ({ text: output, lossy: false }) },
        stderr: { readFrom: () => ({ text: "", lossy: false }) },
      },
    };
  } };
}

describe("dsh-delta-code", () => {
  let workspace;
  let ctx;

  before(async () => {
    workspace = await mkdtemp(join(tmpdir(), "dsh-delta-code-"));
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

  it("native skills register with content and dispose cleanly", async () => {
    const fresh = createContext();
    const dispose = codeWorker.apply(fresh, { workspaceRoot: workspace });
    const names = [...fresh.registeredSkills.keys()];
    assert.equal(names.length, 21);
    assert.equal(new Set(names).size, names.length);
    for (const name of ["code-fast-change", "code-workflow", "code-brainstorming", "code-writing-plans",
      "code-executing-plans", "code-subagent-delivery", "code-test-driven-development",
      "code-parallel-work", "code-worktrees", "code-verification-gate", "code-finish-branch", "code-autonomous-loop", "code-ci-repair"]) {
      assert.ok(fresh.registeredSkills.has(name), name);
    }
    assert.match(fresh.registeredSkills.get("code-feature-delivery").content, /acceptance/);
    dispose();
    assert.equal(fresh.registeredSkills.size, 0);
  });

  it("插件声明元信息正确", () => {
    assert.equal(codeWorker.name, "@fongap-labs/dsh-delta-code");
    assert.deepEqual(codeWorker.inject, ["tools", "subprocess"]);
  });

  it("注册了预期的工具集合", () => {
    const names = [...ctx.registered.keys()].sort();
    assert.deepEqual(names, ["code_delivery_gate", "code_git_diff", "code_git_status", "code_git_worktree", "code_host_probe", "code_lsp_probe", "code_multi_edit", "code_project_profile", "code_resume", "code_verify", "code_verify_suite", "code_workflow_route", "code_workspace_map"]);
  });

  it("code_multi_edit: local fallback rejects symlink escapes on reads and writes", { skip: process.platform === "win32" }, async () => {
    const outside = await mkdtemp(join(tmpdir(), "dsh-delta-code-outside-"));
    const linkedFile = join(workspace, "external-file.txt");
    const linkedDir = join(workspace, "external-dir");
    try {
      const secret = join(outside, "secret.txt");
      await writeFile(secret, "must-not-change", "utf8");
      await symlink(secret, linkedFile);
      await symlink(outside, linkedDir, "dir");
      const tool = ctx.registered.get("code_multi_edit");
      const result = await tool.execute({ edits: [
        { path: "external-file.txt", content: "outside-overwrite" },
        { path: "external-file.txt", find: "must-not-change", replace: "outside-replace" },
        { path: "external-dir/created.txt", content: "outside-created" },
      ] }, { signal: new AbortController().signal });
      assert.equal(result.applied, 0);
      assert.equal(result.results.length, 3);
      assert.ok(result.results.every(entry => !entry.ok && /sandbox|symbolic.link|escapes/i.test(entry.note)));
      assert.equal(await readFile(secret, "utf8"), "must-not-change");
      await assert.rejects(readFile(join(outside, "created.txt"), "utf8"), { code: "ENOENT" });
    } finally {
      await rm(linkedFile, { force: true });
      await rm(linkedDir, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
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

  it("code_multi_edit: empty content is a valid overwrite", async () => {
    await writeFile(join(workspace, "empty.txt"), "before", "utf8");
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute({ edits: [{ path: "empty.txt", content: "" }] }, { signal: new AbortController().signal });
    assert.equal(result.applied, 1);
    assert.equal(await readFile(join(workspace, "empty.txt"), "utf8"), "");
  });

  it("code_multi_edit: rejects empty find without modifying content", async () => {
    await writeFile(join(workspace, "empty-find.txt"), "before", "utf8");
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute({ edits: [{ path: "empty-find.txt", find: "", replace: "x" }] }, { signal: new AbortController().signal });
    assert.equal(result.applied, 0);
    assert.equal(result.results[0].ok, false);
    assert.equal(await readFile(join(workspace, "empty-find.txt"), "utf8"), "before");
  });

  it("code_project_profile: reports project files without reading their contents", async () => {
    await writeFile(join(workspace, "package.json"), JSON.stringify({scripts:{test:"node --test",lint:"eslint ."}}), "utf8");
    await writeFile(join(workspace, "AGENTS.md"), "Read me first", "utf8");
    const tool = ctx.registered.get("code_project_profile");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.ok(result.technologies.includes("node"));
    assert.deepEqual(result.scripts, ["test", "lint"]);
    assert.deepEqual(result.guidance, ["AGENTS.md"]);
    assert.equal(JSON.stringify(result).includes("node --test"), false);
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
    const host = createContext();
    host.subprocess = createGitSubprocess("## main\\0?? demo.txt\\0".replaceAll("\\0", "\0"));
    const dispose = codeWorker.apply(host, { workspaceRoot: workspace });
    const result = await host.registered.get("code_git_status").execute({}, { signal: new AbortController().signal });
    assert.equal(result.branch, "main");
    assert.deepEqual(result.untracked, ["demo.txt"]);
    assert.equal(result.clean, false);
    dispose();
  });

  it("code_git_diff: 返回 diff 字段", async () => {
    const host = createContext();
    host.subprocess = createGitSubprocess("diff --git a/a.txt b/a.txt\n");
    const dispose = codeWorker.apply(host, { workspaceRoot: workspace });
    const result = await host.registered.get("code_git_diff").execute({}, { signal: new AbortController().signal });
    assert.match(result.diff, /diff --git/);
    assert.equal(result.truncated, false);
    dispose();
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
    const registeredToolNames = [...unregisterCtx.registered.keys()];
    assert.ok(registeredToolNames.length >= 11, 'essential Code Worker tools must register');
    assert.equal(new Set(registeredToolNames).size, registeredToolNames.length);
    assert.ok(unregisterCtx.registered.has('code_delivery_gate'));
    assert.ok(unregisterCtx.registered.has('code_git_worktree'));
    assert.ok(unregisterCtx.registered.has('code_lsp_probe'));
    disposer();
    assert.equal(unregisterCtx.registered.size, 0);
  });
  it("code_lsp_probe: nonzero exit is not an available server", async () => {
    const fresh = createContext();
    const subprocess = { spawn() {
      return {
        done: Promise.resolve({ exitCode: 1 }),
        collected: {
          stdout: { readFrom: () => ({ text: "no", lossy: false }) },
          stderr: { readFrom: () => ({ text: "error", lossy: false }) },
        },
      };
    }};
    fresh.subprocess = subprocess;
    codeWorker.apply(fresh, { workspaceRoot: workspace,
      lsp: { servers: [{ language: "broken", command: "broken-language-server" }] } });
    const tool = fresh.registered.get("code_lsp_probe");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.equal(result.servers[0].available, false);
    assert.match(result.servers[0].note, /exit code 1/);
  });

});

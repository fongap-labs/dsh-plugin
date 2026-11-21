/**
 * dsh-delta-code integration and regression tests
 * \u901a\u8fc7 mock \u7684 Cordis ctx \u6355\u83b7\u63d2\u4ef6\u771f\u5b9e\u6ce8\u518c\u7684\u5de5\u5177\uff0c\u5e76\u76f4\u63a5\u6267\u884c\u5b83\u4eec\u3002
 * \u8fd0\u884c\uff1apnpm test
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
        callback({ skills: { registerProvider(factory) {
          const controller = new AbortController();
          const provider = factory({ signal: controller.signal, invalidate() {} });
          skills.set(provider.name, provider);
          return () => {
            skills.delete(provider.name);
            controller.abort(new Error("provider disposed"));
          };
        } } });
        return;
      }
      if (deps.includes("subprocess")) {
        return callback(ctx);
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

async function rejectedMultiEditResult(execution) {
  const prefix = "MultiEdit did not complete successfully; inspect per-edit outcomes before retrying: ";
  let result;
  await assert.rejects(execution, (error) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.startsWith(prefix), "Host tool must report partial or failed MultiEdit as an error");
    result = JSON.parse(error.message.slice(prefix.length));
    assert.equal(typeof result.applied, "number");
    assert.ok(Array.isArray(result.results));
    return true;
  });
  return result;
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

  it("native skills load content on demand and dispose cleanly", async () => {
    const fresh = createContext();
    const dispose = codeWorker.apply(fresh, { workspaceRoot: workspace });
    const local = fresh.registeredSkills.get("delta-code-coding");
    assert.ok(local, "native coding Skill Provider");
    const catalog = await local.list();
    const names = catalog.map(skill => skill.name);
    assert.equal(names.length, 30);
    assert.equal(new Set(names).size, names.length);
    assert.ok(catalog.every(skill => !Object.hasOwn(skill, "content")));
    for (const name of ["code-fast-change", "code-workflow", "code-brainstorming", "code-writing-plans",
      "code-executing-plans", "code-subagent-delivery", "code-test-driven-development",
      "code-parallel-work", "code-worktrees", "code-find-skills", "code-verification-gate", "code-finish-branch", "code-autonomous-loop", "code-ci-repair",
      "code-perf-issue", "code-runtime-forensics", "code-visual-parity", "code-skill-evaluation",
      "code-quality-strength", "code-diagnostic-readiness", "code-experience-review"]) {
      assert.ok(names.includes(name), name);
    }
    const feature = catalog.find(skill => skill.name === "code-feature-delivery");
    assert.ok(feature);
    const loaded = await local.get(feature);
    assert.match(loaded.content, /acceptance/);
    assert.match(loaded.content, /independent read-only diff review/);
    dispose();
    assert.equal(fresh.registeredSkills.size, 0);
  });

  it("\u63d2\u4ef6\u58f0\u660e\u5143\u4fe1\u606f\u6b63\u786e", () => {
    assert.equal(codeWorker.name, "@fongap-labs/dsh-delta-code");
    assert.deepEqual(codeWorker.inject, ["tools"]);
  });

  it("registers the expected Code Worker tools", () => {
    const names = [...ctx.registered.keys()].sort();
    assert.deepEqual(names, ["code_capabilities","code_delivery_gate","code_execution_stats","code_experience_candidate","code_git_diff","code_git_status","code_git_worktree","code_github_branch","code_github_checks","code_github_commit_file","code_github_connection","code_github_create_pr","code_github_file","code_github_job_logs","code_github_jobs","code_github_pulls","code_github_skill_auto_advance","code_github_skill_auto_stage","code_github_skill_candidates","code_github_skill_discover","code_github_skill_promote_pr","code_github_skill_propose_pr","code_github_skill_public_review","code_github_skill_review","code_host_probe","code_lsp_probe","code_multi_edit","code_project_profile","code_resume","code_task_spec","code_verify","code_verify_suite","code_workflow_route","code_workspace_map"]);
  });

  it("validates explicit coding requirements against the native user message", async () => {
    const { prepareTaskSpec, UserTaskContext } = await import("../packages/dsh-delta-code/lib/delta-code-strategy/intent-contract.js");
    const userText = "\u4fee\u590d CI \u7ea2\u53c9\uff0c\u4e0d\u8981\u7ed5\u8fc7\u95e8\u7981\uff0c\u4e5f\u4e0d\u8981\u7f16\u9020\u73af\u5883\u53d8\u91cf\u3002";
    const input = {
      goal: "\u4fee\u590d\u771f\u5b9e CI \u5931\u8d25",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["\u4e0d\u8981\u7ed5\u8fc7\u95e8\u7981", "\u4e0d\u8981\u7f16\u9020\u73af\u5883\u53d8\u91cf"],
      proposedAcceptance: ["\u5f53\u524d\u63d0\u4ea4\u6240\u9700\u68c0\u67e5\u5b9e\u9645\u901a\u8fc7"],
      unknowns: ["\u5931\u8d25 job \u539f\u59cb\u9519\u8bef"],
      firstAction: "\u68c0\u67e5\u5f53\u524d\u63d0\u4ea4\u7684\u5931\u8d25\u4f5c\u4e1a\u65e5\u5fd7",
    };
    const spec = prepareTaskSpec(input, userText);
    assert.deepEqual(spec.userQuotes, input.userQuotes);
    assert.equal(spec.sourceHistoryComplete, true);
    assert.deepEqual(spec.quoteEvidence, [
      { quote: "\u4e0d\u8981\u7ed5\u8fc7\u95e8\u7981", source: "current" },
      { quote: "\u4e0d\u8981\u7f16\u9020\u73af\u5883\u53d8\u91cf", source: "current" },
    ]);
    assert.deepEqual(spec.unknowns, input.unknowns);
    assert.equal(spec.workflow, "ci-repair");
    assert.ok(spec.verification.length > 0);
    assert.throws(() => prepareTaskSpec({
      ...input, userQuotes: ["\u4e0d\u5b58\u5728\u7684\u7528\u6237\u8981\u6c42"],
    }, userText), /verbatim/);
    assert.throws(() => prepareTaskSpec(input, ""), /source is unavailable/);
    const memory = new UserTaskContext();
    const agent = {};
    memory.capture(agent, userText, false, true);
    memory.capture(agent, "\u7ee7\u7eed", true, true);
    assert.equal(memory.read(agent), userText);
    memory.capture(agent, "\u65b0\u4efb\u52a1", false, true);
    assert.equal(memory.read(agent), "\u65b0\u4efb\u52a1");
    memory.remove(agent);
    assert.equal(memory.read(agent), undefined);
  });

  it("flags literal cross-turn constraint contradictions before planning", async () => {
    const { prepareTaskSpec, findDirectConstraintConflicts } = await import("../packages/dsh-delta-code/lib/delta-code-strategy/intent-contract.js");
    const previous = ["\u4fee\u590d CI\uff0c\u7981\u6b62\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002", "\u7ee7\u7eed\uff0c\u7981\u6b62\u4fee\u6539\u5df2\u6709\u914d\u7f6e\u3002"];
    const current = "\u7ee7\u7eed\uff0c\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002";
    assert.deepEqual(findDirectConstraintConflicts(current, previous), [
      { subject: "\u65b0\u589e\u73af\u5883\u53d8\u91cf", inherited: "\u7981\u6b62\u65b0\u589e\u73af\u5883\u53d8\u91cf", current: "\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf" },
    ]);
    const task = {
      goal: "\u4fee\u590d\u771f\u5b9e CI",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf"],
      proposedAcceptance: ["\u5f53\u524d\u63d0\u4ea4\u5fc5\u8981\u68c0\u67e5\u901a\u8fc7"],
      firstAction: "\u6838\u5bf9\u65b0\u65e7\u7ea6\u675f\u548c\u95e8\u7981\u6743\u9650",
    };
    const spec = prepareTaskSpec(task, current, previous);
    assert.equal(spec.readyForPlanning, false);
    assert.equal(spec.sourceHistoryComplete, true);
    assert.equal(spec.potentialConflicts.length, 1);
    const same = prepareTaskSpec(task, current, ["\u7ee7\u7eed\uff0c\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002"]);
    assert.equal(same.readyForPlanning, true);
    assert.deepEqual(same.potentialConflicts, []);
    const incomplete = prepareTaskSpec(task, current, [], true);
    assert.equal(incomplete.readyForPlanning, false);
    assert.deepEqual(incomplete.potentialConflicts, []);
    assert.deepEqual(findDirectConstraintConflicts(
      "\u7ee7\u7eed\uff0c\u5141\u8bb8\u4fee\u6539\u914d\u7f6e\u3002", ["\u4e0d\u5141\u8bb8\u4fee\u6539\u53e6\u4e00\u4e2a\u6a21\u5757\u3002"],
    ), [], "different targets must not be treated as direct contradictions");
    assert.deepEqual(findDirectConstraintConflicts(
      "\u7ee7\u7eed\uff0c\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002", ["\u7981\u6b62\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002", "\u5141\u8bb8\u65b0\u589e\u73af\u5883\u53d8\u91cf\u3002"],
    ), [], "the most recent inherited instruction prevails");
  });

  it("carries native user amendments with source provenance without leaking across tasks", async () => {
    const { prepareTaskSpec, UserTaskContext } = await import("../packages/dsh-delta-code/lib/delta-code-strategy/intent-contract.js");
    const memory = new UserTaskContext();
    const agent = {};
    const secondAgent = {};
    memory.capture(agent, "\u4fee\u590d CI \u7ea2\u53c9\uff0c\u4e0d\u5f97\u7ed5\u8fc7\u95e8\u7981", false, true);
    memory.capture(agent, "\u7ee7\u7eed\uff0c\u7981\u6b62\u6dfb\u52a0\u65b0\u73af\u5883\u53d8\u91cf", true, true);
    memory.capture(agent, "\u7ee7\u7eed", true, true);
    assert.equal(memory.read(agent), "\u7ee7\u7eed\uff0c\u7981\u6b62\u6dfb\u52a0\u65b0\u73af\u5883\u53d8\u91cf");
    const sources = memory.readSources(agent);
    assert.deepEqual(sources, {
      current: "\u7ee7\u7eed\uff0c\u7981\u6b62\u6dfb\u52a0\u65b0\u73af\u5883\u53d8\u91cf",
      inherited: ["\u4fee\u590d CI \u7ea2\u53c9\uff0c\u4e0d\u5f97\u7ed5\u8fc7\u95e8\u7981"],
      historyIncomplete: false,
    });
    const spec = prepareTaskSpec({
      goal: "\u4fee\u590d CI \u7ea2\u53c9",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["\u4e0d\u5f97\u7ed5\u8fc7\u95e8\u7981", "\u7981\u6b62\u6dfb\u52a0\u65b0\u73af\u5883\u53d8\u91cf"],
      proposedAcceptance: ["\u5f53\u524d\u63d0\u4ea4\u4e2d\u592e CI \u901a\u8fc7"],
      firstAction: "\u8bfb\u53d6 CI \u5931\u8d25\u65e5\u5fd7",
    }, sources.current, sources.inherited);
    assert.equal(spec.sourceHistoryComplete, true);
    assert.deepEqual(spec.quoteEvidence, [
      { quote: "\u4e0d\u5f97\u7ed5\u8fc7\u95e8\u7981", source: "inherited" },
      { quote: "\u7981\u6b62\u6dfb\u52a0\u65b0\u73af\u5883\u53d8\u91cf", source: "current" },
    ]);
    assert.throws(() => prepareTaskSpec({
      goal: "\u4fee\u590d CI \u7ea2\u53c9",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["\u67d0\u4e2a\u672a\u51fa\u73b0\u7684\u7ea6\u675f"],
      proposedAcceptance: ["\u5f53\u524d\u63d0\u4ea4\u4e2d\u592e CI \u901a\u8fc7"],
      firstAction: "\u8bfb\u53d6 CI \u5931\u8d25\u65e5\u5fd7",
    }, sources.current, sources.inherited), /verbatim/);
    assert.equal(memory.read(secondAgent), undefined);
    memory.capture(agent, "\u73b0\u5728\u6539\u4e3a\u8bc4\u4f30\u53e6\u4e00\u4e2a\u4ed3\u5e93", false, true);
    assert.deepEqual(memory.readSources(agent), { current: "\u73b0\u5728\u6539\u4e3a\u8bc4\u4f30\u53e6\u4e00\u4e2a\u4ed3\u5e93", inherited: [], historyIncomplete: false });
    memory.capture(agent, "\u666e\u901a\u804a\u5929", false, false);
    assert.equal(memory.readSources(agent), undefined);
    memory.capture(agent, "\u65b0\u7684\u4efb\u52a1", false, true);
    memory.clear();
    assert.equal(memory.readSources(agent), undefined);
  });

  it("bounds inherited intent amendments to four user turns", async () => {
    const { UserTaskContext, prepareTaskSpec } = await import("../packages/dsh-delta-code/lib/delta-code-strategy/intent-contract.js");
    const memory = new UserTaskContext();
    const agent = {};
    memory.capture(agent, "\u539f\u59cb\u76ee\u6807", false, true);
    for (let n = 1; n <= 6; n++) {
      memory.capture(agent, "\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c42" + n, true, true);
    }
    assert.deepEqual(memory.readSources(agent), {
      current: "\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c426",
      inherited: ["\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c422", "\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c423", "\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c424", "\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c425"],
      historyIncomplete: true,
    });
    const evidence = memory.readSources(agent);
    const spec = prepareTaskSpec({
      goal: "\u6301\u7eed\u4fee\u6539",
      taskKind: "feature", scope: "medium", risk: "medium",
      userQuotes: ["\u7ee7\u7eed\uff0c\u8ffd\u52a0\u8981\u6c426"],
      proposedAcceptance: ["\u9a8c\u8bc1\u5b8c\u6210"],
      firstAction: "\u5ba1\u67e5\u5386\u53f2",
    }, evidence.current, evidence.inherited, evidence.historyIncomplete);
    assert.equal(spec.sourceHistoryComplete, false);
    memory.remove(agent);
    assert.equal(memory.readSources(agent), undefined);
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
      const result = await rejectedMultiEditResult(tool.execute({ preflight: false, edits: [
        { path: "external-file.txt", content: "outside-overwrite" },
        { path: "external-file.txt", find: "must-not-change", replace: "outside-replace" },
        { path: "external-dir/created.txt", content: "outside-created" },
      ] }, { signal: new AbortController().signal }));
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

  it("code_multi_edit: dryRun \u4e0d\u5199\u76d8", async () => {
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
    const result = await rejectedMultiEditResult(tool.execute({ edits: [{ path: "empty-find.txt", find: "", replace: "x" }] }, { signal: new AbortController().signal }));
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

  it("code_multi_edit: \u5b9e\u9645\u5199\u5165\u6587\u4ef6\u5185\u5bb9", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await tool.execute(
      { edits: [{ path: "nested/b.txt", content: "world" }] },
      { signal: new AbortController().signal },
    );
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].ok, true);
    assert.equal(await readFile(join(workspace, "nested/b.txt"), "utf8"), "world");
  });

  it("code_multi_edit: find/replace \u66ff\u6362\u9996\u4e2a\u5339\u914d", async () => {
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

  it("code_multi_edit: \u8d8a\u754c\u8def\u5f84\u88ab\u6c99\u7bb1\u62d2\u7edd\u4e14\u4e0d\u5f71\u54cd\u5176\u5b83\u7f16\u8f91", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await rejectedMultiEditResult(tool.execute(
      {
        preflight: false,
        edits: [
          { path: "../../../../escape.txt", content: "nope" },
          { path: "safe.txt", content: "yes" },
        ],
      },
      { signal: new AbortController().signal },
    ));
    assert.equal(result.applied, 1);
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].note, /sandbox/i);
    assert.equal(result.results[1].ok, true);
    assert.equal(await readFile(join(workspace, "safe.txt"), "utf8"), "yes");
  });

  it("code_multi_edit: find \u672a\u547d\u4e2d\u65f6\u8df3\u8fc7\u8be5\u7f16\u8f91", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await rejectedMultiEditResult(tool.execute(
      { edits: [{ path: "c.txt", find: "not-present", replace: "x" }] },
      { signal: new AbortController().signal },
    ));
    assert.equal(result.applied, 0);
    assert.equal(result.results[0].ok, false);
    assert.match(result.results[0].note, /not present/i);
  });

  it("code_git_status: \u8fd4\u56de\u7ed3\u6784\u5316\u7ed3\u679c", async () => {
    const host = createContext();
    host.subprocess = createGitSubprocess("## main\\0?? demo.txt\\0".replaceAll("\\0", "\0"));
    const dispose = codeWorker.apply(host, { workspaceRoot: workspace });
    const result = await host.registered.get("code_git_status").execute({}, { signal: new AbortController().signal });
    assert.equal(result.branch, "main");
    assert.deepEqual(result.untracked, ["demo.txt"]);
    assert.equal(result.clean, false);
    dispose();
  });

  it("code_git_diff: \u8fd4\u56de diff \u5b57\u6bb5", async () => {
    const host = createContext();
    host.subprocess = createGitSubprocess("diff --git a/a.txt b/a.txt\n");
    const dispose = codeWorker.apply(host, { workspaceRoot: workspace });
    const result = await host.registered.get("code_git_diff").execute({}, { signal: new AbortController().signal });
    assert.match(result.diff, /diff --git/);
    assert.equal(result.truncated, false);
    dispose();
  });

  it("code_lsp_probe: \u8fd4\u56de\u9010\u670d\u52a1\u63a2\u6d4b\u7ed3\u8bba", async () => {
    const tool = ctx.registered.get("code_lsp_probe");
    const result = await tool.execute({}, { signal: new AbortController().signal });
    assert.ok(Array.isArray(result.servers));
    assert.equal(result.servers.length, 1);
    assert.equal(result.servers[0].language, "typescript");
    assert.equal(typeof result.servers[0].available, "boolean");
  });

  it("code_lsp_probe: \u53ef\u6ce8\u5165\u63a2\u6d4b\u6210\u529f\u7684\u865a\u6784\u547d\u4ee4", async () => {
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

  it("disposer \u53ef\u5378\u8f7d\u6240\u6709\u5df2\u6ce8\u518c\u5de5\u5177", () => {
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

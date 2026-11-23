/**
 * delta-code integration and regression tests
 * 通过 mock 的 Cordis ctx 捕获插件真实注册的工具，并直接执行它们。
 * 运行：pnpm test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const codeWorker = await import("../packages/delta-code/lib/index.js");
const shared = await import("../packages/shared/lib/index.js");

const NODE_PRINT = [resolve(process.execPath), "-e", "process.stdout.write('hello')"];

function createContext() {
  const registered = new Map();
  const warnings = [];
  const skills = new Map();
  const registeredCommands = new Map();
  const ctx = {
    registeredCommands,
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
        const release = callback(ctx);
        if (deps.includes("commands")) return { dispose: async () => { if (typeof release === "function") release(); } };
        return release;
      }
      callback({
        systemPrompt: {
          getSectionOrder: () => 1300,
          section: () => () => {},
        },
      });
    },
    get: () => undefined,
    commands: {
      register(definition) {
        registeredCommands.set(definition.name, definition);
        return () => registeredCommands.delete(definition.name);
      },
    },
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

describe("delta-code", () => {
  let workspace;
  let ctx;

  before(async () => {
    workspace = await mkdtemp(join(tmpdir(), "delta-code-"));
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

  it("插件声明元信息正确", () => {
    assert.equal(codeWorker.name, "@fongap-labs/delta-code");
    assert.deepEqual(codeWorker.inject, ["tools"]);
  });

  it("registers the expected Code Worker tools", () => {
    const names = [...ctx.registered.keys()].sort();
    assert.deepEqual(names, ["code_capabilities","code_delivery_gate","code_execution_next","code_execution_stats","code_experience_candidate","code_git_diff","code_git_status","code_git_sync","code_git_worktree","code_github_branch","code_github_checks","code_github_commit_file","code_github_connection","code_github_create_pr","code_github_file","code_github_job_logs","code_github_jobs","code_github_pulls","code_github_skill_auto_advance","code_github_skill_auto_stage","code_github_skill_candidates","code_github_skill_discover","code_github_skill_promote_pr","code_github_skill_propose_pr","code_github_skill_public_review","code_github_skill_review","code_github_skill_temporary_use","code_host_probe","code_lsp_probe","code_modern_web_guidance","code_multi_edit","code_project_profile","code_resume","code_session_repositories","code_task_spec","code_verify","code_verify_suite","code_workflow_route","code_workspace_map"]);
  });

  it("keeps registered tools stable on unrelated Host volatile updates", () => {
    const fresh = createContext();
    let update;
    fresh.on = (event, callback) => {
      if (event === "loader/volatile-update") update = callback;
      return () => {};
    };
    const config = { git: { enabled: true } };
    const dispose = codeWorker.apply(fresh, config);
    try {
      assert.equal(typeof update, "function");
      const before = new Map(fresh.registered);
      assert.ok(before.has("code_project_profile"));
      assert.ok(before.has("code_git_status"));
      update(); // The Loader signalled, but Delta Code config is unchanged.
      assert.equal(fresh.registered.get("code_project_profile"), before.get("code_project_profile"));
      assert.equal(fresh.registered.get("code_git_status"), before.get("code_git_status"));
      config.git.enabled = false;
      update(); // An actual Delta Code setting change still reconfigures tools.
      assert.equal(fresh.registered.has("code_git_status"), false);
      assert.ok(fresh.registered.has("code_project_profile"));
    } finally {
      dispose();
      assert.equal(fresh.registered.size, 0);
    }
  });

  it("validates explicit coding requirements against the native user message", async () => {
    const { prepareTaskSpec, UserTaskContext } = await import("../packages/delta-code/lib/delta-code-strategy/intent-contract.js");
    const userText = "修复 CI 红叉，不要绕过门禁，也不要编造环境变量。";
    const input = {
      goal: "修复真实 CI 失败",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["不要绕过门禁", "不要编造环境变量"],
      proposedAcceptance: ["当前提交所需检查实际通过"],
      unknowns: ["失败 job 原始错误"],
      firstAction: "检查当前提交的失败作业日志",
    };
    const spec = prepareTaskSpec(input, userText);
    assert.deepEqual(spec.userQuotes, input.userQuotes);
    assert.equal(spec.sourceHistoryComplete, true);
    assert.deepEqual(spec.quoteEvidence, [
      { quote: "不要绕过门禁", source: "current" },
      { quote: "不要编造环境变量", source: "current" },
    ]);
    assert.deepEqual(spec.unknowns, input.unknowns);
    assert.equal(spec.workflow, "ci-repair");
    assert.ok(spec.verification.length > 0);
    assert.throws(() => prepareTaskSpec({
      ...input, userQuotes: ["不存在的用户要求"],
    }, userText), /verbatim/);
    assert.throws(() => prepareTaskSpec(input, ""), /source is unavailable/);
    const memory = new UserTaskContext();
    const agent = {};
    memory.capture(agent, userText, false, true);
    memory.capture(agent, "继续", true, true);
    assert.equal(memory.read(agent), userText);
    memory.capture(agent, "新任务", false, true);
    assert.equal(memory.read(agent), "新任务");
    memory.remove(agent);
    assert.equal(memory.read(agent), undefined);
  });

  it("flags literal cross-turn constraint contradictions before planning", async () => {
    const { prepareTaskSpec, findDirectConstraintConflicts } = await import("../packages/delta-code/lib/delta-code-strategy/intent-contract.js");
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
    const { prepareTaskSpec, UserTaskContext } = await import("../packages/delta-code/lib/delta-code-strategy/intent-contract.js");
    const memory = new UserTaskContext();
    const agent = {};
    const secondAgent = {};
    memory.capture(agent, "修复 CI 红叉，不得绕过门禁", false, true);
    memory.capture(agent, "继续，禁止添加新环境变量", true, true);
    memory.capture(agent, "继续", true, true);
    assert.equal(memory.read(agent), "继续，禁止添加新环境变量");
    const sources = memory.readSources(agent);
    assert.deepEqual(sources, {
      current: "继续，禁止添加新环境变量",
      inherited: ["修复 CI 红叉，不得绕过门禁"],
      historyIncomplete: false,
    });
    const spec = prepareTaskSpec({
      goal: "修复 CI 红叉",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["不得绕过门禁", "禁止添加新环境变量"],
      proposedAcceptance: ["当前提交中央 CI 通过"],
      firstAction: "读取 CI 失败日志",
    }, sources.current, sources.inherited);
    assert.equal(spec.sourceHistoryComplete, true);
    assert.deepEqual(spec.quoteEvidence, [
      { quote: "不得绕过门禁", source: "inherited" },
      { quote: "禁止添加新环境变量", source: "current" },
    ]);
    assert.throws(() => prepareTaskSpec({
      goal: "修复 CI 红叉",
      taskKind: "ci", scope: "medium", risk: "medium",
      userQuotes: ["某个未出现的约束"],
      proposedAcceptance: ["当前提交中央 CI 通过"],
      firstAction: "读取 CI 失败日志",
    }, sources.current, sources.inherited), /verbatim/);
    assert.equal(memory.read(secondAgent), undefined);
    memory.capture(agent, "现在改为评估另一个仓库", false, true);
    assert.deepEqual(memory.readSources(agent), { current: "现在改为评估另一个仓库", inherited: [], historyIncomplete: false });
    memory.capture(agent, "普通聊天", false, false);
    assert.equal(memory.readSources(agent), undefined);
    memory.capture(agent, "新的任务", false, true);
    memory.clear();
    assert.equal(memory.readSources(agent), undefined);
  });

  it("bounds inherited intent amendments to four user turns", async () => {
    const { UserTaskContext, prepareTaskSpec } = await import("../packages/delta-code/lib/delta-code-strategy/intent-contract.js");
    const memory = new UserTaskContext();
    const agent = {};
    memory.capture(agent, "原始目标", false, true);
    for (let n = 1; n <= 6; n++) {
      memory.capture(agent, "继续，追加要求" + n, true, true);
    }
    assert.deepEqual(memory.readSources(agent), {
      current: "继续，追加要求6",
      inherited: ["继续，追加要求2", "继续，追加要求3", "继续，追加要求4", "继续，追加要求5"],
      historyIncomplete: true,
    });
    const evidence = memory.readSources(agent);
    const spec = prepareTaskSpec({
      goal: "持续修改",
      taskKind: "feature", scope: "medium", risk: "medium",
      userQuotes: ["继续，追加要求6"],
      proposedAcceptance: ["验证完成"],
      firstAction: "审查历史",
    }, evidence.current, evidence.inherited, evidence.historyIncomplete);
    assert.equal(spec.sourceHistoryComplete, false);
    memory.remove(agent);
    assert.equal(memory.readSources(agent), undefined);
  });

  it("marks clipped user constraints and orphan continuations incomplete", async () => {
    const { UserTaskContext, prepareTaskSpec } = await import(
      "../packages/delta-code/lib/delta-code-strategy/intent-contract.js");
    const task = {
      goal: "Fix one function", taskKind: "bugfix", scope: "small", risk: "low",
      userQuotes: ["RETAIN-THIS-RESTRICTION"],
      proposedAcceptance: ["Verify the actual behavior"],
      firstAction: "Restore full user instructions",
    };
    const memory = new UserTaskContext();
    const agent = {};
    const original = "DO-NOT-PUBLISH " + "x".repeat(16_400) + " RETAIN-THIS-RESTRICTION";
    memory.capture(agent, original, false, true);
    let source = memory.readSources(agent);
    assert.equal(source.historyIncomplete, true, "the missing prefix may contain prohibitions");
    let spec = prepareTaskSpec(task, source.current, source.inherited, source.historyIncomplete);
    assert.equal(spec.sourceHistoryComplete, false);
    assert.equal(spec.readyForPlanning, false);
    memory.capture(agent, "continue", true, true);
    source = memory.readSources(agent);
    assert.equal(source.historyIncomplete, true, "continuation cannot erase truncated history");

    const isolated = {};
    memory.capture(isolated, "continue", true, true);
    assert.equal(memory.readSources(isolated).historyIncomplete, true,
      "orphan continuation cannot imply a complete user task");
    memory.capture(isolated, "Fix a simple function", false, true);
    assert.equal(memory.readSources(isolated).historyIncomplete, false,
      "a new complete task can replace missing historical evidence");
  });

  it("code_multi_edit: local fallback rejects symlink escapes on reads and writes", { skip: process.platform === "win32" }, async () => {
    const outside = await mkdtemp(join(tmpdir(), "delta-code-outside-"));
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

  it("code_multi_edit: find 未命中时跳过该编辑", async () => {
    const tool = ctx.registered.get("code_multi_edit");
    const result = await rejectedMultiEditResult(tool.execute(
      { edits: [{ path: "c.txt", find: "not-present", replace: "x" }] },
      { signal: new AbortController().signal },
    ));
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

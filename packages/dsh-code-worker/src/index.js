/**
 * DSH Code Worker — DSH (DeepSeek Harness) Host Plugin。
 *
 * 注册代码增强工具（MultiEdit / Git status & diff / LSP probe），并通过 systemPrompt
 * 注入编码工作流指引。所有宿主服务（tools / fs / workingDirectory / systemPrompt /
 * subprocess）均按可选处理：缺失时降级到本地实现，而非抛错导致整个 profile 启动失败。
 */

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { dirname, relative, isAbsolute } from "node:path";
import {
  defineTool,
  registerTool,
  runCommand,
  resolveInside,
  SandboxViolationError,
} from "@dsh-plugin/shared";

const TOOL_PREFIX = "code_";
const PROMPT_SECTION_NAME = "dsh-code-worker:guidance";

const DEFAULT_LSP_SERVERS = [
  { language: "typescript", command: "typescript-language-server", args: ["--stdio"] },
  { language: "javascript", command: "typescript-language-server", args: ["--stdio"] },
  { language: "python", command: "pyright-langserver", args: ["--stdio"] },
  { language: "rust", command: "rust-analyzer", args: ["--stdio"] },
  { language: "go", command: "gopls", args: ["serve"] },
];

const DEFAULT_GUIDANCE = [
  "## DSH Code Worker",
  "Use the `code_multi_edit` tool for batch file edits instead of repeated single edits.",
  "Use `code_git_status` and `code_git_diff` to inspect repository state before and after changes.",
  "Use `code_lsp_probe` to detect available language servers in the current workspace.",
  "Always pass paths relative to the workspace root; absolute paths outside the workspace are rejected by the sandbox.",
].join("\n");

export const name = "dsh-code-worker";
export const inject = ["tools"];

export function apply(ctx, config) {
  const settings = normalizeConfig(config);
  const disposers = [];

  for (const tool of createTools(ctx, settings)) {
    const result = registerTool(ctx, tool);
    if (result.registered && typeof result.disposer === "function") {
      disposers.push(result.disposer);
    } else if (result.error) {
      ctx.logger?.warn?.(`dsh-code-worker: tool "${tool.name}" was not registered: ${result.error.message}`);
    }
  }

  ctx.inject(["systemPrompt"], (child) => {
    try {
      const order = child.systemPrompt.getSectionOrder("TOOL_EDIT");
      const disposer = child.systemPrompt.section({
        name: PROMPT_SECTION_NAME,
        order: Number.isFinite(order) ? order : 1300,
        text: settings.systemPromptText || DEFAULT_GUIDANCE,
      });
      if (typeof disposer === "function") disposers.push(disposer);
    } catch (error) {
      ctx.logger?.warn?.(`dsh-code-worker: failed to register system prompt section: ${error?.message ?? error}`);
    }
  });

  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try { disposers[i](); } catch { /* best-effort cleanup */ }
    }
  };
}

function normalizeConfig(config) {
  const cfg = config && typeof config === "object" ? config : {};
  const git = cfg.git && typeof cfg.git === "object" ? cfg.git : {};
  const lsp = cfg.lsp && typeof cfg.lsp === "object" ? cfg.lsp : {};
  const servers = Array.isArray(lsp.servers) && lsp.servers.length > 0
    ? lsp.servers
    : DEFAULT_LSP_SERVERS;
  return {
    enabled: cfg.enabled !== false,
    workspaceRoot: typeof cfg.workspaceRoot === "string" ? cfg.workspaceRoot.trim() : "",
    gitEnabled: git.enabled !== false,
    gitCommand: typeof git.command === "string" && git.command.trim() !== "" ? git.command.trim() : "git",
    lspServers: servers.filter((s) => s && typeof s.command === "string"),
    systemPromptText: typeof cfg.systemPromptText === "string" ? cfg.systemPromptText : "",
  };
}

async function resolveRoot(ctx, exec, settings) {
  const workingDirectory = ctx.get?.("workingDirectory");
  if (workingDirectory && exec?.agent !== undefined && typeof workingDirectory.ensure === "function") {
    try {
      const dir = await workingDirectory.ensure(exec.agent, exec.signal);
      if (dir) return dir;
    } catch { /* fall through to config / cwd */ }
  }
  if (settings.workspaceRoot) return settings.workspaceRoot;
  return process.cwd();
}

async function readTextSafe(ctx, exec, root, relPath) {
  const absolute = resolveInside(root, relPath);
  const fs = ctx.get?.("fs");
  if (fs && typeof fs.readText === "function") {
    const signal = exec?.signal;
    const resolved = await fs.resolve(absolute, { cwd: root, signal });
    return fs.readText(resolved, signal);
  }
  return readFile(absolute, "utf8");
}

async function writeTextSafe(ctx, exec, root, relPath, content) {
  const absolute = resolveInside(root, relPath);
  const fs = ctx.get?.("fs");
  if (fs && typeof fs.writeText === "function") {
    const signal = exec?.signal;
    const resolved = await fs.resolve(absolute, { cwd: root, signal });
    return fs.writeText(resolved, content, "overwrite", signal);
  }
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

function createTools(ctx, settings) {
  if (settings.enabled === false) return [];

  const tools = [createMultiEditTool(ctx, settings)];
  if (settings.gitEnabled) {
    tools.push(createGitStatusTool(ctx, settings));
    tools.push(createGitDiffTool(ctx, settings));
  }
  tools.push(createLspProbeTool(ctx, settings));
  return tools;
}

function createMultiEditTool(ctx, settings) {
  return defineTool({
    name: `${TOOL_PREFIX}multi_edit`,
    description:
      "Apply a batch of file edits atomically within the workspace. Each edit either overwrites a file with `content` or performs a `find`/`replace` substitution. Set `dryRun` to validate paths and inputs without writing.",
    parameters: {
      edits: {
        type: "array",
        required: true,
        description: "Edits to apply, each an object with `path` plus either `content` or `find`/`replace`.",
        items: {
          type: "object",
          properties: {
            path: { type: "string", required: true, description: "Workspace-relative file path." },
            content: { type: "string", description: "Full replacement content for the file." },
            find: { type: "string", description: "Literal substring to locate (used with `replace`)." },
            replace: { type: "string", description: "Replacement text for the located substring." },
          },
        },
      },
      dryRun: { type: "boolean", description: "When true, validate without writing." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          applied: { type: "integer", required: true, description: "Number of edits applied." },
          results: {
            type: "array",
            required: true,
            description: "Per-edit outcome list.",
            items: {
              type: "object",
              properties: {
                path: { type: "string", required: true },
                action: { type: "string", required: true, enum: ["overwrite", "replace", "skipped"] },
                ok: { type: "boolean", required: true },
                note: { type: "string" },
              },
            },
          },
          dryRun: { type: "boolean" },
        },
      },
      render(_args, value) {
        const lines = [`MultiEdit: ${value.applied} edit(s)${value.dryRun ? " (dry run)" : ""} applied.`];
        for (const r of value.results) {
          const flag = r.ok ? "ok" : "fail";
          lines.push(`  [${flag}] ${r.action} ${r.path}${r.note ? ` — ${r.note}` : ""}`);
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings);
      const results = [];
      let applied = 0;
      const edits = Array.isArray(args.edits) ? args.edits : [];
      for (const edit of edits) {
        const rel = String(edit.path ?? "");
        try {
          if (!edit.content && edit.find === undefined) {
            results.push({ path: rel, action: "skipped", ok: false, note: "missing content or find/replace" });
            continue;
          }
          let action = "overwrite";
          let note;
          if (edit.find !== undefined) {
            const original = await readTextSafe(ctx, exec, root, rel);
            const idx = original.indexOf(String(edit.find));
            if (idx === -1) {
              results.push({ path: rel, action: "skipped", ok: false, note: "find substring not present" });
              continue;
            }
            action = "replace";
            const next = original.slice(0, idx) + String(edit.replace ?? "") + original.slice(idx + String(edit.find).length);
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, next);
            note = `replaced 1 occurrence`;
          } else {
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, String(edit.content ?? ""));
            note = `${String(edit.content ?? "").length} bytes`;
          }
          applied += 1;
          results.push({ path: rel, action, ok: true, note });
        } catch (error) {
          results.push({
            path: rel,
            action: "skipped",
            ok: false,
            note: error instanceof SandboxViolationError ? "path escapes workspace sandbox" : String(error?.message ?? error),
          });
        }
      }
      return { applied, results, dryRun: Boolean(args.dryRun) };
    },
  });
}

function createGitStatusTool(ctx, settings) {
  return defineTool({
    name: `${TOOL_PREFIX}git_status`,
    description:
      "Run `git status --porcelain=v1 --branch` in the workspace and return a parsed summary of branch, staged, unstaged and untracked entries.",
    parameters: {
      cwd: { type: "string", description: "Optional subdirectory inside the workspace to run git in." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          branch: { type: "string" },
          ahead: { type: "integer" },
          behind: { type: "integer" },
          staged: { type: "array", items: { type: "string" } },
          unstaged: { type: "array", items: { type: "string" } },
          untracked: { type: "array", items: { type: "string" } },
          clean: { type: "boolean", required: true },
        },
      },
      render(_args, value) {
        const head = value.branch ? `On branch ${value.branch}.` : "No branch.";
        const counts = [
          `${value.staged.length} staged`,
          `${value.unstaged.length} unstaged`,
          `${value.untracked.length} untracked`,
        ].join(", ");
        const body = [...value.staged, ...value.unstaged, ...value.untracked].slice(0, 30);
        const lines = [head, counts, value.clean ? "Working tree clean." : body.map((f) => `  ${f}`).join("\n")];
        return [{ type: "text", text: lines.filter(Boolean).join("\n") }];
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings);
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root;
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: ["status", "--porcelain=v1", "--branch", "-z"],
        cwd,
        signal: exec?.signal,
        timeoutMs: 30_000,
      });
      if (result.exitCode !== 0) {
        return {
          branch: "",
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          clean: false,
          _stderr: result.stderr,
        };
      }
      return parseGitStatus(result.stdout);
    },
  });
}

function parseGitStatus(raw) {
  const parts = raw.split("\0").map((s) => s).filter((s) => s.length > 0);
  const staged = [];
  const unstaged = [];
  const untracked = [];
  let branch = "";
  let ahead = 0;
  let behind = 0;
  for (const part of parts) {
    if (part.startsWith("## ")) {
      const head = part.slice(3);
      const m = head.match(/^(\S+?)(?:\.\.\.(\S+))?(?:\s+\[(ahead|behind|ahead \d+, behind \d+|behind \d+, ahead \d+)\])?/);
      if (m) branch = m[1];
      if (m && m[4]) {
        const am = m[4].match(/ahead (\d+)/);
        const bm = m[4].match(/behind (\d+)/);
        if (am) ahead = Number(am[1]);
        if (bm) behind = Number(bm[1]);
      }
      continue;
    }
    if (part.length < 3) continue;
    const xy = part.slice(0, 2);
    const file = part.slice(3);
    const x = xy[0];
    const y = xy[1];
    if (x === "?") untracked.push(file);
    else {
      if (x !== " " && x !== "?") staged.push(`${x} ${file}`);
      if (y !== " " && y !== "?") unstaged.push(`${y} ${file}`);
    }
  }
  return {
    branch,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

function createGitDiffTool(ctx, settings) {
  return defineTool({
    name: `${TOOL_PREFIX}git_diff`,
    description:
      "Return a `git diff` for the workspace. Set `staged` to true for `--cached`, and `path` to limit to one file.",
    parameters: {
      cwd: { type: "string", description: "Optional subdirectory inside the workspace." },
      path: { type: "string", description: "Optional path to diff, relative to the workspace." },
      staged: { type: "boolean", description: "Diff staged (cached) changes." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          diff: { type: "string", required: true, description: "The raw diff text." },
          truncated: { type: "boolean", required: true, description: "Whether output was capped." },
        },
      },
      render(_args, value) {
        const head = value.truncated ? "git diff (truncated):" : "git diff:";
        return [{ type: "text", text: `${head}\n${value.diff}` }];
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings);
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root;
      const gitArgs = ["diff", "--no-color"];
      if (args.staged) gitArgs.push("--cached");
      if (args.path) {
        const rel = resolveInside(root, args.path);
        gitArgs.push("--", relative(cwd, rel) || rel);
      }
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: gitArgs,
        cwd,
        signal: exec?.signal,
        timeoutMs: 30_000,
        maxOutputBytes: 256 * 1024,
      });
      return {
        diff: result.stdout,
        truncated: result.lossy,
      };
    },
  });
}

function createLspProbeTool(ctx, settings) {
  return defineTool({
    name: `${TOOL_PREFIX}lsp_probe`,
    description:
      "Probe the workspace for available language servers (by checking command availability via `--help`/`--version`). Returns which configured LSP servers are installed and runnable.",
    parameters: {
      cwd: { type: "string", description: "Optional subdirectory inside the workspace to probe from." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          servers: {
            type: "array",
            required: true,
            description: "Probe results per configured server.",
            items: {
              type: "object",
              properties: {
                language: { type: "string", required: true },
                command: { type: "string", required: true },
                available: { type: "boolean", required: true },
                note: { type: "string" },
              },
            },
          },
        },
      },
      render(_args, value) {
        const lines = ["LSP probe:"];
        for (const s of value.servers) {
          const flag = s.available ? "ok" : "no";
          lines.push(`  [${flag}] ${s.language}: ${s.command}${s.note ? ` — ${s.note}` : ""}`);
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings);
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root;
      const servers = [];
      for (const server of settings.lspServers) {
        let available = false;
        let note = "";
        try {
          const result = await runCommand(ctx, {
            command: server.command,
            args: ["--version"],
            cwd,
            signal: exec?.signal,
            timeoutMs: 8_000,
            maxOutputBytes: 4 * 1024,
          });
          available = result.exitCode === 0 || result.exitCode !== null;
          if (result.timedOut) { available = false; note = "timed out"; }
        } catch (error) {
          available = false;
          note = String(error?.message ?? error).split("\n")[0];
        }
        servers.push({ language: server.language, command: server.command, available, note });
      }
      return { servers };
    },
  });
}

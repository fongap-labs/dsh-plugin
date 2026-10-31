/**
 * DSH Code Worker — DSH (DeepSeek Harness) Host Plugin.
 *
 * Registers code-oriented tools (MultiEdit / Git status & diff / LSP probe) and
 * injects coding guidance through `systemPrompt`. Every host service (tools /
 * fs / workingDirectory / systemPrompt / subprocess) is treated as optional:
 * when it is missing the plugin degrades to a local implementation instead of
 * throwing and taking the whole profile down.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, relative } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'

import {
  defineTool,
  registerTool,
  runCommand,
  resolveInside,
  SandboxViolationError,
} from '@dsh-plugin/shared'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional host prompt service; the guidance section is skipped without it. */
    systemPrompt?: SystemPromptService
    /** Optional host workspace provider; paths fall back to config and `cwd`. */
    workingDirectory?: WorkingDirectoryService
    /** Optional host filesystem service; reads and writes fall back to `node:fs`. */
    fs?: HostFsService
  }
}

/** Prompt section registration accepted by the host `systemPrompt` service. */
interface PromptSectionSpec {
  name: string
  order: number
  text: string
}

/** The subset of the host `systemPrompt` service this plugin relies on. */
interface SystemPromptService {
  getSectionOrder(section: string): number
  section(spec: PromptSectionSpec): (() => void) | undefined
}

/** The subset of the host `workingDirectory` service this plugin relies on. */
interface WorkingDirectoryService {
  ensure(agent: unknown, signal?: AbortSignal): Promise<string | undefined | null>
}

/** The subset of the host `fs` service this plugin relies on. */
interface HostFsService {
  resolve(path: string, options: { cwd: string; signal?: AbortSignal }): Promise<string>
  readText(path: string, signal?: AbortSignal): Promise<string>
  writeText(path: string, content: string, mode: 'overwrite', signal?: AbortSignal): Promise<void>
}

/** One configured language server. `args` is accepted for config compatibility. */
export interface LspServerConfig {
  language: string
  command: string
  args?: string[]
}

/** Plugin configuration as accepted from the Cordis patch file. */
export interface CodeWorkerConfig {
  enabled?: boolean
  workspaceRoot?: string
  git?: {
    enabled?: boolean
    command?: string
  }
  lsp?: {
    servers?: LspServerConfig[]
  }
  systemPromptText?: string
}

/** Normalized settings with every default resolved. */
interface Settings {
  enabled: boolean
  workspaceRoot: string
  gitEnabled: boolean
  gitCommand: string
  lspServers: LspServerConfig[]
  systemPromptText: string
}

/** One edit applied by `code_multi_edit`. */
interface EditResult {
  path: string
  action: 'overwrite' | 'replace' | 'skipped'
  ok: boolean
  note?: string
}

/** Parsed result of `git status --porcelain=v1 --branch`. */
interface GitStatusResult {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
  clean: boolean
}

/** One language-server probe result. */
interface LspProbeResult {
  language: string
  command: string
  available: boolean
  note: string
}

const TOOL_PREFIX = 'code_'
const PROMPT_SECTION_NAME = 'dsh-code-worker:guidance'

const DEFAULT_LSP_SERVERS: LspServerConfig[] = [
  { language: 'typescript', command: 'typescript-language-server', args: ['--stdio'] },
  { language: 'javascript', command: 'typescript-language-server', args: ['--stdio'] },
  { language: 'python', command: 'pyright-langserver', args: ['--stdio'] },
  { language: 'rust', command: 'rust-analyzer', args: ['--stdio'] },
  { language: 'go', command: 'gopls', args: ['serve'] },
]

const DEFAULT_GUIDANCE = [
  '## DSH Code Worker',
  'Use the `code_multi_edit` tool for batch file edits instead of repeated single edits.',
  'Use `code_git_status` and `code_git_diff` to inspect repository state before and after changes.',
  'Use `code_lsp_probe` to detect available language servers in the current workspace.',
  'Always pass paths relative to the workspace root; absolute paths outside the workspace are rejected by the sandbox.',
].join('\n')

export const name = 'dsh-code-worker'
export const inject = ['tools']

export function apply(ctx: Context, config?: CodeWorkerConfig): () => void {
  const settings = normalizeConfig(config)
  const disposers: Array<() => void> = []

  for (const tool of createTools(ctx, settings)) {
    const result = registerTool(ctx, tool)
    if (result.registered && typeof result.disposer === 'function') {
      disposers.push(result.disposer)
    } else if (result.error) {
      ctx.logger?.warn?.(
        `dsh-code-worker: tool "${tool.name}" was not registered: ${result.error.message}`,
      )
    }
  }

  ctx.inject(['systemPrompt'], (child) => {
    try {
      const order = child.systemPrompt?.getSectionOrder('TOOL_EDIT')
      const disposer = child.systemPrompt?.section({
        name: PROMPT_SECTION_NAME,
        order: Number.isFinite(order) ? (order as number) : 1300,
        text: settings.systemPromptText || DEFAULT_GUIDANCE,
      })
      if (typeof disposer === 'function') disposers.push(disposer)
    } catch (error) {
      ctx.logger?.warn?.(
        `dsh-code-worker: failed to register system prompt section: ${errorMessage(error)}`,
      )
    }
  })

  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try {
        disposers[i]!()
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/** Render an unknown thrown value the way the JavaScript implementation did. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  return message ? String(message) : String(error)
}

function normalizeConfig(config: CodeWorkerConfig | undefined): Settings {
  const cfg: CodeWorkerConfig = config && typeof config === 'object' ? config : {}
  const git = cfg.git && typeof cfg.git === 'object' ? cfg.git : {}
  const lsp = cfg.lsp && typeof cfg.lsp === 'object' ? cfg.lsp : {}
  const servers =
    Array.isArray(lsp.servers) && lsp.servers.length > 0 ? lsp.servers : DEFAULT_LSP_SERVERS
  return {
    enabled: cfg.enabled !== false,
    workspaceRoot: typeof cfg.workspaceRoot === 'string' ? cfg.workspaceRoot.trim() : '',
    gitEnabled: git.enabled !== false,
    gitCommand:
      typeof git.command === 'string' && git.command.trim() !== '' ? git.command.trim() : 'git',
    lspServers: servers.filter(
      (server): server is LspServerConfig =>
        Boolean(server) && typeof server.command === 'string',
    ),
    systemPromptText: typeof cfg.systemPromptText === 'string' ? cfg.systemPromptText : '',
  }
}

async function resolveRoot(
  ctx: Context,
  exec: ToolRunContext,
  settings: Settings,
): Promise<string> {
  const workingDirectory = ctx.get('workingDirectory')
  if (
    workingDirectory &&
    exec.agent !== undefined &&
    typeof workingDirectory.ensure === 'function'
  ) {
    try {
      const dir = await workingDirectory.ensure(exec.agent, exec.signal)
      if (dir) return dir
    } catch {
      /* fall through to config / cwd */
    }
  }
  if (settings.workspaceRoot) return settings.workspaceRoot
  return process.cwd()
}

async function readTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
): Promise<string> {
  const absolute = resolveInside(root, relPath)
  const fs = ctx.get('fs')
  if (fs && typeof fs.readText === 'function') {
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.readText(resolved, signal)
  }
  return readFile(absolute, 'utf8')
}

async function writeTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
  content: string,
): Promise<void> {
  const absolute = resolveInside(root, relPath)
  const fs = ctx.get('fs')
  if (fs && typeof fs.writeText === 'function') {
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.writeText(resolved, content, 'overwrite', signal)
  }
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, 'utf8')
}

function createTools(ctx: Context, settings: Settings): ToolDefinition[] {
  if (settings.enabled === false) return []

  const tools: ToolDefinition[] = [createMultiEditTool(ctx, settings)]
  if (settings.gitEnabled) {
    tools.push(createGitStatusTool(ctx, settings))
    tools.push(createGitDiffTool(ctx, settings))
  }
  tools.push(createLspProbeTool(ctx, settings))
  return tools
}

function createMultiEditTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}multi_edit`,
    description:
      'Apply a batch of file edits atomically within the workspace. Each edit either overwrites a file with `content` or performs a `find`/`replace` substitution. Set `dryRun` to validate paths and inputs without writing.',
    parameters: {
      edits: {
        type: 'array',
        required: true,
        description:
          'Edits to apply, each an object with `path` plus either `content` or `find`/`replace`.',
        items: {
          type: 'object',
          // The edit objects are validated per property; unlisted keys stay ignored.
          additionalProperties: true,
          properties: {
            path: { type: 'string', required: true, description: 'Workspace-relative file path.' },
            content: { type: 'string', description: 'Full replacement content for the file.' },
            find: { type: 'string', description: 'Literal substring to locate (used with `replace`).' },
            replace: { type: 'string', description: 'Replacement text for the located substring.' },
          },
        },
      },
      dryRun: { type: 'boolean', description: 'When true, validate without writing.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          applied: { type: 'integer', required: true, description: 'Number of edits applied.' },
          results: {
            type: 'array',
            required: true,
            description: 'Per-edit outcome list.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                action: { type: 'string', required: true, enum: ['overwrite', 'replace', 'skipped'] },
                ok: { type: 'boolean', required: true },
                note: { type: 'string' },
              },
            },
          },
          dryRun: { type: 'boolean' },
        },
      },
      render(_args, value) {
        const lines = [
          `MultiEdit: ${value.applied} edit(s)${value.dryRun ? ' (dry run)' : ''} applied.`,
        ]
        for (const result of value.results) {
          const flag = result.ok ? 'ok' : 'fail'
          lines.push(
            `  [${flag}] ${result.action} ${result.path}${result.note ? ` — ${result.note}` : ''}`,
          )
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const results: EditResult[] = []
      let applied = 0
      const edits = Array.isArray(args.edits) ? args.edits : []
      for (const edit of edits) {
        const rel = String(edit.path ?? '')
        try {
          if (!edit.content && edit.find === undefined) {
            results.push({
              path: rel,
              action: 'skipped',
              ok: false,
              note: 'missing content or find/replace',
            })
            continue
          }
          let action: EditResult['action'] = 'overwrite'
          let note: string | undefined
          if (edit.find !== undefined) {
            const original = await readTextSafe(ctx, exec, root, rel)
            const index = original.indexOf(String(edit.find))
            if (index === -1) {
              results.push({
                path: rel,
                action: 'skipped',
                ok: false,
                note: 'find substring not present',
              })
              continue
            }
            action = 'replace'
            const next =
              original.slice(0, index) +
              String(edit.replace ?? '') +
              original.slice(index + String(edit.find).length)
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, next)
            note = 'replaced 1 occurrence'
          } else {
            if (!args.dryRun) await writeTextSafe(ctx, exec, root, rel, String(edit.content ?? ''))
            note = `${String(edit.content ?? '').length} bytes`
          }
          applied += 1
          results.push({ path: rel, action, ok: true, note })
        } catch (error) {
          results.push({
            path: rel,
            action: 'skipped',
            ok: false,
            note:
              error instanceof SandboxViolationError
                ? 'path escapes workspace sandbox'
                : errorMessage(error),
          })
        }
      }
      return { applied, results, dryRun: Boolean(args.dryRun) }
    },
  })
}

function createGitStatusTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}git_status`,
    description:
      'Run `git status --porcelain=v1 --branch` in the workspace and return a parsed summary of branch, staged, unstaged and untracked entries.',
    parameters: {
      cwd: { type: 'string', description: 'Optional subdirectory inside the workspace to run git in.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // Every property below is always produced by `parseGitStatus`, so the
          // declared contract marks them required instead of optional.
          branch: { type: 'string', required: true },
          ahead: { type: 'integer', required: true },
          behind: { type: 'integer', required: true },
          staged: { type: 'array', required: true, items: { type: 'string' } },
          unstaged: { type: 'array', required: true, items: { type: 'string' } },
          untracked: { type: 'array', required: true, items: { type: 'string' } },
          clean: { type: 'boolean', required: true },
        },
      },
      render(_args, value) {
        const head = value.branch ? `On branch ${value.branch}.` : 'No branch.'
        const counts = [
          `${value.staged.length} staged`,
          `${value.unstaged.length} unstaged`,
          `${value.untracked.length} untracked`,
        ].join(', ')
        const body = [...value.staged, ...value.unstaged, ...value.untracked].slice(0, 30)
        const lines = [
          head,
          counts,
          value.clean ? 'Working tree clean.' : body.map((file) => `  ${file}`).join('\n'),
        ]
        return [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: ['status', '--porcelain=v1', '--branch', '-z'],
        cwd,
        signal: exec.signal,
        timeoutMs: 30_000,
      })
      if (result.exitCode !== 0) {
        // `_stderr` is deliberately carried as a diagnostic outside the declared
        // schema; the registry never validated it and the renderer ignores it.
        const failure: GitStatusResult & { _stderr?: string } = {
          branch: '',
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          clean: false,
          _stderr: result.stderr,
        }
        return failure
      }
      return parseGitStatus(result.stdout)
    },
  })
}

function parseGitStatus(raw: string): GitStatusResult {
  const parts = raw.split('\0').filter((part) => part.length > 0)
  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []
  let branch = ''
  let ahead = 0
  let behind = 0
  for (const part of parts) {
    if (part.startsWith('## ')) {
      const head = part.slice(3)
      const match = head.match(
        /^(\S+?)(?:\.\.\.(\S+))?(?:\s+\[(ahead|behind|ahead \d+, behind \d+|behind \d+, ahead \d+)\])?/,
      )
      if (match) branch = match[1]!
      if (match && match[4]) {
        const aheadMatch = match[4].match(/ahead (\d+)/)
        const behindMatch = match[4].match(/behind (\d+)/)
        if (aheadMatch) ahead = Number(aheadMatch[1])
        if (behindMatch) behind = Number(behindMatch[1])
      }
      continue
    }
    if (part.length < 3) continue
    const xy = part.slice(0, 2)
    const file = part.slice(3)
    const x = xy[0]!
    const y = xy[1]!
    if (x === '?') {
      untracked.push(file)
    } else {
      if (x !== ' ' && x !== '?') staged.push(`${x} ${file}`)
      if (y !== ' ' && y !== '?') unstaged.push(`${y} ${file}`)
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
  }
}

function createGitDiffTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}git_diff`,
    description:
      'Return a `git diff` for the workspace. Set `staged` to true for `--cached`, and `path` to limit to one file.',
    parameters: {
      cwd: { type: 'string', description: 'Optional subdirectory inside the workspace.' },
      path: { type: 'string', description: 'Optional path to diff, relative to the workspace.' },
      staged: { type: 'boolean', description: 'Diff staged (cached) changes.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          diff: { type: 'string', required: true, description: 'The raw diff text.' },
          truncated: { type: 'boolean', required: true, description: 'Whether output was capped.' },
        },
      },
      render(_args, value) {
        const head = value.truncated ? 'git diff (truncated):' : 'git diff:'
        return [{ type: 'text', text: `${head}\n${value.diff}` }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const gitArgs = ['diff', '--no-color']
      if (args.staged) gitArgs.push('--cached')
      if (args.path) {
        const rel = resolveInside(root, args.path)
        gitArgs.push('--', relative(cwd, rel) || rel)
      }
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: gitArgs,
        cwd,
        signal: exec.signal,
        timeoutMs: 30_000,
        maxOutputBytes: 256 * 1024,
      })
      return {
        diff: result.stdout,
        truncated: result.lossy,
      }
    },
  })
}

function createLspProbeTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: `${TOOL_PREFIX}lsp_probe`,
    description:
      'Probe the workspace for available language servers (by checking command availability via `--help`/`--version`). Returns which configured LSP servers are installed and runnable.',
    parameters: {
      cwd: { type: 'string', description: 'Optional subdirectory inside the workspace to probe from.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          servers: {
            type: 'array',
            required: true,
            description: 'Probe results per configured server.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                language: { type: 'string', required: true },
                command: { type: 'string', required: true },
                available: { type: 'boolean', required: true },
                note: { type: 'string' },
              },
            },
          },
        },
      },
      render(_args, value) {
        const lines = ['LSP probe:']
        for (const server of value.servers) {
          const flag = server.available ? 'ok' : 'no'
          lines.push(
            `  [${flag}] ${server.language}: ${server.command}${server.note ? ` — ${server.note}` : ''}`,
          )
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute(args, exec) {
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = args.cwd ? resolveInside(root, args.cwd) : root
      const servers: LspProbeResult[] = []
      for (const server of settings.lspServers) {
        let isAvailable = false
        let note = ''
        try {
          const result = await runCommand(ctx, {
            command: server.command,
            args: ['--version'],
            cwd,
            signal: exec.signal,
            timeoutMs: 8_000,
            maxOutputBytes: 4 * 1024,
          })
          isAvailable = result.exitCode === 0 || result.exitCode !== null
          if (result.timedOut) {
            isAvailable = false
            note = 'timed out'
          }
        } catch (error) {
          isAvailable = false
          note = errorMessage(error).split('\n')[0]!
        }
        servers.push({
          language: server.language,
          command: server.command,
          available: isAvailable,
          note,
        })
      }
      return { servers }
    },
  })
}

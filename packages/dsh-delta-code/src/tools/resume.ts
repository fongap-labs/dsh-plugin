/**
 * Native DSH Todo recovery. This is a host-only projection of todo/write
 * events, not a competing task store or a background agent scheduler.
 * Unlike DSH's UI-facing todos projection, it survives turn/start.
 */
import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, isPathInside, resolveInside, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { remainingDeliveryTasks, type DeliveryTask } from './delivery-gate.js'
import { parseGitStatus } from './git.js'

type ResumeState = { tasks: DeliveryTask[] | null; writeSeq: number; invalid: boolean }
type SessionEvent = { type: string; seq: number; data?: unknown }
type ProjectionHandle = { stateOf(session: unknown): ResumeState; dispose(): Promise<void> }
type ProjectionRegistry = { register(definition: unknown): Promise<ProjectionHandle> }
const EMPTY: ResumeState = { tasks: null, writeSeq: -1, invalid: false }
const HEAD_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

function parseTasks(raw: unknown): DeliveryTask[] | null {
  if (!Array.isArray(raw) || raw.length > 32) return null
  if (raw.length === 0) return []
  try {
    const tasks = raw.map(value => ({
      content: (value as DeliveryTask).content,
      status: (value as DeliveryTask).status,
    }))
    remainingDeliveryTasks(tasks)
    return tasks.map(task => ({ content: task.content.trim(), status: task.status }))
  } catch { return null }
}

/** Native event fold; never clears on turn/start and never trusts malformed events. */
export function foldNativeResume(state: ResumeState, event: SessionEvent): ResumeState {
  if (event.type !== 'todo/write') return state
  const payload = event.data as { todos?: unknown } | null | undefined
  const tasks = parseTasks(payload?.todos)
  return { tasks, writeSeq: event.seq, invalid: tasks === null }
}

function parseResumeState(value: unknown): ResumeState {
  if (!value || typeof value !== 'object') throw new Error('invalid native resume projection')
  const state = value as ResumeState
  if (!Number.isSafeInteger(state.writeSeq) || state.writeSeq < -1 ||
      typeof state.invalid !== 'boolean') throw new Error('invalid native resume checkpoint')
  if (state.tasks === null) {
    if (state.writeSeq >= 0 && !state.invalid) throw new Error('missing native Todo snapshot')
  } else if (parseTasks(state.tasks) === null || state.invalid) {
    throw new Error('invalid native Todo checkpoint')
  }
  return state
}

export interface NativeResumeReader {
  read(agent: unknown): ResumeState | undefined
  dispose(): void
}

/**
 * Register a HOST-ONLY derived projection through the native DSH registry.
 * The installed Host owns replay/checkpoints; no disk, file, or alternate log
 * is read from this plugin. A missing/older Host service fails closed.
 */
export function registerNativeResume(ctx: Context): NativeResumeReader {
  let isActive = true
  let handle: ProjectionHandle | undefined
  const definition = {
    key: 'deltaCodeNativeResume',
    stateVersion: 1,
    stateSchema: { parse: parseResumeState },
    init: () => ({ ...EMPTY }),
    apply: foldNativeResume,
  }
  ctx.inject(['sessionProjections'], (child) => {
    const registry = (child as unknown as { sessionProjections?: ProjectionRegistry }).sessionProjections
    if (!isActive || typeof registry?.register !== 'function') return
    void Promise.resolve(registry.register(definition)).then(async registered => {
      if (!isActive) { await registered.dispose(); return }
      handle = registered
    }).catch(() => {
      ctx.logger?.warn?.('dsh-delta-code: native resume projection registration failed')
    })
  })
  return {
    read(agent) {
      if (!handle || !agent || typeof agent !== 'object') return undefined
      const session = (agent as { session?: unknown }).session
      if (!session) return undefined
      return parseResumeState(handle.stateOf(session))
    },
    dispose() {
      isActive = false
      const old = handle
      handle = undefined
      if (old) void old.dispose().catch(() => {
        ctx.logger?.warn?.('dsh-delta-code: native resume projection disposal failed')
      })
    },
  }
}

type ResumeStage = 'blocked' | 'empty' | 'complete' | 'reconcile' | 'resume'
interface ResumeResult {
  stage: ResumeStage
  head: string
  sourceSeq: number
  nextAction: string
  tasks: DeliveryTask[]
  remaining: string[]
  changed: string[]
  blockers: string[]
}

function result(stage: ResumeStage, nextAction: string, state?: ResumeState,
  head = '', changed: string[] = [], blockers: string[] = []): ResumeResult {
  return { stage, head, sourceSeq: state?.writeSeq ?? -1, nextAction,
    tasks: state?.tasks ?? [], remaining: state?.tasks ? remainingDeliveryTasks(state.tasks) : [],
    changed, blockers }
}

async function hostGit(ctx: Context, settings: Settings, cwd: string,
  exec: ToolRunContext, args: string[]): Promise<string> {
  const output = await runCommand(ctx, {
    command: settings.gitCommand, args, cwd, signal: exec.signal,
    timeoutMs: 30_000, maxOutputBytes: 64 * 1024, hostOnly: true,
  })
  if (output.exitCode !== 0 || output.signal || output.timedOut || output.lossy) {
    throw new Error('DSH Host Git inspection failed or returned incomplete data')
  }
  return output.stdout
}

/** Explicit, read-only resume decision. Never replays edits or trusts Todo alone. */
export function createNativeResumeTool(
  ctx: Context, settings: Settings, reader: NativeResumeReader,
): ToolDefinition {
  return defineTool({
    name: 'code_resume',
    description: 'Recover last native todo_write snapshot from DSH session history across turns, reconcile it with Host Git HEAD and status. No writes, no auto replay. Supply expectedHead if the previous checkpoint recorded one.',
    parameters: {
      expectedHead: { type: 'string', description: 'Optional checkpoint HEAD SHA; when supplied, a mismatch blocks continuation.' },
      cwd: { type: 'string', description: 'Optional workspace-relative repository/worktree path.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      stage: { type: 'string', required: true },
      head: { type: 'string', required: true },
      sourceSeq: { type: 'integer', required: true },
      nextAction: { type: 'string', required: true },
      tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        content: { type: 'string', required: true },
        status: { type: 'string', required: true },
      } } },
      remaining: { type: 'array', required: true, items: { type: 'string' } },
      changed: { type: 'array', required: true, items: { type: 'string' } },
      blockers: { type: 'array', required: true, items: { type: 'string' } },
    } }, render(_args, output) {
      return [{ type: 'text', text: [
        'Native Code Worker resume: ' + output.stage,
        'Last Todo event: ' + (output.sourceSeq >= 0 ? output.sourceSeq : '(none)'),
        'HEAD: ' + (output.head || '(not checked)'),
        'Next: ' + output.nextAction,
        ...output.remaining.slice(0, 8).map(task => 'Unfinished: ' + task),
        ...output.changed.slice(0, 8).map(file => 'Git change: ' + file),
        ...output.blockers.map(reason => 'Blocked: ' + reason),
        'Read-only evidence only. Reconcile prior completed steps before editing; no automatic replay, merge or release.',
      ].join('\n') }]
    } },
    async execute(args, exec) {
      if (!exec.agent) return result('blocked', 'Run in the owning DSH agent Session; do not use another session history.',
        undefined, '', [], ['owning agent session is absent'])
      let state: ResumeState | undefined
      try { state = reader.read(exec.agent) } catch {
        return result('blocked', 'Inspect DSH native session projection restore failure.',
          undefined, '', [], ['native Todo projection failed to load'])
      }
      if (!state) return result('blocked', 'Mount the DSH sessionProjections service; do not synthesize task history.',
        undefined, '', [], ['native Todo projection is unavailable'])
      if (state.invalid) return result('blocked', 'Inspect malformed native Todo history; do not replay stale operations.',
        undefined, '', [], ['native Todo event is malformed'])
      if (state.tasks === null || state.tasks.length === 0) {
        return result('empty', 'No current native Todo checkpoint exists; establish a new task plan.', state)
      }
      const pending = remainingDeliveryTasks(state.tasks)
      if (pending.length === 0) {
        return result('complete', 'All historical Todo items say completed. Inspect actual evidence before starting a new task.', state)
      }
      if (!settings.gitEnabled) return result('blocked', 'Enable authorized Git inspection for task reconciliation.',
        state, '', [], ['Git tool is disabled'])
      if (args.expectedHead !== undefined && (typeof args.expectedHead !== 'string' ||
          !HEAD_PATTERN.test(args.expectedHead))) {
        return result('blocked', 'Supply a valid 40/64-character previous Git HEAD or omit the baseline.',
          state, '', [], ['invalid expectedHead'])
      }
      if (exec.signal.aborted) throw new Error('native resume cancelled')
      let head = ''
      try {
        const root = await resolveRoot(ctx, exec, settings)
        const requested = args.cwd ? resolveInside(root, args.cwd) : root
        const [canonicalRoot, cwd] = await Promise.all([realpath(root), realpath(requested)])
        if (!isPathInside(canonicalRoot, cwd)) throw new Error('Git cwd escapes workspace')
        head = (await hostGit(ctx, settings, cwd, exec, ['rev-parse', '--verify', 'HEAD'])).trim()
        if (!HEAD_PATTERN.test(head)) throw new Error('Host returned invalid Git HEAD')
        if (args.expectedHead && head !== args.expectedHead) {
          return result('blocked', 'Git HEAD changed; inspect commits and refresh plan before any task operation.',
            state, head, [], ['Git HEAD differs from previous checkpoint'])
        }
        const before = await hostGit(ctx, settings, cwd, exec, ['status', '--porcelain=v1', '--branch', '-z'])
        const afterHead = (await hostGit(ctx, settings, cwd, exec, ['rev-parse', '--verify', 'HEAD'])).trim()
        if (head !== afterHead) {
          return result('blocked', 'HEAD changed during read; reconcile repository and retry.',
            state, afterHead, [], ['Git HEAD changed while inspecting'])
        }
        const current = reader.read(exec.agent)
        if (!current || current.writeSeq !== state.writeSeq) {
          return result('blocked', 'Native task history changed during inspection; reload it.',
            state, head, [], ['native Todo changed during Git inspection'])
        }
        const git = parseGitStatus(before)
        const changed = [...git.staged, ...git.unstaged, ...git.untracked]
        if (changed.length > 0) {
          return result('reconcile', 'Inspect existing staged/unstaged/untracked work before continuing: ' + pending[0],
            state, head, changed)
        }
        if (!args.expectedHead) return result('reconcile',
          'No previous Git baseline was supplied; inspect commits and validate completed Todo steps before continuing: ' + pending[0],
          state, head)
        return result('resume', 'Revalidate the first incomplete Todo step, then continue: ' + pending[0], state, head)
      } catch {
        if (exec.signal.aborted) throw new Error('native resume cancelled')
        return result('blocked', 'Inspect Host Git permissions, repository path and command output; never fall back to local Git.',
          state, head, [], ['DSH Host Git inspection was denied or incomplete'])
      }
    },
  })
}

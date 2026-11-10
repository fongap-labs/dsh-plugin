import { realpath } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, isPathInside, resolveInside, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { parseGitStatus } from './git.js'
import { prepareVerify, runPreparedVerify } from './verify.js'
import type { VerificationScript } from './verify-presets.js'

const ALLOWED_SCRIPTS = new Set(['test', 'typecheck', 'build', 'lint', 'check'])
const STATUS = new Set(['pending', 'in_progress', 'completed'])

export interface DeliveryTask {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/**
 * Pure progress assessment. The actual task list remains owned by DSH native
 * todo_write and the Host session, not by a second plugin-side task store.
 */
export function remainingDeliveryTasks(tasks: DeliveryTask[]): string[] {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 32) {
    throw new Error('delivery gate requires 1..32 tasks')
  }
  const seen = new Set<string>()
  return tasks.map(task => {
    if (!task || typeof task.content !== 'string' || task.content.trim().length === 0 ||
        task.content.length > 200 || !STATUS.has(task.status)) {
      throw new Error('delivery task content/status is invalid')
    }
    const content = task.content.trim()
    if (seen.has(content)) throw new Error('duplicate delivery task')
    seen.add(content)
    return task.status === 'completed' ? undefined : content
  }).filter((task): task is string => task !== undefined)
}

interface GateCheck {
  script: string
  exitCode: number
  passed: boolean
}

interface GateResult {
  stage: 'continue' | 'blocked' | 'verified'
  ready: boolean
  head: string
  nextAction: string
  remaining: string[]
  blockers: string[]
  changes: string[]
  checks: GateCheck[]
  evidence: string[]
}

function gate(
  stage: GateResult['stage'], nextAction: string, remaining: string[] = [],
  head = '', blockers: string[] = [], changes: string[] = [],
  checks: GateCheck[] = [], evidence: string[] = [],
): GateResult {
  return { stage, ready: stage === 'verified', head, nextAction, remaining, blockers, changes, checks, evidence }
}

/** A Host-only Git read. Never fall back to Node after an absent/denying Host subprocess. */
async function hostGit(
  ctx: Context, settings: Settings, cwd: string, exec: ToolRunContext, args: string[],
  maxOutputBytes = 64 * 1024,
): Promise<string> {
  const result = await runCommand(ctx, {
    command: settings.gitCommand, args, cwd, signal: exec.signal, hostOnly: true,
    timeoutMs: 30_000, maxOutputBytes,
  })
  if (result.exitCode !== 0 || result.signal || result.timedOut || result.lossy) {
    throw new Error('Git result incomplete, denied, truncated or failed')
  }
  return result.stdout
}

/**
 * Final delivery is checked against the current Host Git state and newly run
 * allowlisted verification scripts. This does not authorize a merge, replace
 * an independent review, or claim that self-reported task statuses are proven.
 */
export function createDeliveryGateTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_delivery_gate',
    description: 'Check native Todo progress, current Git HEAD/diff hygiene and freshly run allowlisted tests before claiming verified completion. Read-only Git; tests require execution.allowCommands and DSH Host subprocess. Not a merge approval or persistent task store.',
    parameters: {
      tasks: {
        type: 'array', required: true,
        description: 'Copy the full latest native todo_write list (1..32), preserving pending/in_progress/completed statuses.',
        items: { type: 'object', additionalProperties: false, properties: {
          content: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['pending', 'in_progress', 'completed'] },
        } },
      },
      expectedHead: { type: 'string', description: 'Current baseline Git HEAD SHA captured before final verification. Required to verify completion.' },
      scripts: {
        type: 'array',
        description: 'Final checks to execute fresh, e.g. test and typecheck (1..5). Required to verify completion.',
        items: { type: 'string', enum: ['test', 'typecheck', 'build', 'lint', 'check'] },
      },
      cwd: { type: 'string', description: 'Optional workspace-relative Git repository / worktree.' },
      project: { type: 'string', enum: ['auto', 'node', 'rust', 'python', 'go'] },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      stage: { type: 'string', required: true },
      ready: { type: 'boolean', required: true },
      head: { type: 'string', required: true },
      nextAction: { type: 'string', required: true },
      remaining: { type: 'array', required: true, items: { type: 'string' } },
      blockers: { type: 'array', required: true, items: { type: 'string' } },
      changes: { type: 'array', required: true, items: { type: 'string' } },
      checks: { type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          script: { type: 'string', required: true },
          exitCode: { type: 'integer', required: true },
          passed: { type: 'boolean', required: true },
        },
      } },
      evidence: { type: 'array', required: true, items: { type: 'string' } },
    } }, render(_args, result) {
      return [{ type: 'text', text: [
        'Code delivery gate: ' + result.stage,
        'Current HEAD: ' + (result.head || '(not checked)'),
        'Next: ' + result.nextAction,
        ...result.remaining.slice(0, 8).map(task => 'Remaining: ' + task),
        ...result.blockers.map(blocker => 'Blocked: ' + blocker),
        ...result.checks.map(check => check.script + ': ' + (check.passed ? 'PASS' : 'FAIL') +
          ' (exit ' + check.exitCode + ')'),
        ...result.evidence,
        'This gate does not replace independent review, Host approval or release governance.',
      ].join('\n') }]
    } },
    async execute(args, exec) {
      const remaining = remainingDeliveryTasks(args.tasks as DeliveryTask[])
      if (remaining.length > 0) {
        return gate('continue', 'Resume the first pending or in-progress native Todo item and verify it before marking complete: ' + remaining[0], remaining)
      }

      const scripts = args.scripts as VerificationScript[] | undefined
      if (!Array.isArray(scripts) || scripts.length < 1 || scripts.length > 5 ||
          new Set(scripts).size !== scripts.length || scripts.some(script => !ALLOWED_SCRIPTS.has(script))) {
        return gate('blocked', 'Declare 1..5 distinct allowlisted final verification scripts.',
          [], '', ['fresh final verification scripts are missing or invalid'])
      }
      if (typeof args.expectedHead !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(args.expectedHead)) {
        return gate('blocked', 'Read the current Git HEAD through the authorized Host and retry with expectedHead.',
          [], '', ['Git baseline is missing or invalid'])
      }
      if (!settings.allowCommands) {
        return gate('blocked', 'Request Host permission to enable execution.allowCommands; do not bypass the Host.',
          [], '', ['script execution is disabled'])
      }
      if (exec.signal.aborted) throw new Error('delivery verification cancelled')

      // Prevalidate every planned script before starting even a Git subprocess.
      const prepared = []
      try {
        for (const script of scripts) {
          prepared.push(await prepareVerify(ctx, settings, exec, {
            script, cwd: args.cwd, project: args.project,
          }))
        }
      } catch {
        if (exec.signal.aborted) throw new Error('delivery verification cancelled')
        return gate('blocked', 'Inspect verification configuration, Host permissions and declared project scripts.',
          [], '', ['final verification preflight rejected'])
      }

      let head = ''
      let changes: string[] = []
      const blockers: string[] = []
      const evidence: string[] = []
      const checks: GateCheck[] = []
      try {
        const root = await resolveRoot(ctx, exec, settings)
        const requested = args.cwd ? resolveInside(root, args.cwd) : root
        const [canonicalRoot, cwd] = await Promise.all([realpath(root), realpath(requested)])
        if (!isPathInside(canonicalRoot, cwd)) {
          throw new Error('Git cwd escapes workspace')
        }
        head = (await hostGit(ctx, settings, cwd, exec, ['rev-parse', '--verify', 'HEAD'])).trim()
        if (head !== args.expectedHead) {
          return gate('blocked', 'Reconcile the changed repository HEAD, refresh the plan, then verify again.',
            [], head, ['Git HEAD differs from expected baseline'])
        }
        const before = await hostGit(ctx, settings, cwd, exec, ['status', '--porcelain=v1', '--branch', '-z'])
        const status = parseGitStatus(before)
        changes = [...status.staged, ...status.unstaged, ...status.untracked]
        if (status.untracked.length > 0) {
          blockers.push('untracked files are not covered by git diff --check; review and stage or remove them')
        }
        await hostGit(ctx, settings, cwd, exec, ['diff', '--check'])
        await hostGit(ctx, settings, cwd, exec, ['diff', '--cached', '--check'])
        // Git porcelain status records file names/status, not their contents.
        // Fingerprint BOTH tracked diff streams before/after running tests,
        // so edits to already-dirty files cannot silently pass the gate.
        const beforePatches = [
          await hostGit(ctx, settings, cwd, exec, ['diff', '--no-ext-diff', '--binary'], 1024 * 1024),
          await hostGit(ctx, settings, cwd, exec, ['diff', '--cached', '--no-ext-diff', '--binary'], 1024 * 1024),
        ]
        evidence.push('Git HEAD, tracked diff content and staged/unstaged diff hygiene checked through DSH Host')
        // Execute in order, stop on the first failed check and never turn a
        // Host denial into a local Node retry.
        for (const step of prepared) {
          if (exec.signal.aborted) throw new Error('delivery verification cancelled')
          const result = await runPreparedVerify(ctx, settings, exec, step)
          checks.push({ script: result.script, exitCode: result.exitCode, passed: result.passed })
          if (!result.passed) {
            blockers.push('verification failed: ' + result.script)
            break
          }
        }
        // Recheck after commands, since tests/builds can modify the tree.
        if (checks.length === prepared.length && checks.every(check => check.passed)) {
          const finalHead = (await hostGit(ctx, settings, cwd, exec, ['rev-parse', '--verify', 'HEAD'])).trim()
          const after = await hostGit(ctx, settings, cwd, exec, ['status', '--porcelain=v1', '--branch', '-z'])
          const afterPatches = [
            await hostGit(ctx, settings, cwd, exec, ['diff', '--no-ext-diff', '--binary'], 1024 * 1024),
            await hostGit(ctx, settings, cwd, exec, ['diff', '--cached', '--no-ext-diff', '--binary'], 1024 * 1024),
          ]
          if (finalHead !== head || after !== before || afterPatches.some((patch, i) => patch !== beforePatches[i])) {
            blockers.push('repository changed during verification; inspect and rerun')
          }
        }
        if (blockers.length > 0) {
          return gate('blocked', 'Resolve blockers, update the native Todo if needed, then rerun checks.',
            [], head, blockers, changes, checks, evidence)
        }
        return gate('verified', 'Review the actual diff and obtain independent approval before merge or release.',
          [], head, [], changes, checks, evidence)
      } catch {
        if (exec.signal.aborted) throw new Error('delivery verification cancelled')
        return gate('blocked', 'Inspect the failing Host operation or Git diff; do not retry using unapproved local subprocess.',
          [], head, ['Host Git or verification operation denied, failed or returned incomplete evidence'],
          changes, checks, evidence)
      }
    },
  })
}

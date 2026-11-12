import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { resolveAuthorizedGitCwd } from './host-git-cwd.js'
import { parseGitStatus } from './git.js'
import { identifyAddedFiles, checkLanguageConventions, describeLanguageViolations } from '../consistency.js'
import { prepareVerify, runPreparedVerify } from './verify.js'
import { isAllowedVerificationScript, type VerificationScript } from './verify-presets.js'
import type { NativeResumeReader } from './resume.js'
import { classifyFailure, classifyVerificationEvidence, verificationNextAction, type FailureKind } from './failure-policy.js'

const STATUS = new Set(['pending', 'in_progress', 'completed'])
// The gate itself is not an implementation task. Legacy plans sometimes put
// it in the final native Todo, which otherwise makes verification recursive.
function isTerminalGateTodo(tasks: DeliveryTask[], remaining: string[]): boolean {
  if (remaining.length !== 1 || tasks.length < 2) return false
  const final = tasks[tasks.length - 1]!
  if (final.status === 'completed' || final.content.trim() !== remaining[0]) return false
  if (!tasks.slice(0, -1).every(task => task.status === 'completed')) return false
  return /(?:\u4ea4\u4ed8.{0,16}(?:\u9a8c\u8bc1|\u95e8\u7981)|(?:\u6700\u7ec8|\u6700\u540e).{0,20}(?:\u9a8c\u8bc1|\u9a8c\u6536|\u95e8\u7981)|(?:\u9a8c\u8bc1|\u9a8c\u6536).{0,12}\u95e8\u7981|(?:delivery|verification|acceptance).{0,16}(?:gate|check)|(?:gate|check).{0,16}(?:delivery|verification))/i.test(final.content)
}

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

export interface TaskAcceptance {
  task: string
  criterion: string
  checks: VerificationScript[]
}

interface TaskEvidence {
  task: string
  criterion: string
  checks: GateCheck[]
}

/** Maps every native Todo task to a declared criterion and fresh allowed checks. */
export function validateTaskAcceptance(
  tasks: DeliveryTask[], scripts: VerificationScript[], raw: unknown,
): TaskAcceptance[] {
  if (!Array.isArray(raw) || raw.length !== tasks.length) {
    throw new Error('task acceptance must cover every native Todo item exactly once')
  }
  return raw.map((entry: unknown, index): TaskAcceptance => {
    if (!entry || typeof entry !== 'object') throw new Error('invalid task acceptance entry')
    const item = entry as Partial<TaskAcceptance>
    const task = tasks[index]!.content.trim()
    if (item.task !== task) throw new Error('task acceptance order/content differs from native Todo')
    if (typeof item.criterion !== 'string' || item.criterion.trim().length < 3 ||
        item.criterion.length > 240) throw new Error('task acceptance criterion is missing or invalid')
    if (!Array.isArray(item.checks) || item.checks.length < 1 || item.checks.length > scripts.length ||
        new Set(item.checks).size !== item.checks.length ||
        item.checks.some(check => !scripts.includes(check))) {
      throw new Error('task acceptance checks must be distinct executed final scripts')
    }
    return { task, criterion: item.criterion.trim(), checks: [...item.checks] }
  })
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
  taskEvidence: TaskEvidence[]
}

function gate(
  stage: GateResult['stage'], nextAction: string, remaining: string[] = [],
  head = '', blockers: string[] = [], changes: string[] = [],
  checks: GateCheck[] = [], evidence: string[] = [], taskEvidence: TaskEvidence[] = [],
): GateResult {
  return { stage, ready: stage === 'verified', head, nextAction, remaining, blockers, changes, checks, evidence, taskEvidence }
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
export function createDeliveryGateTool(ctx: Context, settings: Settings, nativeResume?: NativeResumeReader): ToolDefinition {
  return defineTool({
    name: 'code_delivery_gate',
    description: 'Optional strict completion gate for Git-backed work with authorized Host execution and declared verification scripts. Not suitable for non-Git workspaces or denied execution; do not call repeatedly if blocked. Requires the native Todo projection when provided. Not a merge approval.',
    parameters: {
      tasks: {
        type: 'array', required: true,
        description: 'Copy the full latest native todo_write list (1..32), preserving pending/in_progress/completed statuses.',
        items: { type: 'object', additionalProperties: false, properties: {
          content: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['pending', 'in_progress', 'completed'] },
        } },
      },
      taskAcceptance: {
        type: 'array',
        description: 'Required for final verification: one ordered entry per native Todo item with a concrete acceptance criterion and fresh final-check names.',
        items: { type: 'object', additionalProperties: false, properties: {
          task: { type: 'string', required: true },
          criterion: { type: 'string', required: true },
          checks: { type: 'array', required: true, items: {
            type: 'string',
          } },
        } },
      },
      expectedHead: { type: 'string', description: 'Current baseline Git HEAD SHA captured before final verification. Required to verify completion.' },
      scripts: {
        type: 'array',
        description: 'Final checks to execute fresh, e.g. test and typecheck (1..5). Required to verify completion.',
        items: { type: 'string' },
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
      taskEvidence: { type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          task: { type: 'string', required: true },
          criterion: { type: 'string', required: true },
          checks: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false, properties: {
              script: { type: 'string', required: true },
              exitCode: { type: 'integer', required: true },
              passed: { type: 'boolean', required: true },
            },
          } },
        },
      } },
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
        ...result.taskEvidence.map(item => 'Acceptance: ' + item.task + ' — ' + item.criterion +
          ' [' + item.checks.map(check => check.script + ' exit ' + check.exitCode).join(', ') + ']'),
        'Fresh checks support declared acceptance, but do not prove semantic correctness. Review spec/diff before delivery.',
        'This gate does not replace independent review, Host approval or release governance.',
      ].join('\n') }]
    } },
    async execute(args, exec) {
      const tasks = args.tasks as DeliveryTask[]
      const remaining = remainingDeliveryTasks(tasks)
      // Tool arguments are authored by a model; they are not the authority for
      // completion. A real DSH Session must agree with the Host's durable Todo
      // projection before final verification begins.
      const claimed = JSON.stringify(tasks.map(task => ({ content: task.content.trim(), status: task.status })))
      let nativeWriteSeq: number | undefined
      if (nativeResume) {
        let checkpoint
        try { checkpoint = nativeResume.read(exec.agent) } catch { /* fail closed below */ }
        if (!checkpoint || checkpoint.invalid || !checkpoint.tasks || checkpoint.writeSeq < 0) {
          return gate('blocked', 'Restore or inspect the native DSH Todo checkpoint before final verification.',
            remaining, '', ['native Todo projection is missing or invalid'])
        }
        if (JSON.stringify(checkpoint.tasks) !== claimed) {
          return gate('blocked', 'Reload the latest native Todo tasks and reconcile their statuses before verifying.',
            remaining, '', ['supplied tasks differ from the native Todo checkpoint'])
        }
        nativeWriteSeq = checkpoint.writeSeq
      }
      if (!settings.allowCommands) {
        return gate('blocked',
          'Host script execution is disabled. Stop invoking this gate; use authorized native checks and report any verification gap explicitly.',
          remaining, '', ['script execution is disabled'])
      }
      const terminalGateTodo = isTerminalGateTodo(tasks, remaining)
      if (remaining.length > 0 && !terminalGateTodo) {
        return gate('continue',
          'Complete and verify remaining implementation work before using this gate. Do not add a Todo whose only purpose is to pass the gate: ' + remaining[0],
          remaining)
      }

      const scripts = args.scripts as VerificationScript[] | undefined
      if (!Array.isArray(scripts) || scripts.length < 1 || scripts.length > 5 ||
          new Set(scripts).size !== scripts.length || scripts.some(script => !isAllowedVerificationScript(script))) {
        return gate('blocked', 'Declare 1..5 distinct allowlisted final verification scripts.',
          [], '', ['fresh final verification scripts are missing or invalid'])
      }
      let acceptance: TaskAcceptance[]
      try {
        acceptance = validateTaskAcceptance(tasks, scripts, args.taskAcceptance)
      } catch {
        return gate('blocked', 'Declare one acceptance criterion and fresh check mapping for every native Todo task.',
          [], '', ['task acceptance evidence is missing, inconsistent or incomplete'])
      }
      if (typeof args.expectedHead !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(args.expectedHead)) {
        return gate('blocked', 'Read the current Git HEAD through the authorized Host and retry with expectedHead.',
          [], '', ['Git baseline is missing or invalid'])
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
      } catch (error) {
        if (exec.signal.aborted) throw new Error('delivery verification cancelled')
        const failureKind = classifyFailure(error)
        return gate('blocked', verificationNextAction(failureKind),
          [], '', ['final verification preflight rejected (' + failureKind + ')'])
      }

      let head = ''
      let changes: string[] = []
      const blockers: string[] = []
      const evidence: string[] = []
      const checks: GateCheck[] = []
      let verificationFailure: FailureKind | 'none' = 'none'
      try {
        const root = await resolveRoot(ctx, exec, settings)
        const cwd = await resolveAuthorizedGitCwd(ctx, root, args.cwd, exec)
        // The Git and verification evidence must refer to exactly the
        // same Host execution filesystem. Never silently override a
        // different preflight processPath and proceed to execution.
        if (prepared.some(step => step.cwd !== cwd)) {
          return gate('blocked', 'Reconcile the Host verification and Git execution directories.',
            [], '', ['Host verification directory differs from Git directory'])
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
        // Policy is optional and explicit. Read the committed HEAD tree, not
        // merely the index: git add must not hide an added file from the gate.
        // --cached plus --others includes staged and untracked new paths,
        // whereas staged deletions cannot appear in that current-file set.
        // A mounted Host subprocess remains mandatory; errors fail closed.
        if (settings.languageConventions.length > 0) {
          const headFiles = await hostGit(ctx, settings, cwd, exec,
            ['ls-tree', '-r', '--name-only', '-z', 'HEAD', '--'], 1024 * 1024)
          const currentFiles = await hostGit(ctx, settings, cwd, exec,
            ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], 1024 * 1024)
          const addedFiles = identifyAddedFiles(headFiles, currentFiles)
          blockers.push(...describeLanguageViolations(
            checkLanguageConventions(addedFiles, settings.languageConventions),
          ))
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
            verificationFailure = classifyVerificationEvidence(result)
            blockers.push('verification failed (' + verificationFailure + '): ' + result.script)
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
        // A new Todo write during checks makes earlier completion claims stale,
        // even when the model supplied the same text and task statuses.
        if (nativeResume && nativeWriteSeq !== undefined) {
          let latest
          try { latest = nativeResume.read(exec.agent) } catch { /* fail closed below */ }
          if (!latest || latest.invalid || latest.writeSeq !== nativeWriteSeq ||
              JSON.stringify(latest.tasks) !== claimed) {
            blockers.push('native Todo changed during verification; refresh checkpoint and rerun')
          }
        }
        if (blockers.length > 0) {
          return gate('blocked', verificationFailure === 'none'
            ? 'Resolve repository or native Todo blockers before requesting fresh verification.'
            : verificationNextAction(verificationFailure),
            [], head, blockers, changes, checks, evidence)
        }
        const taskEvidence = acceptance.map(item => ({
          task: item.task, criterion: item.criterion,
          checks: item.checks.map(script => checks.find(check => check.script === script)!),
        }))
        if (terminalGateTodo) {
          return gate('continue',
            'Fresh final checks passed. Mark only the final gate-only native Todo completed, then request a fully-completed certificate if needed. Do not rerun blocked checks or claim full completion before the native checkpoint is updated.',
            remaining, head, [], changes, checks, evidence, taskEvidence)
        }
        return gate('verified', 'Review acceptance semantics and the actual diff before merge or release.',
          [], head, [], changes, checks, evidence, taskEvidence)
      } catch (error) {
        if (exec.signal.aborted) throw new Error('delivery verification cancelled')
        const failureKind = classifyFailure(error)
        return gate('blocked', verificationNextAction(failureKind),
          [], head, ['Host Git or verification operation denied, failed or returned incomplete evidence (' + failureKind + ')'],
          changes, checks, evidence)
      }
    },
  })
}

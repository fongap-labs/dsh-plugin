import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../../../types.js'
import { TOOL_PREFIX, resolveRoot } from '../../../runtime.js'
import { resolveAuthorizedGitCwd } from './host-git-cwd.js'
import { parseGitStatus } from '../../../delta-code-repository/git-status-policy.js'
import { hasCompleteGitEvidence } from '../../../delta-code-repository/git-execution.js'

const PLAN_LIFETIME_MS = 5 * 60 * 1000
type Snapshot = {
  cwd: string
  branch: string
  remote: string
  head: string
  status: string
  issued: number
}
type Command = { stdout: string; exitCode: number | null; timedOut: boolean; signal: string | null; lossy?: boolean }

function safeGitName(name: unknown, label: string): string {
  if (typeof name !== 'string' || name.length < 1 || name.length > 128 ||
      name.startsWith('-') || name.includes('..') || name.includes('@{') ||
      name.endsWith('/') || name.endsWith('.') || name.includes('//') ||
      !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(name)) {
    throw new Error('unsafe Git ' + label + '; use a literal remote or branch name')
  }
  return name
}

/** Host-owned, fail-closed Git command with an explicit result per operation. */
async function git(ctx: Context, settings: Settings, cwd: string,
  signal: AbortSignal, operation: string, args: string[]): Promise<string> {
  signal.throwIfAborted()
  const result: Command = await runCommand(ctx, {
    command: settings.gitCommand, args, cwd, signal, hostOnly: true,
    timeoutMs: operation === 'fetch' ? 90_000 : 30_000, maxOutputBytes: 128 * 1024,
  })
  if (!hasCompleteGitEvidence(result)) {
    throw new Error('Git ' + operation + ' failed or returned incomplete Host evidence; stopping')
  }
  signal.throwIfAborted()
  return result.stdout.trim()
}

async function gitStatus(ctx: Context, settings: Settings, cwd: string,
  signal: AbortSignal): Promise<{ raw: string; clean: boolean; paths: string[] }> {
  // Preserve the terminating NUL of porcelain -z for a complete-status check.
  const result = await runCommand(ctx, {
    command: settings.gitCommand, args: ['status', '--porcelain=v1', '--branch', '-z'],
    cwd, signal, hostOnly: true, timeoutMs: 30_000, maxOutputBytes: 128 * 1024,
  })
  if (!hasCompleteGitEvidence(result)) throw new Error('Git status incomplete; refusing sync')
  const state = parseGitStatus(result.stdout)
  return { raw: result.stdout, clean: state.clean,
    paths: [...state.staged, ...state.unstaged, ...state.untracked].slice(0, 50) }
}

async function stashSha(ctx: Context, settings: Settings, cwd: string,
  signal: AbortSignal): Promise<string> {
  const outcome = await runCommand(ctx, {
    command: settings.gitCommand, args: ['rev-parse', '--verify', '-q', 'refs/stash'],
    cwd, signal, hostOnly: true, timeoutMs: 15_000, maxOutputBytes: 4096,
  })
  if (outcome.exitCode === 1 && outcome.timedOut === false &&
      outcome.signal === null && outcome.lossy === false) return ''
  if (!hasCompleteGitEvidence(outcome)) throw new Error('Cannot verify Git backup reference')
  return outcome.stdout.trim()
}

/**
 * Sync the CURRENT branch only. Never mix checkout, fetch, reset and clean in
 * one shell string. A preview is required, and it expires on any local change.
 * Existing work is stashed (including untracked files) before any reset.
 */
export function createGitSyncTool(ctx: Context, settings: Settings): ToolDefinition {
  const plans = new Map<string, Snapshot>()
  return defineTool({
    name: TOOL_PREFIX + 'git_sync',
    description: 'Guarded Git sync of the CURRENT branch. Preview first; sync needs the returned planId. Host subprocess approval remains authoritative. Never switches branches.',
    parameters: {
      action: { type: 'string', enum: ['preview', 'sync'], required: true },
      branch: { type: 'string', required: true, description: 'Exact current local branch to update.' },
      remote: { type: 'string', description: 'Configured Git remote, defaults to origin.' },
      planId: { type: 'string', description: 'Fresh planId from a preview; required for sync.' },
      preserveChanges: { type: 'boolean', description: 'Set true to save dirty files in a recoverable Git stash before syncing. If omitted, a dirty tree is refused.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        action: { type: 'string', required: true },
        branch: { type: 'string', required: true },
        head: { type: 'string', required: true },
        remote: { type: 'string', required: true },
        clean: { type: 'boolean', required: true },
        changedPaths: { type: 'array', required: true, items: { type: 'string' } },
        planId: { type: 'string', required: true },
        backupSha: { type: 'string', required: true },
      } },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    async execute(args, exec: ToolRunContext) {
      const branch = safeGitName(args.branch, 'branch')
      const remote = safeGitName(args.remote ?? 'origin', 'remote')
      const root = await resolveRoot(ctx, exec, settings)
      const cwd = await resolveAuthorizedGitCwd(ctx, root, undefined, exec)
      const currentBranch = await git(ctx, settings, cwd, exec.signal,
        'current branch', ['symbolic-ref', '--quiet', '--short', 'HEAD'])
      if (currentBranch !== branch) throw new Error('Current branch is ' + currentBranch +
        '; refusing to reset a different branch. Switch explicitly and preview again.')
      // Verify remote exists, without emitting its URL (which might contain credentials).
      await git(ctx, settings, cwd, exec.signal, 'remote', ['remote', 'get-url', remote])
      const head = await git(ctx, settings, cwd, exec.signal, 'HEAD', ['rev-parse', '--verify', 'HEAD'])
      const status = await gitStatus(ctx, settings, cwd, exec.signal)
      if (args.action === 'preview') {
        const planId = randomUUID()
        plans.clear()
        plans.set(planId, { cwd, branch, remote, head, status: status.raw, issued: Date.now() })
        return { action: 'preview', branch, head, remote, clean: status.clean,
          changedPaths: status.paths, planId, backupSha: '' }
      }
      if (args.action !== 'sync') throw new Error('Unsupported Git sync action')
      if (!settings.allowCommands) throw new Error('Git writes require execution.allowCommands=true')
      const plan = plans.get(args.planId ?? '')
      plans.clear()
      if (!plan || Date.now() - plan.issued > PLAN_LIFETIME_MS ||
          plan.cwd !== cwd || plan.branch !== branch || plan.remote !== remote ||
          plan.head !== head || plan.status !== status.raw) {
        throw new Error('Git sync plan missing, expired, or workspace changed; preview again')
      }
      if (!status.clean && args.preserveChanges !== true) {
        throw new Error('Git working tree is dirty; refuse sync until preservation is authorized')
      }
      // Fetch MUST succeed before any stash, reset or clean. FETCH_HEAD is
      // verified separately; a failed network request can never reset to stale refs.
      await git(ctx, settings, cwd, exec.signal, 'fetch',
        ['fetch', '--no-tags', '--no-recurse-submodules', remote, 'refs/heads/' + branch])
      const target = await git(ctx, settings, cwd, exec.signal, 'fetched HEAD',
        ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])
      if (!/^[0-9a-f]{40,64}$/i.test(target)) throw new Error('Invalid fetched commit; refusing reset')
      let backupSha = ''
      if (!status.clean) {
        const before = await stashSha(ctx, settings, cwd, exec.signal)
        await git(ctx, settings, cwd, exec.signal, 'stash',
          ['stash', 'push', '--include-untracked', '-m', 'delta-code guarded sync'])
        backupSha = await stashSha(ctx, settings, cwd, exec.signal)
        if (!backupSha || backupSha === before || !(await gitStatus(ctx, settings, cwd, exec.signal)).clean) {
          throw new Error('Git backup not verifiable; refusing reset')
        }
      }
      try {
        await git(ctx, settings, cwd, exec.signal, 'reset', ['reset', '--hard', target])
        // A separate command starts only after a confirmed successful reset.
        await git(ctx, settings, cwd, exec.signal, 'clean', ['clean', '-fd'])
        const finalHead = await git(ctx, settings, cwd, exec.signal, 'final HEAD',
          ['rev-parse', '--verify', 'HEAD'])
        const finalStatus = await gitStatus(ctx, settings, cwd, exec.signal)
        if (finalHead !== target || !finalStatus.clean) {
          throw new Error('Final HEAD or working tree verification failed')
        }
        return { action: 'sync', branch, head: finalHead, remote, clean: true,
          changedPaths: [], planId: '', backupSha }
      } catch (error) {
        throw new Error('Git sync stopped; backupSha=' + (backupSha || 'none') +
          '. Inspect repository before retrying. ' + String(error))
      }
    },
  })
}

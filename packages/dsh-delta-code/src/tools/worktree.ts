import { lstat, realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, isPathInside, isSubprocessAvailable } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'
import { resolveAuthorizedGitCwd } from './host-git-cwd.js'

const TASK = /^[a-z0-9][a-z0-9_-]{0,63}$/
const REF = /^(?!-)(?!.*\.\.)(?!.*[~^:?*\\\[\x00-\x20])(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/

export function validateWorktreeName(task: string, base: string): void {
  if (!TASK.test(task)) throw new Error('invalid worktree task slug')
  if (!REF.test(base) || base.endsWith('.lock') || base === '@') throw new Error('invalid base branch or commit')
}

interface WorktreeHostFs {
  resolve(path: string, opts: { cwd: string; signal?: AbortSignal }): Promise<unknown>
  contains(parent: unknown, child: unknown): boolean
  stat(target: unknown, signal?: AbortSignal): Promise<{ type: string } | undefined>
  lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<{ type: string } | undefined>
  processPath(target: unknown): string
}

/**
 * Host FS exclusively resolves and checks worktree targets. Existing parents
 * must be real directories, never symlinks; missing parents are created by
 * the authorized Host Git process, not by Node in the plugin process.
 */
async function resolveHostWorktreeTarget(
  fs: WorktreeHostFs, root: string, task: string, signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  const rootTarget = await fs.resolve(root, { cwd: root, signal })
  // Paths passed to Host FS are relative to its own execution world.
  // Do not format them with Node's platform-dependent path.join.
  const workspace = '.dsh-delta-code'
  const storage = '.dsh-delta-code/worktrees'
  let storageTarget: unknown
  for (const path of [workspace, storage]) {
    signal.throwIfAborted()
    const metadata = await fs.lstat(path, { cwd: root }, signal)
    if (metadata && metadata.type !== 'directory') {
      throw new Error('worktree storage has non-directory or symlinked parent')
    }
    const target = await fs.resolve(path, { cwd: root, signal })
    if (!fs.contains(rootTarget, target)) throw new Error('worktree storage escapes Host workspace')
    if (path === storage) storageTarget = target
  }
  const targetPath = storage + '/' + task
  signal.throwIfAborted()
  const existing = await fs.lstat(targetPath, { cwd: root }, signal)
  if (existing) throw new Error('worktree directory already exists')
  const target = await fs.resolve(targetPath, { cwd: root, signal })
  if (!fs.contains(rootTarget, target) || !fs.contains(storageTarget, target)) {
    throw new Error('worktree target escapes Host workspace')
  }
  signal.throwIfAborted()
  const processPath = fs.processPath(target)
  if (typeof processPath !== 'string' || !processPath || processPath.includes('\0')) {
    throw new Error('invalid Host worktree process path')
  }
  return processPath
}

/** The host must explicitly opt in before any new worktree or branch is written. */
export function createWorktreeTool(ctx: Context, settings: Settings): ToolDefinition {
  return defineTool({
    name: 'code_git_worktree',
    description: 'List worktrees or create one isolated task worktree and feature branch. Creation is disabled unless execution.allowWorktreeWrites=true.',
    parameters: {
      action: { type: 'string', enum: ['list', 'create'], required: true },
      task: { type: 'string', description: 'New task slug, e.g. fix-issue-123 (create only).' },
      base: { type: 'string', description: 'Existing base ref; defaults to HEAD (create only).' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', required: true }, output: { type: 'string', required: true },
    } }, render(_args, value) { return [{ type: 'text', text: value.output }] } },
    async execute(args, exec) {
      if (!isSubprocessAvailable(ctx)) throw new Error('host subprocess service is required for git worktrees')
      const root = await resolveRoot(ctx, exec, settings)
      const processCwd = await resolveAuthorizedGitCwd(ctx, root, undefined, exec)
      if (args.action === 'list') {
        const result = await runCommand(ctx, { command: settings.gitCommand, args: ['worktree', 'list', '--porcelain'],
          cwd: processCwd, timeoutMs: 15_000, maxOutputBytes: 32 * 1024, signal: exec.signal, hostOnly: true })
        if (result.exitCode !== 0 || result.timedOut || result.lossy || result.signal) throw new Error('git worktree list failed')
        return { action: 'list', output: result.stdout }
      }
      if (!settings.allowWorktreeWrites) throw new Error('worktree creation is disabled; set execution.allowWorktreeWrites=true')
      const task = args.task ?? ''
      const base = args.base ?? 'HEAD'
      validateWorktreeName(task, base)
      const mounted: unknown = ctx.get('fs')
      let target: string
      if (mounted) {
        const candidate = mounted as Partial<WorktreeHostFs>
        if (typeof candidate.resolve !== 'function' || typeof candidate.contains !== 'function' ||
            typeof candidate.stat !== 'function' || typeof candidate.lstat !== 'function' ||
            typeof candidate.processPath !== 'function') {
          throw new Error('DSH Host FS missing worktree path capabilities; refusing local fallback')
        }
        target = await resolveHostWorktreeTarget(candidate as WorktreeHostFs, root, task, exec.signal)
      } else {
        const canonicalRoot = await realpath(root)
        const dir = join(canonicalRoot, '.dsh-delta-code', 'worktrees')
        // Only the legacy local workspace uses Node filesystem checks.
        let ancestor = dir
        while (true) {
          try {
            const canonicalAncestor = await realpath(ancestor)
            if (!isPathInside(canonicalRoot, canonicalAncestor)) {
              throw new Error('worktree storage escapes workspace')
            }
            break
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
            const parent = dirname(ancestor)
            if (parent === ancestor) throw new Error('cannot resolve worktree storage inside workspace')
            ancestor = parent
          }
        }
        target = join(dir, task)
        try {
          await lstat(target)
          throw new Error('worktree directory already exists')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      exec.signal.throwIfAborted()
      const branch = 'code-worker/' + task
      const result = await runCommand(ctx, {
        command: settings.gitCommand, args: ['worktree', 'add', '-b', branch, target, base],
        cwd: processCwd, signal: exec.signal, timeoutMs: 45_000, maxOutputBytes: 8 * 1024, hostOnly: true,
      })
      if (result.exitCode !== 0 || result.timedOut || result.lossy || result.signal) {
        throw new Error('git worktree add failed or returned incomplete evidence: ' + result.stderr.slice(0, 1000))
      }
      return { action: 'create', output: 'Created ' + branch + ' in ' + target }
    },
  })
}

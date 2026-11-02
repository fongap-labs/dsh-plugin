import { lstat, mkdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, isPathInside, isSubprocessAvailable } from '@fongap-labs/shared'
import type { Settings } from '../types.js'
import { resolveRoot } from '../runtime.js'

const TASK = /^[a-z0-9][a-z0-9_-]{0,63}$/
const REF = /^(?!-)(?!.*\.\.)(?!.*[~^:?*\\\[\x00-\x20])(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*\/)*[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/

export function validateWorktreeName(task: string, base: string): void {
  if (!TASK.test(task)) throw new Error('invalid worktree task slug')
  if (!REF.test(base) || base.endsWith('.lock') || base === '@') throw new Error('invalid base branch or commit')
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
      if (args.action === 'list') {
        const result = await runCommand(ctx, { command: settings.gitCommand, args: ['worktree', 'list', '--porcelain'],
          cwd: root, timeoutMs: 15_000, maxOutputBytes: 32 * 1024, signal: exec.signal })
        if (result.exitCode !== 0 || result.timedOut || result.lossy) throw new Error('git worktree list failed')
        return { action: 'list', output: result.stdout }
      }
      if (!settings.allowWorktreeWrites) throw new Error('worktree creation is disabled; set execution.allowWorktreeWrites=true')
      const task = args.task ?? ''
      const base = args.base ?? 'HEAD'
      validateWorktreeName(task, base)
      const canonicalRoot = await realpath(root)
      const dir = join(canonicalRoot, '.dsh-code-worker', 'worktrees')
      await mkdir(dir, { recursive: true })
      const canonicalDir = await realpath(dir)
      if (!isPathInside(canonicalRoot, canonicalDir)) throw new Error('worktree storage escapes workspace')
      const target = join(canonicalDir, task)
      try {
        await lstat(target)
        throw new Error('worktree directory already exists')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const branch = 'code-worker/' + task
      const result = await runCommand(ctx, {
        command: settings.gitCommand, args: ['worktree', 'add', '-b', branch, target, base],
        cwd: canonicalRoot, signal: exec.signal, timeoutMs: 45_000, maxOutputBytes: 8 * 1024,
      })
      if (result.exitCode !== 0 || result.timedOut) throw new Error('git worktree add failed: ' + result.stderr.slice(0, 1000))
      return { action: 'create', output: 'Created ' + branch + ' in ' + target }
    },
  })
}

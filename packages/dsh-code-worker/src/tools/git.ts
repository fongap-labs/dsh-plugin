import { relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, resolveInside } from '@fongap-labs/shared'
import type { GitStatusResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot } from '../runtime.js'

export function createGitStatusTool(ctx: Context, settings: Settings): ToolDefinition {
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
      // Porcelain -z emits a single branch header, optionally followed by
      // '[ahead N, behind M]'. Parse counts independently of their order.
      branch = head.split('...')[0]!.split(' [')[0]!.trim()
      const aheadMatch = head.match(/\\bahead (\\d+)\\b/)
      const behindMatch = head.match(/\\bbehind (\\d+)\\b/)
      if (aheadMatch) ahead = Number(aheadMatch[1])
      if (behindMatch) behind = Number(behindMatch[1])
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

export function createGitDiffTool(ctx: Context, settings: Settings): ToolDefinition {
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

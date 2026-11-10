import { relative } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand, isSubprocessMounted, resolveInside, isPathInside } from '@fongap-labs/shared'
import type { GitStatusResult, Settings } from '../types.js'
import { TOOL_PREFIX, resolveRoot } from '../runtime.js'
import { resolveAuthorizedGitCwd } from './host-git-cwd.js'


interface HostPathFs {
  resolve(path: string, options: { cwd: string; signal?: AbortSignal }): Promise<unknown>
  contains(parent: unknown, child: unknown): boolean
}

/**
 * The public diff path is workspace-root-relative, not a Git pathspec.
 * Derive a literal pathspec within the selected checkout. For a mounted Host
 * FS, resolve actual targets through the Host and reject cross-repo aliases.
 */
async function resolveDiffPath(
  ctx: Context, root: string, requestedCwd: string | undefined,
  path: string, signal: AbortSignal,
): Promise<string> {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0') ||
      /^[a-zA-Z]:/.test(path) ||
      path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('git diff requires a safe workspace-relative path')
  }
  const mounted: unknown = ctx.get('fs')
  if (mounted) {
    if (requestedCwd && (requestedCwd.startsWith('/') || requestedCwd.includes('\\') ||
        /^[a-zA-Z]:/.test(requestedCwd) ||
        requestedCwd.split('/').some(segment => !segment || segment === '.' || segment === '..'))) {
      throw new Error('git diff cwd must be a workspace-relative directory')
    }
    const fs = mounted as Partial<HostPathFs>
    if (typeof fs.resolve !== 'function' || typeof fs.contains !== 'function') {
      throw new Error('DSH Host FS missing diff path containment methods')
    }
    const rootTarget = await fs.resolve(requestedCwd ?? root, { cwd: root, signal })
    const target = await fs.resolve(path, { cwd: root, signal })
    if (!fs.contains(rootTarget, target)) throw new Error('git diff path escapes selected repository')
    if (signal.aborted) throw new Error('git diff cancelled during path authorization')
    const prefix = requestedCwd ? requestedCwd + '/' : ''
    if (prefix && !path.startsWith(prefix)) {
      throw new Error('git diff path must be relative to the selected repository')
    }
    const relativePath = prefix ? path.slice(prefix.length) : path
    return ':(literal)' + relativePath
  }
  const localCwd = requestedCwd ? resolveInside(root, requestedCwd) : root
  const localPath = resolveInside(root, path)
  if (!isPathInside(localCwd, localPath) || localPath === localCwd) {
    throw new Error('git diff path escapes selected repository')
  }
  const relativePath = relative(localCwd, localPath)
  return ':(literal)' + relativePath
}

function assertGitResult(result: { exitCode: number | null; timedOut: boolean; signal: string | null }, operation: string): void {
  if (result.timedOut) throw new Error(operation + ': git command timed out')
  if (result.signal) throw new Error(operation + ': git command terminated by signal')
  if (result.exitCode !== 0) {
    throw new Error(operation + ': git command failed with exit code ' + String(result.exitCode))
  }
}

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
      const cwd = await resolveAuthorizedGitCwd(ctx, root, args.cwd, exec)
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: ['status', '--porcelain=v1', '--branch', '-z'],
        cwd,
        signal: exec.signal,
        timeoutMs: 30_000,
        // A denied or failing DSH Host subprocess may never silently retry as Node.
        hostOnly: Boolean(ctx.get('fs')) || isSubprocessMounted(ctx),
      })
      assertGitResult(result, 'code_git_status')
      if (result.lossy) throw new Error('code_git_status: output truncated; refusing partial status')
      return parseGitStatus(result.stdout)
    },
  })
}

/**
 * Parse the complete, NUL-delimited porcelain v1 --branch output.
 * A partial/malformed Host response must never become an apparently clean
 * working tree for code_resume or code_delivery_gate.
 */
export function parseGitStatus(raw: string): GitStatusResult {
  if (!raw || !raw.endsWith('\0')) throw new Error('invalid or incomplete Git porcelain status output')
  const records = raw.slice(0, -1).split('\0')
  if (records.length === 0 || records.some(record => !record)) {
    throw new Error('invalid or incomplete Git porcelain status records')
  }
  const header = records[0]!
  if (!header.startsWith('## ') || !header.slice(3).trim()) {
    throw new Error('missing Git porcelain branch header')
  }
  const head = header.slice(3)
  const branch = head.split('...')[0]!.split(' [')[0]!.trim()
  const aheadMatch = head.match(/\bahead (\d+)\b/)
  const behindMatch = head.match(/\bbehind (\d+)\b/)
  const ahead = aheadMatch ? Number(aheadMatch[1]) : 0
  const behind = behindMatch ? Number(behindMatch[1]) : 0
  if (!branch || !Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
    throw new Error('invalid Git porcelain branch information')
  }

  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index]!
    if (record.length < 4 || record[2] !== ' ') {
      throw new Error('invalid Git porcelain file status record')
    }
    const x = record[0]!
    const y = record[1]!
    const file = record.slice(3)
    // Git porcelain v1 uses exactly two status columns. Reject unknown or
    // partially present pairs rather than silently dropping a changed file.
    const isSpecial = (x === '?' && y === '?') || (x === '!' && y === '!')
    const isNormal = ' MADRCUT'.includes(x) && ' MADRCUT'.includes(y) &&
      (x !== ' ' || y !== ' ')
    if (!file || !(isSpecial || isNormal)) {
      throw new Error('invalid Git porcelain status pair or path')
    }
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      // In -z mode the destination comes first, followed by the old pathname.
      const source = records[++index]
      if (!source) throw new Error('incomplete git rename/copy record')
    }
    if (isSpecial) {
      // Ignored entries cannot appear with the current Git invocation;
      // conservatively count them as dirty if a Host returns them anyway.
      untracked.push(file)
    } else {
      if (x !== ' ') staged.push(x + ' ' + file)
      if (y !== ' ') unstaged.push(y + ' ' + file)
    }
  }
  return {
    branch, ahead, behind, staged, unstaged, untracked,
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
      const cwd = await resolveAuthorizedGitCwd(ctx, root, args.cwd, exec)
      const gitArgs = ['diff', '--no-color']
      if (args.staged) gitArgs.push('--cached')
      if (args.path) {
        const pathspec = await resolveDiffPath(ctx, root, args.cwd, args.path, exec.signal)
        gitArgs.push('--', pathspec)
      }
      const result = await runCommand(ctx, {
        command: settings.gitCommand,
        args: gitArgs,
        cwd,
        signal: exec.signal,
        timeoutMs: 30_000,
        maxOutputBytes: 256 * 1024,
        hostOnly: Boolean(ctx.get('fs')) || isSubprocessMounted(ctx),
      })
      assertGitResult(result, 'code_git_diff')
      return {
        diff: result.stdout,
        truncated: result.lossy,
      }
    },
  })
}

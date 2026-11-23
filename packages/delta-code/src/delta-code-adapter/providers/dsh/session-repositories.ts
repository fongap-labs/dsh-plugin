import { createHash } from 'node:crypto'
import { posix, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../../../types.js'
import { resolveRoot } from '../../../runtime.js'
import { requireHostFs } from './host-fs.js'
import { parseGitStatus } from '../../../delta-code-repository/git-status-policy.js'
import { rankTrackedFiles } from '../../../delta-code-repository/workspace-policy.js'
import {
  MAX_ATTACHED_REPOSITORIES, REPOSITORY_EVENT_MARKER,
  type RepositoryBinding,
} from '../../../delta-code-repository/session-repository-policy.js'
import type { NativeSessionRepositoryReader } from './session-repository-projection.js'

type Action = 'attach' | 'detach' | 'list' | 'inspect' | 'search'
const ID = /^repo-[0-9a-f]{20}$/
const safePath = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 2 && value.length <= 1024 &&
  !/[\u0000-\u001f\u007f]/u.test(value)
const samePath = (a: string, b: string): boolean =>
  (win32.isAbsolute(a) || win32.isAbsolute(b))
    ? win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase()
    : posix.normalize(a) === posix.normalize(b)

interface RepoView { id: string; path: string; readOnly: boolean; verified: boolean }
function authorized(config: Settings, path: string): boolean {
  return config.sessionReadOnlyRepositories.some(allowed => samePath(allowed, path))
}
async function authorizedRepo(
  ctx: Context, settings: Settings, path: string, exec: ToolRunContext,
): Promise<string> {
  exec.signal.throwIfAborted()
  // No Node FS fallback: external directories are meaningful only when the
  // native Host FS has independently granted them.
  const fs = requireHostFs(ctx, ['resolve', 'stat', 'processPath'],
    'session repositories require native Host read-only FS authorization')
  if (!fs) throw new Error('session repositories require mounted native Host FS')
  if (!safePath(path) || !authorized(settings, path)) {
    throw new Error('repository is not explicitly allowed by sessionRepositories.readOnlyRoots')
  }
  const root = await resolveRoot(ctx, exec, settings)
  const target = await fs.resolve(path, { cwd: root, signal: exec.signal })
  exec.signal.throwIfAborted()
  const info = await fs.stat(target, exec.signal)
  if (!info || info.type !== 'directory') throw new Error('Host denied repository directory access')
  const cwd = fs.processPath(target)
  if (!safePath(cwd) || !samePath(cwd, path)) {
    throw new Error('Host repository path alias differs from the configured root; re-authorize the canonical path')
  }
  const output = await runCommand(ctx, {
    command: settings.gitCommand, args: ['rev-parse', '--show-toplevel'],
    cwd, signal: exec.signal, timeoutMs: 10_000, maxOutputBytes: 4096, hostOnly: true,
  })
  if (output.exitCode !== 0 || output.timedOut || output.signal || output.lossy ||
      !samePath(output.stdout.trim(), cwd)) {
    throw new Error('native Host Git did not verify the exact repository root')
  }
  exec.signal.throwIfAborted()
  return cwd
}
function viewBindings(settings: Settings, bindings: readonly RepositoryBinding[]): RepoView[] {
  return bindings.filter(binding => authorized(settings, binding.path))
    .map(binding => ({ id: binding.id, path: binding.path, readOnly: true, verified: false }))
}
function repositoryEvent(action: 'attach' | 'detach', id: string, path: string): string {
  return REPOSITORY_EVENT_MARKER + JSON.stringify({ version: 1, action, id, path, readOnly: true })
}
async function gitRead(
  ctx: Context, settings: Settings, cwd: string, args: string[], maxBytes: number,
  exec: ToolRunContext,
): Promise<string> {
  const out = await runCommand(ctx, {
    command: settings.gitCommand, args, cwd, signal: exec.signal,
    timeoutMs: 15_000, maxOutputBytes: maxBytes, hostOnly: true,
  })
  if (out.exitCode !== 0 || out.timedOut || out.signal || out.lossy) {
    throw new Error('native Host Git read failed or returned incomplete evidence')
  }
  exec.signal.throwIfAborted()
  return out.stdout
}
function trackPaths(text: string): string[] {
  if (text && !text.endsWith('\0')) throw new Error('incomplete Git tracked-file list')
  const paths = text ? text.slice(0, -1).split('\0') : []
  for (const path of paths) {
    if (!path || path.startsWith('/') || path.includes('\\') ||
        path.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error('unsafe Git tracked-file path')
    }
  }
  return paths
}

/** P0: explicit session binding is advisory read-only context, never a new
 * Host filesystem scope or write permission. Every inspection rechecks Host.
 */
export function createSessionRepositoryTool(
  ctx: Context, settings: Settings, reader: NativeSessionRepositoryReader,
): ToolDefinition {
  return defineTool({
    name: 'code_session_repositories',
    description: 'Associate up to 8 user-allowlisted Git repositories with the owning DSH Session; list, detach, inspect or search an attached repository via native read-only Host Git. No cloning, arbitrary paths, writes, workdir switching or permission grant. Extra roots must first be added by the user to the Plugin read-only roots setting.',
    parameters: {
      action: { type: 'string', required: true, enum: ['attach', 'detach', 'list', 'inspect', 'search'] },
      path: { type: 'string', description: 'For attach: exact absolute path already configured in sessionRepositories.readOnlyRoots.' },
      id: { type: 'string', description: 'For detach, inspect, or search: ID from the session list.' },
      query: { type: 'string', description: 'For search: a short tracked-file name or code topic.' },
      limit: { type: 'integer', description: 'For search: 1..100 selected tracked files; default 30.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      action: { type: 'string', required: true },
      repositories: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        id: { type: 'string', required: true },
        path: { type: 'string', required: true },
        readOnly: { type: 'boolean', required: true },
        verified: { type: 'boolean', required: true },
      } } },
      revokedCount: { type: 'integer', required: true },
      branch: { type: 'string', required: true },
      clean: { type: 'boolean', required: true },
      staged: { type: 'integer', required: true },
      unstaged: { type: 'integer', required: true },
      untracked: { type: 'integer', required: true },
      selected: { type: 'array', required: true, items: { type: 'string' } },
      total: { type: 'integer', required: true },
      truncated: { type: 'boolean', required: true },
      event: { type: 'string', required: true },
    } }, render(_args, result) {
      const lines = [
        'Session repositories: ' + result.action + ' (read-only; not a Host permission grant)',
        ...result.repositories.map(repo => repo.id + ': ' + repo.path + ' (revalidate before reading)'),
        ...(result.revokedCount ? ['Previously associated but no longer allowlisted: ' + result.revokedCount] : []),
        ...(result.action === 'inspect' ? [
          'Branch: ' + result.branch, 'Working tree clean: ' + result.clean,
          'Staged: ' + result.staged + ', unstaged: ' + result.unstaged + ', untracked: ' + result.untracked,
        ] : []),
        ...(result.action === 'search' ? [
          'Matched files: ' + result.selected.join(', '),
          'Total tracked: ' + result.total + (result.truncated ? ' (truncated)' : ''),
        ] : []),
        ...(result.event ? [result.event] : []),
      ]
      return [{ type: 'text', text: lines.join('\n') }]
    } },
    async execute(args, exec) {
      if (!exec.agent || !('session' in exec.agent) || !exec.agent.session) {
        throw new Error('repository association requires an owning native DSH Session')
      }
      if (exec.signal.aborted) throw new Error('repository request cancelled')
      if (!settings.gitEnabled) throw new Error('native Git support is disabled')
      const state = reader.read(exec.agent)
      if (!state || state.invalid) {
        throw new Error('native session repository projection unavailable or invalid; do not keep a temporary binding')
      }
      const action = args.action as Action
      const bindings = state.bindings
      const repositories = viewBindings(settings, bindings)
      const base = {
        action, repositories, revokedCount: bindings.length - repositories.length,
        branch: '', clean: false, staged: 0, unstaged: 0, untracked: 0,
        selected: [] as string[], total: 0, truncated: false, event: '',
      }
      if (action === 'list') return base
      if (action === 'attach') {
        if (!safePath(args.path) || !authorized(settings, args.path)) {
          throw new Error('attach requires an exact repository path configured by the user')
        }
        const cwd = await authorizedRepo(ctx, settings, args.path, exec)
        const id = 'repo-' + createHash('sha256').update(cwd).digest('hex').slice(0, 20)
        if (!ID.test(id)) throw new Error('invalid repository identity')
        if (bindings.some(x => x.id === id || samePath(x.path, cwd))) {
          throw new Error('repository already associated with this session')
        }
        if (bindings.length >= MAX_ATTACHED_REPOSITORIES) throw new Error('session repository limit exceeded')
        return { ...base, event: repositoryEvent('attach', id, cwd) }
      }
      if (!ID.test(args.id ?? '')) throw new Error('expected attached repository ID')
      const binding = bindings.find(x => x.id === args.id)
      if (!binding) throw new Error('repository ID not found in the owning Session')
      if (action === 'detach') {
        // Detach remains possible after the user revokes the directory allowlist.
        return { ...base, event: repositoryEvent('detach', binding.id, binding.path) }
      }
      if (!authorized(settings, binding.path)) {
        throw new Error('repository access revoked in Plugin settings')
      }
      const cwd = await authorizedRepo(ctx, settings, binding.path, exec)
      if ('repo-' + createHash('sha256').update(cwd).digest('hex').slice(0, 20) !== binding.id) {
        throw new Error('repository path identity changed; detach and re-authorize')
      }
      if (action === 'inspect') {
        const status = parseGitStatus(await gitRead(ctx, settings, cwd,
          ['--no-optional-locks', 'status', '--porcelain=v1', '--branch', '-z'], 64 * 1024, exec))
        return { ...base, repositories: repositories.map(r =>
          r.id === binding.id ? { ...r, verified: true } : r),
          branch: status.branch, clean: status.clean,
          staged: status.staged.length, unstaged: status.unstaged.length, untracked: status.untracked.length }
      }
      if (action === 'search') {
        if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 160 ||
            /[\u0000-\u001f\u007f]/u.test(args.query)) throw new Error('invalid search query')
        const limit = args.limit ?? 30
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new Error('search limit must be 1..100')
        }
        const paths = trackPaths(await gitRead(ctx, settings, cwd, ['ls-files', '-z', '--cached'],
          1024 * 1024, exec))
        const selected = rankTrackedFiles(paths, args.query, limit)
        return { ...base, repositories: repositories.map(r =>
          r.id === binding.id ? { ...r, verified: true } : r),
          selected, total: paths.length, truncated: paths.length > selected.length }
      }
      throw new Error('unsupported repository action')
    },
  })
}

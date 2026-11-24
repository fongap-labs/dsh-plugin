import { createHash } from 'node:crypto'
import { posix, win32 } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool, runCommand } from '@fongap-labs/shared'
import type { Settings } from '../../../types.js'
import { resolveRoot } from '../../workspace-files.js'
import { requireHostFs } from './host-fs.js'
import { parseGitStatus } from '../../../delta-code-repository/git-status-policy.js'
import { rankTrackedFiles } from '../../../delta-code-repository/workspace-policy.js'
import {
  MAX_ATTACHED_REPOSITORIES,
  type RepositoryBinding, type SessionRepositoryState,
} from '../../../delta-code-repository/session-repository-policy.js'
import type { NativeSessionRepositoryReader } from './session-repository-projection.js'

/** The Host command registry is discovered at runtime; keep client-independent wire types local. */
interface CommandInvocation {
  readonly agent: unknown
  readonly rawInput: string
  readonly signal: AbortSignal
}
type CommandResult =
  | { readonly kind: 'success'; readonly text?: string; readonly sourceEventSeq?: number }
  | { readonly kind: 'error'; readonly text: string }
export interface CommandDefinition {
  readonly name: string
  readonly description: string
  readonly input: { readonly hint: string }
  readonly recordInput: boolean
  readonly handler: (invocation: CommandInvocation) => Promise<CommandResult>
}

type Action = 'attach' | 'detach' | 'list' | 'inspect' | 'search' | 'read'
type RepositoryAccess = 'read' | 'write'
const ID = /^repo-[0-9a-f]{20}$/
const safePath = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 2 && value.length <= 1024 &&
  !/[\u0000-\u001f\u007f]/u.test(value)
const samePath = (a: string, b: string): boolean =>
  /^[A-Za-z]:[\\/]/.test(a) || /^[A-Za-z]:[\\/]/.test(b)
    ? /^[A-Za-z]:[\\/]/.test(a) && /^[A-Za-z]:[\\/]/.test(b) &&
      win32.normalize(a).toLowerCase() === win32.normalize(b).toLowerCase()
    : posix.normalize(a) === posix.normalize(b)
const safeRelativePath = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 1024 &&
  !value.startsWith('/') && !/^[A-Za-z]:/.test(value) && !value.includes('\\') &&
  !/[\u0000-\u001f\u007f]/u.test(value) &&
  value.split('/').every(part => part !== '' && part !== '.' && part !== '..') &&
  value.split('/')[0] !== '.git' && value.split('/')[0] !== '.delta-code'

interface RepoView { id: string; path: string; readOnly: boolean; verified: boolean }
interface RepositoryBindingEvent {
  version: 1
  action: 'attach' | 'detach'
  id: string
  path: string
}
type RepositoryAgent = {
  session: {
    append(type: 'delta-code/repository-binding', data: RepositoryBindingEvent): { seq: number }
  }
}
function authorized(config: Settings, path: string): boolean {
  return config.sessionReadOnlyRepositories.some(allowed => samePath(allowed, path))
}
function writeAuthorized(config: Settings, path: string): boolean {
  return config.sessionWriteRepositories.some(allowed => samePath(allowed, path))
}
function viewBindings(settings: Settings, bindings: readonly RepositoryBinding[]): RepoView[] {
  return bindings.filter(binding => authorized(settings, binding.path))
    .map(binding => ({
      id: binding.id, path: binding.path,
      readOnly: !writeAuthorized(settings, binding.path), verified: false,
    }))
}
function currentState(reader: NativeSessionRepositoryReader, agent: unknown): SessionRepositoryState {
  const state = reader.read(agent)
  if (!state || state.invalid) {
    throw new Error('native session repository projection unavailable or invalid; repository action refused')
  }
  return state
}
function appendRepositoryEvent(
  agent: unknown, action: 'attach' | 'detach', id: string, path: string,
): number {
  if (!agent || typeof agent !== 'object' ||
      !('session' in agent) || !agent.session || typeof agent.session !== 'object' ||
      !('append' in agent.session) || typeof agent.session.append !== 'function') {
    throw new Error('repository binding requires the owning native DSH Session')
  }
  const event = (agent as RepositoryAgent).session.append('delta-code/repository-binding', {
    version: 1, action, id, path,
  })
  if (!event || !Number.isSafeInteger(event.seq) || event.seq < 0) {
    throw new Error('native Session did not confirm the repository binding event')
  }
  return event.seq
}

async function authorizedRepo(
  ctx: Context, settings: Settings, path: string, exec: ToolRunContext,
  access: RepositoryAccess = 'read',
): Promise<string> {
  exec.signal.throwIfAborted()
  if (!settings.gitEnabled) throw new Error('native Git support is disabled')
  const required = access === 'write'
    ? ['resolve', 'contains', 'stat', 'processPath', 'writeText']
    : ['resolve', 'contains', 'stat', 'processPath']
  const fs = requireHostFs(ctx, required as Array<'resolve' | 'contains' | 'stat' | 'processPath' | 'writeText'>,
    'session repositories require native Host filesystem authorization')
  if (!fs) throw new Error('session repositories require mounted native Host FS')
  if (!safePath(path) || !authorized(settings, path)) {
    throw new Error('repository is not explicitly allowed by sessionRepositories.readOnlyRoots')
  }
  if (access === 'write' && !writeAuthorized(settings, path)) {
    throw new Error('repository is not explicitly allowed by sessionRepositories.writeRoots')
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

/** Reject traversal, symlink escapes and insufficient Host capabilities for attached repository files. */
export async function assertSessionRepositoryFile(
  ctx: Context, root: string, relPath: string, signal: AbortSignal,
  access: RepositoryAccess,
): Promise<unknown> {
  if (!safeRelativePath(relPath)) throw new Error('expected safe repository-relative file path')
  const required = access === 'write'
    ? ['resolve', 'contains', 'writeText']
    : ['resolve', 'contains', 'readText']
  const fs = requireHostFs(ctx, required as Array<'resolve' | 'contains' | 'readText' | 'writeText'>,
    'attached repository files require native Host containment and access')
  if (!fs) throw new Error('attached repository files require mounted native Host FS')
  signal.throwIfAborted()
  const parent = await fs.resolve(root, { cwd: root, signal })
  const target = await fs.resolve(relPath, { cwd: root, signal })
  if (!fs.contains(parent, target)) throw new Error('attached repository file escapes allowed repository')
  signal.throwIfAborted()
  return target
}

/** Resolve an attached repository for one operation, rechecking the exact Session, allowlist and Host boundary. */
export async function resolveSessionRepositoryRoot(
  ctx: Context, settings: Settings, reader: NativeSessionRepositoryReader,
  exec: ToolRunContext, repositoryId: string, access: RepositoryAccess,
): Promise<string> {
  if (!ID.test(repositoryId)) throw new Error('expected an attached repository ID')
  const state = currentState(reader, exec.agent)
  const binding = state.bindings.find(entry => entry.id === repositoryId)
  if (!binding) throw new Error('repository ID is not attached to the owning Session')
  const cwd = await authorizedRepo(ctx, settings, binding.path, exec, access)
  if ('repo-' + createHash('sha256').update(cwd).digest('hex').slice(0, 20) !== binding.id) {
    throw new Error('repository path identity changed; detach and re-authorize')
  }
  return cwd
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
    if (!safeRelativePath(path)) throw new Error('unsafe Git tracked-file path')
  }
  return paths
}

async function attachRepository(
  ctx: Context, settings: Settings, reader: NativeSessionRepositoryReader,
  agent: unknown, path: string, signal: AbortSignal,
): Promise<{ id: string; path: string; seq: number }> {
  const state = currentState(reader, agent)
  if (!safePath(path) || !authorized(settings, path)) {
    throw new Error('attach requires an exact repository path configured by the user')
  }
  const exec = { agent, signal } as ToolRunContext
  const cwd = await authorizedRepo(ctx, settings, path, exec)
  const id = 'repo-' + createHash('sha256').update(cwd).digest('hex').slice(0, 20)
  if (!ID.test(id)) throw new Error('invalid repository identity')
  if (state.bindings.some(entry => entry.id === id || samePath(entry.path, cwd))) {
    throw new Error('repository already associated with this session')
  }
  if (state.bindings.length >= MAX_ATTACHED_REPOSITORIES) throw new Error('session repository limit exceeded')
  const seq = appendRepositoryEvent(agent, 'attach', id, cwd)
  return { id, path: cwd, seq }
}
function detachRepository(
  reader: NativeSessionRepositoryReader, agent: unknown, id: string,
): { path: string; seq: number } {
  if (!ID.test(id)) throw new Error('expected attached repository ID')
  const state = currentState(reader, agent)
  const binding = state.bindings.find(entry => entry.id === id)
  if (!binding) throw new Error('repository ID not found in the owning Session')
  // Detach remains possible after the user revokes the directory allowlist.
  const seq = appendRepositoryEvent(agent, 'detach', binding.id, binding.path)
  return { path: binding.path, seq }
}

/** Human command and model tool share the same Host operations and event-sourced Session state. */
export function createSessionRepositoryCommand(
  ctx: Context, settings: Settings, reader: NativeSessionRepositoryReader,
): CommandDefinition {
  return {
    name: 'delta-repo',
    description: 'Attach, list or detach explicitly allowlisted local repositories for this Session',
    input: { hint: 'list | attach "<absolute path>" | detach <repository-id>' },
    recordInput: false,
    async handler(invocation: CommandInvocation): Promise<CommandResult> {
      const input = invocation.rawInput.trim()
      if (input === 'list') {
        const state = currentState(reader, invocation.agent)
        const repositories = viewBindings(settings, state.bindings)
        return {
          kind: 'success',
          text: repositories.length
            ? repositories.map(repo => repo.id + ' ' + repo.path + (repo.readOnly ? ' (read only)' : ' (write allowlisted)')).join('\n')
            : 'No repositories are attached to this Session.',
        }
      }
      if (input.startsWith('attach ')) {
        let path: unknown
        try { path = JSON.parse(input.slice('attach '.length)) } catch {
          return { kind: 'error', text: 'Usage: /delta-repo attach "<absolute path>"' }
        }
        if (typeof path !== 'string') return { kind: 'error', text: 'Repository path must be a JSON string.' }
        const attached = await attachRepository(ctx, settings, reader, invocation.agent, path, invocation.signal)
        return {
          kind: 'success',
          text: 'Attached ' + attached.path + ' as ' + attached.id +
            (writeAuthorized(settings, attached.path) ? ' (write allowlisted).' : ' (read only).'),
          sourceEventSeq: attached.seq,
        }
      }
      if (input.startsWith('detach ')) {
        const id = input.slice('detach '.length).trim()
        if (!ID.test(id)) return { kind: 'error', text: 'Usage: /delta-repo detach <repository-id>' }
        const detached = detachRepository(reader, invocation.agent, id)
        return { kind: 'success', text: 'Detached ' + detached.path + '.', sourceEventSeq: detached.seq }
      }
      return {
        kind: 'error',
        text: 'Usage: /delta-repo list | /delta-repo attach "<absolute path>" | /delta-repo detach <repository-id>',
      }
    },
  }
}

/** P1/P2: per-Session repository context, with writes still separately allowlisted. */
export function createSessionRepositoryTool(
  ctx: Context, settings: Settings, reader: NativeSessionRepositoryReader,
): ToolDefinition {
  return defineTool({
    name: 'code_session_repositories',
    description: 'Associate up to 8 user-allowlisted Git repositories with the owning DSH Session; list, detach, inspect, search or read attached repositories through native Host capabilities. File edits use code_multi_edit with repositoryId and require the same path in sessionRepositories.writeRoots plus native Host write permission. No cloning, arbitrary paths, workdir switching or implicit permission grant.',
    parameters: {
      action: { type: 'string', required: true, enum: ['attach', 'detach', 'list', 'inspect', 'search', 'read'] },
      path: { type: 'string', description: 'For attach: exact absolute path in readOnlyRoots. For read: safe repository-relative file path.' },
      id: { type: 'string', description: 'For detach, inspect, search or read: ID from the session list.' },
      query: { type: 'string', description: 'For search: a short tracked-file name or code topic.' },
      limit: { type: 'integer', description: 'For search: 1..100 selected tracked files; default 30.' },
      maxBytes: { type: 'integer', description: 'For read: maximum UTF-8 file size, 1..131072 bytes; default 65536.' },
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
      file: { type: 'string', required: true },
      content: { type: 'string', required: true },
      event: { type: 'string', required: true },
    } }, render(_args, result) {
      const lines = [
        'Session repositories: ' + result.action,
        ...result.repositories.map(repo => repo.id + ': ' + repo.path + (repo.readOnly ? ' (read only)' : ' (write allowlisted)')),
        ...(result.revokedCount ? ['Previously associated but no longer allowlisted: ' + result.revokedCount] : []),
        ...(result.action === 'inspect' ? [
          'Branch: ' + result.branch, 'Working tree clean: ' + result.clean,
          'Staged: ' + result.staged + ', unstaged: ' + result.unstaged + ', untracked: ' + result.untracked,
        ] : []),
        ...(result.action === 'search' ? [
          'Matched files: ' + result.selected.join(', '),
          'Total tracked: ' + result.total + (result.truncated ? ' (truncated)' : ''),
        ] : []),
        ...(result.action === 'read' ? ['File: ' + result.file, result.content] : []),
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
      const state = currentState(reader, exec.agent)
      const action = args.action as Action
      const repositories = viewBindings(settings, state.bindings)
      const base = {
        action, repositories, revokedCount: state.bindings.length - repositories.length,
        branch: '', clean: false, staged: 0, unstaged: 0, untracked: 0,
        selected: [] as string[], total: 0, truncated: false,
        file: '', content: '', event: '',
      }
      if (action === 'list') return base
      if (action === 'attach') {
        if (typeof args.path !== 'string') throw new Error('attach requires an exact repository path configured by the user')
        const attached = await attachRepository(ctx, settings, reader, exec.agent, args.path, exec.signal)
        const next = currentState(reader, exec.agent)
        return {
          ...base, repositories: viewBindings(settings, next.bindings),
          event: 'Attached ' + attached.path + ' as ' + attached.id +
            (writeAuthorized(settings, attached.path) ? ' (write allowlisted).' : ' (read only).'),
        }
      }
      if (action === 'detach') {
        if (typeof args.id !== 'string') throw new Error('expected attached repository ID')
        const detached = detachRepository(reader, exec.agent, args.id)
        const next = currentState(reader, exec.agent)
        return { ...base, repositories: viewBindings(settings, next.bindings), event: 'Detached ' + detached.path + '.' }
      }
      if (!ID.test(args.id ?? '')) throw new Error('expected attached repository ID')
      const binding = state.bindings.find(entry => entry.id === args.id)
      if (!binding) throw new Error('repository ID not found in the owning Session')
      if (!authorized(settings, binding.path)) throw new Error('repository access revoked in Plugin settings')
      const cwd = await authorizedRepo(ctx, settings, binding.path, exec, 'read')
      if ('repo-' + createHash('sha256').update(cwd).digest('hex').slice(0, 20) !== binding.id) {
        throw new Error('repository path identity changed; detach and re-authorize')
      }
      if (action === 'inspect') {
        const status = parseGitStatus(await gitRead(ctx, settings, cwd,
          ['--no-optional-locks', 'status', '--porcelain=v1', '--branch', '-z'], 64 * 1024, exec))
        return { ...base, repositories: repositories.map(repo =>
          repo.id === binding.id ? { ...repo, verified: true } : repo),
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
        return { ...base, repositories: repositories.map(repo =>
          repo.id === binding.id ? { ...repo, verified: true } : repo),
          selected, total: paths.length, truncated: paths.length > selected.length }
      }
      if (action === 'read') {
        if (!safeRelativePath(args.path)) throw new Error('read requires a safe repository-relative file path')
        const maxBytes = args.maxBytes ?? 64 * 1024
        if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 128 * 1024) {
          throw new Error('maxBytes must be 1..131072')
        }
        const target = await assertSessionRepositoryFile(ctx, cwd, args.path, exec.signal, 'read')
        const host = requireHostFs(ctx, ['stat', 'readText'], 'attached repository reads require Host file metadata')
        const meta = await host!.stat(target, exec.signal)
        if (meta?.type !== 'file') throw new Error('attached repository file must be a regular file')
        if (typeof meta.size === 'number' && meta.size > maxBytes) {
          throw new Error('attached repository file exceeds the requested read size')
        }
        const content = await host!.readText(target, exec.signal)
        if (Buffer.byteLength(content, 'utf8') > maxBytes) {
          throw new Error('repository file exceeds the requested read size; use a narrower file or ask for a focused excerpt')
        }
        return { ...base, repositories: repositories.map(repo =>
          repo.id === binding.id ? { ...repo, verified: true } : repo), file: args.path, content }
      }
      throw new Error('unsupported repository action')
    },
  })
}

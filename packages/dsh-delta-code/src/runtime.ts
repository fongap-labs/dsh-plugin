import { open, mkdir, lstat, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolveInside, isPathInside, SandboxViolationError } from '@fongap-labs/shared'
import type { CodeWorkerConfig, GitHubAccountConfig, LspServerConfig, Settings } from './types.js'
import { requireHostFs } from './host-fs.js'
import type { HostFsCapabilities, HostWriteIntent } from './host-fs.js'

export const TOOL_PREFIX = 'code_'
const DEFAULT_LSP_SERVERS: LspServerConfig[] = [
  { language: 'typescript', command: 'typescript-language-server', args: ['--stdio'] },
  { language: 'javascript', command: 'typescript-language-server', args: ['--stdio'] },
  { language: 'python', command: 'pyright-langserver', args: ['--stdio'] },
  { language: 'rust', command: 'rust-analyzer', args: ['--stdio'] },
  { language: 'go', command: 'gopls', args: ['serve'] },
]

export const DEFAULT_GUIDANCE = [
  '## DSH Code Worker',
  'Prefer DSH native editing tools for ordinary changes. Use code_multi_edit only when a multi-file preflight or guarded batch edit offers a concrete benefit; avoid redundant tool calls.',
  'Use DSH native Git tools where available; code_git_status/code_git_diff are optional for Git worktrees, never prerequisites for ordinary code edits.',
  'Prefer focused native search and file reads; use code_workspace_map only for large Git workspaces where a tracked-file map would reduce exploration.',
  'If a Code Worker tool fails due to missing Host services or permission rejection, do not retry identical arguments. Switch to the permitted native Host file search or ask for the right repository; never bypass Host approval or read a giant file index.',
  'Run `code_verify` only when explicitly enabled; report test failures instead of claiming success.',
  'For substantial tasks keep the authoritative task list in DSH native todo_write. On continuation, inspect pending/in_progress items instead of blindly repeating work.',
  'On resumed multi-step coding work, consult native Todo/session history first; use code_resume only if native progress is missing and the Host exposes a compatible checkpoint. Reconcile real repository state before replaying edits.',
  'Use code_delivery_gate only for substantial Git-backed work when Host script execution is authorized, declared scripts exist, and implementation Todos are complete. Never create a self-referential Todo to pass the gate. In non-Git projects or when execution is denied, rely on permitted native evidence and explicitly report verification as incomplete; do not repeatedly call the gate or claim a pass.',
  'Use `code_git_worktree` for isolated branches when worktree creation is enabled. Pass the task worktree as cwd to context, Git, and verification tools; prepend it to file paths for multi-edit.',
  'Use `code_github_connection` to verify a repository-scoped GitHub account before remote operations.',
  'GitHub tools choose a token from the repository name or the workspace origin; do not request or expose tokens.',
  'GitHub write tools create changes on feature branches and open pull requests; do not bypass merge gates.',
  'Use code_lsp_probe only to diagnose missing language-server availability; it is not a substitute for Host LSP diagnostics.',
  'Always pass paths relative to the workspace root; absolute paths outside the workspace are rejected by the sandbox.',
].join('\n')

/** Render an unknown thrown value the way the JavaScript implementation did. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const message = (error as { message?: unknown } | null)?.message
  return message ? String(message) : String(error)
}

/** Validate account routing without ever logging or returning a token to the agent. */
export function validateGitHubAccounts(accounts: unknown): GitHubAccountConfig[] {
  if (accounts === undefined) return []
  if (!Array.isArray(accounts)) throw new Error('github.accounts must be an array')
  const owners = new Set<string>()
  const result: GitHubAccountConfig[] = []
  for (const entry of accounts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('invalid GitHub account')
    }
    const account = entry as Partial<GitHubAccountConfig>
    const owner = typeof account.owner === 'string' ? account.owner.trim().toLowerCase() : ''
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(owner)) {
      throw new Error('github.accounts[].owner must be a GitHub username or organization')
    }
    if (owners.has(owner)) throw new Error('duplicate GitHub owner mapping: ' + owner)
    owners.add(owner)
    if (Object.prototype.hasOwnProperty.call(entry, 'token')) {
      throw new Error('github.accounts[].token is not supported; migrate the credential to tokenEnv')
    }
    const tokenEnv = typeof account.tokenEnv === 'string' ? account.tokenEnv.trim() : ''
    if (!tokenEnv) {
      throw new Error('github.accounts[].tokenEnv is required for GitHub owner ' + owner)
    }
    if (!/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) {
      throw new Error('github.accounts[].tokenEnv must name an uppercase environment variable')
    }
    result.push({ owner, tokenEnv })
  }
  return result
}

export function normalizeConfig(config: CodeWorkerConfig | undefined): Settings {
  // Cordis volatile configuration nodes expose get(); project them into a
  // normal immutable snapshot before existing validation/default resolution.
  const unwrap = (value: any, active = new WeakSet<object>(), depth = 0): any => {
    if (!value || typeof value !== 'object') return value
    if (depth > 64) throw new Error('configuration nesting limit exceeded')
    if (active.has(value)) throw new Error('circular configuration reference')
    active.add(value)
    try {
      if (typeof value.get === 'function') return unwrap(value.get(), active, depth + 1)
      if (Array.isArray(value)) return value.map(item => unwrap(item, active, depth + 1))
      return Object.fromEntries(Object.entries(value).map(([key, item]) =>
        [key, unwrap(item, active, depth + 1)]))
    } finally {
      active.delete(value)
    }
  }
  const cfg: CodeWorkerConfig = unwrap(config && typeof config === 'object' ? config : {})
  const git = cfg.git && typeof cfg.git === 'object' ? cfg.git : {}
  const lsp = cfg.lsp && typeof cfg.lsp === 'object' ? cfg.lsp : {}
  const execution = cfg.execution && typeof cfg.execution === 'object' ? cfg.execution : {}
  const github = cfg.github && typeof cfg.github === 'object' ? cfg.github : {}
  const accounts = validateGitHubAccounts(github.accounts)
  const fsWriteContract = execution.fsWriteContract ?? 'legacy-overwrite'
  if (fsWriteContract !== 'legacy-overwrite' && fsWriteContract !== 'guarded-intent') {
    throw new Error('execution.fsWriteContract must be legacy-overwrite or guarded-intent')
  }
  const servers =
    Array.isArray(lsp.servers) && lsp.servers.length > 0 ? lsp.servers : DEFAULT_LSP_SERVERS
  return {
    enabled: cfg.enabled !== false,
    autoRoutingEnabled: cfg.autoRouting !== false,
    workspaceRoot: typeof cfg.workspaceRoot === 'string' ? cfg.workspaceRoot.trim() : '',
    gitEnabled: git.enabled !== false,
    gitCommand:
      typeof git.command === 'string' && git.command.trim() !== '' ? git.command.trim() : 'git',
    allowWorktreeWrites: execution.allowWorktreeWrites === true,
    allowCommands: execution.allowCommands === true,
    fsWriteContract,
    githubEnabled: github.enabled !== false && accounts.length > 0,
    githubAllowWrites: github.allowWrites === true,
    githubAccounts: accounts,
    lspServers: servers.filter(
      (server): server is LspServerConfig =>
        Boolean(server) && typeof server.command === 'string',
    ),
    systemPromptText: typeof cfg.systemPromptText === 'string' ? cfg.systemPromptText : '',
  }
}

export async function resolveRoot(
  ctx: Context,
  exec: ToolRunContext,
  settings: Settings,
): Promise<string> {
  const workingDirectory = ctx.get('workingDirectory')
  if (
    workingDirectory &&
    exec.agent !== undefined &&
    typeof workingDirectory.ensure === 'function'
  ) {
    // A Host error is an explicit failure, not permission to use process.cwd().
    // Only an absent Host-provided directory may use the configured fallback.
    const dir = await workingDirectory.ensure(exec.agent, exec.signal)
    if (dir) return dir
  }
  if (settings.workspaceRoot) return settings.workspaceRoot
  return process.cwd()
}


/**
 * Check the real filesystem path when the optional Host FS is unavailable.
 * Purely lexical resolveInside() is insufficient for existing symlinks.
 * The Host FS remains authoritative when it is present.
 */
async function assertLocalPathInside(root: string, target: string, isWrite: boolean): Promise<void> {
  const canonicalRoot = await realpath(root)
  if (isWrite) {
    // Refuse final-path symlinks even if their target does not yet exist.
    try {
      if ((await lstat(target)).isSymbolicLink()) {
        throw new SandboxViolationError('symbolic-link edits are not allowed', { root, target })
      }
    } catch (error) {
      if (error instanceof SandboxViolationError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  let probe = isWrite ? dirname(target) : target
  while (true) {
    try {
      const canonicalPath = await realpath(probe)
      if (!isPathInside(canonicalRoot, canonicalPath)) {
        throw new SandboxViolationError('path escapes workspace through a symbolic link', { root, target })
      }
      return
    } catch (error) {
      if (error instanceof SandboxViolationError) throw error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(probe)
      if (parent === probe) {
        throw new SandboxViolationError('cannot resolve path inside workspace', { root, target })
      }
      probe = parent
    }
  }
}

/** Validate an edit target before a batch begins.
 * Local fallback checks the real existing path; native Host FS owns its path policy.
 */
/**
 * Guarded writes use an explicit upstream FsWriteIntent. We never infer this
 * signature by making probe writes or checking function arity.
 */
/** Preserve a specific Host version or absence condition across read/modify/write. */
export type GuardedWriteIntent = HostWriteIntent

async function guardedWriteTarget(
  fs: HostFsCapabilities,
  root: string,
  absolute: string,
  signal: AbortSignal,
): Promise<{ target: unknown; intent: GuardedWriteIntent }> {
  if (typeof fs.contains !== 'function' || typeof fs.stat !== 'function') {
    throw new Error('guarded-intent requires DSH Host FS resolve/contains/stat/writeText')
  }
  signal.throwIfAborted()
  const parent = await fs.resolve(root, { cwd: root, signal })
  const target = await fs.resolve(absolute, { cwd: root, signal })
  if (!fs.contains(parent, target)) {
    throw new SandboxViolationError('Host FS write target escapes workspace', { root, target: absolute })
  }
  const info = await fs.stat(target, signal)
  if (info && (info.type !== 'file' || typeof info.version !== 'string' || !info.version)) {
    throw new Error('guarded-intent requires a regular file with an opaque version')
  }
  signal.throwIfAborted()
  return { target, intent: info
    ? { kind: 'replaceIfVersion', version: info.version as string }
    : { kind: 'createIfAbsent' } }
}

export async function validateWriteTargetSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
  settings?: Pick<Settings, 'fsWriteContract'>,
): Promise<GuardedWriteIntent | undefined> {
  const absolute = resolveInside(root, relPath)
  const fs = requireHostFs(ctx, ['resolve', 'writeText'], 'refusing local fallback')
  if (fs) {
    if (settings?.fsWriteContract === 'guarded-intent') {
      const { intent } = await guardedWriteTarget(fs, root, absolute, exec.signal)
      return intent
    }
    await fs.resolve(absolute, { cwd: root, signal: exec.signal })
    return undefined
  }
  if (settings?.fsWriteContract === 'guarded-intent') {
    throw new Error('guarded-intent requires a mounted DSH Host FS')
  }
  await assertLocalPathInside(root, absolute, true)
}

export async function readTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
): Promise<string> {
  const absolute = resolveInside(root, relPath)
  const fs = requireHostFs(ctx, ['resolve', 'readText'], 'refusing local fallback')
  if (fs) {
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.readText(resolved, signal)
  }
  if (process.platform === 'linux') return readLocalTextAnchored(root, absolute, exec.signal)
  return readLocalTextVerified(root, absolute, exec.signal)
}

/**
 * Anchor each directory traversal to an open descriptor on Linux. Unlike
 * path-based realpath/open sequences, renaming or replacing an intermediate
 * directory cannot redirect a subsequent lookup outside the opened parent.
 * Windows/macOS keep the existing compatibility fallback.
 */
async function openAnchoredLocalFile(
  root: string, absolute: string, isWrite: boolean, signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof open>>> {
  if (process.platform !== 'linux') throw new Error('anchored local file access requires Linux')
  signal?.throwIfAborted()
  const parts = relative(resolve(root), absolute).split(sep)
  if (parts.length === 0 || parts.some(part => !part || part === '.' || part === '..')) {
    throw new SandboxViolationError('anchored file path escapes workspace', { root, target: absolute })
  }
  // A trusted root is captured once; each child is opened relative to its
  // parent's descriptor. Do not use absolute names for child traversal.
  const canonicalRoot = await realpath(root)
  const rootBefore = await lstat(canonicalRoot)
  if (!rootBefore.isDirectory()) throw new Error('workspace root must be a directory')
  const opened: Array<Awaited<ReturnType<typeof open>>> = []
  try {
    const rootHandle = await open(canonicalRoot,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
    opened.push(rootHandle)
    const rootAfter = await rootHandle.stat()
    if (!rootAfter.isDirectory() ||
        rootBefore.dev !== rootAfter.dev || rootBefore.ino !== rootAfter.ino) {
      throw new SandboxViolationError('workspace root changed while opening', { root, target: absolute })
    }
    for (const part of parts.slice(0, -1)) {
      signal?.throwIfAborted()
      const parent = opened[opened.length - 1]!
      const child = '/proc/self/fd/' + parent.fd + '/' + part
      let directory: Awaited<ReturnType<typeof open>>
      try {
        directory = await open(child,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      } catch (error) {
        if (!isWrite || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        try {
          await mkdir(child)
        } catch (mkdirError) {
          if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError
        }
        // If another process substituted a symlink, O_NOFOLLOW refuses it.
        directory = await open(child,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
      }
      opened.push(directory)
    }
    signal?.throwIfAborted()
    const parent = opened[opened.length - 1]!
    const target = '/proc/self/fd/' + parent.fd + '/' + parts[parts.length - 1]!
    const flags = isWrite
      ? constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW
      : constants.O_RDONLY | constants.O_NOFOLLOW
    const file = await open(target, flags, 0o666)
    try {
      const metadata = await file.stat()
      if (!metadata.isFile() || (isWrite && metadata.nlink > 1)) {
        throw new SandboxViolationError('anchored target is not a regular unshared file',
          { root, target: absolute })
      }
    } catch (error) {
      await file.close()
      throw error
    }
    return file
  } catch (error) {
    // A symlink or non-directory component is a sandbox refusal, not a
    // raw /proc/self/fd path error; keep the established tool error contract.
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ELOOP' || code === 'ENOTDIR') {
      throw new SandboxViolationError('symbolic-link or invalid directory blocked by workspace sandbox',
        { root, target: absolute })
    }
    throw error
  } finally {
    for (const directory of opened.reverse()) await directory.close()
  }
}

export async function readLocalTextAnchored(
  root: string, absolute: string, signal?: AbortSignal,
): Promise<string> {
  const file = await openAnchoredLocalFile(root, absolute, false, signal)
  try {
    return await file.readFile('utf8')
  } finally {
    await file.close()
  }
}

export async function writeLocalTextAnchored(
  root: string, absolute: string, content: string, signal?: AbortSignal,
): Promise<void> {
  const file = await openAnchoredLocalFile(root, absolute, true, signal)
  try {
    signal?.throwIfAborted()
    await file.truncate(0)
    await file.writeFile(content, 'utf8')
  } finally {
    await file.close()
  }
}

/**
 * Portable fallback for Hosts without FS: open without truncation, then verify
 * the opened file matches the resolved workspace path before reading/writing.
 *
 * Unlike Linux's descriptor-relative traversal, these checks cannot close a
 * malicious parent's rename/reparse-point TOCTOU window on Windows/macOS.
 * Environments requiring strong isolation must mount an authoritative Host FS.
 */
async function openVerifiedLocalFile(
  root: string, absolute: string, isWrite: boolean, signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof open>>> {
  signal?.throwIfAborted()
  await assertLocalPathInside(root, absolute, isWrite)
  const canonicalRoot = await realpath(root)
  const canonicalParent = await realpath(dirname(absolute))
  if (!isPathInside(canonicalRoot, canonicalParent)) {
    throw new SandboxViolationError('parent directory escapes the workspace', { root, target: absolute })
  }

  // O_TRUNC is deliberately absent: no existing bytes change until the
  // post-open validation has completed. Never fall back to a path write.
  const flags = isWrite
    ? constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0)
    : constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  const handle = await open(absolute, flags, 0o666)
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || (isWrite && metadata.nlink > 1)) {
      throw new SandboxViolationError('target is not a regular unshared file',
        { root, target: absolute })
    }
    signal?.throwIfAborted()

    // On platforms without O_NOFOLLOW, lstat and realpath catch persistent
    // symlinks and junctions, and fstat/stat detects most path substitutions.
    const named = await lstat(absolute)
    if (named.isSymbolicLink()) {
      throw new SandboxViolationError('symbolic-link file access is not allowed',
        { root, target: absolute })
    }
    const rootAfter = await realpath(root)
    const parentAfter = await realpath(dirname(absolute))
    const targetAfter = await realpath(absolute)
    if (rootAfter !== canonicalRoot || parentAfter !== canonicalParent
        || !isPathInside(rootAfter, targetAfter)) {
      throw new SandboxViolationError('workspace path changed while opening file',
        { root, target: absolute })
    }
    const namedMetadata = await stat(absolute)
    if (!namedMetadata.isFile() || metadata.dev !== namedMetadata.dev
        || metadata.ino !== namedMetadata.ino
        || (isWrite && namedMetadata.nlink > 1)) {
      throw new SandboxViolationError('opened file does not match workspace path',
        { root, target: absolute })
    }
    signal?.throwIfAborted()
    return handle
  } catch (error) {
    await handle.close()
    throw error
  }
}

/** Opened-handle read: never reopen the target by its mutable pathname. */
export async function readLocalTextVerified(
  root: string, absolute: string, signal?: AbortSignal,
): Promise<string> {
  const handle = await openVerifiedLocalFile(root, absolute, false, signal)
  try {
    return await handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}

/** Opened-handle write: truncate only after the target has been validated. */
export async function writeLocalTextVerified(
  root: string, absolute: string, content: string, signal?: AbortSignal,
): Promise<void> {
  const handle = await openVerifiedLocalFile(root, absolute, true, signal)
  try {
    signal?.throwIfAborted()
    await handle.truncate(0)
    await handle.writeFile(content, 'utf8')
  } finally {
    await handle.close()
  }
}

/**
 * Open a file without following its final path component on supported OSes.
 * This narrows the check-to-open symlink race, but parent swaps remain possible.
 */
export async function writeLocalTextNoFollow(absolute: string, content: string): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow
  const handle = await open(absolute, flags, 0o666)
  try {
    await handle.writeFile(content, 'utf8')
  } finally {
    await handle.close()
  }
}

export async function writeTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
  content: string,
  settings?: Pick<Settings, 'fsWriteContract'>,
  pinnedIntent?: GuardedWriteIntent,
): Promise<unknown> {
  if (pinnedIntent && settings?.fsWriteContract !== 'guarded-intent') {
    throw new Error('pinned write intent requires guarded-intent Host FS')
  }
  const absolute = resolveInside(root, relPath)
  const fs = requireHostFs(ctx, ['resolve', 'writeText'], 'refusing local fallback')
  if (fs) {
    const signal = exec.signal
    if (settings?.fsWriteContract === 'guarded-intent') {
      const { target, intent } = await guardedWriteTarget(fs, root, absolute, signal)
      // Never replace the preflight snapshot's version with a newer one:
      // the Host must atomically reject concurrent changes, not adopt them.
      return fs.writeText(target, content, pinnedIntent ?? intent, signal)
    }
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    await fs.writeText(resolved, content, 'overwrite', signal)
    return
  }
  if (settings?.fsWriteContract === 'guarded-intent') {
    throw new Error('guarded-intent requires a mounted DSH Host FS')
  }
  if (process.platform === 'linux') {
    await writeLocalTextAnchored(root, absolute, content, exec.signal)
    return
  }
  await assertLocalPathInside(root, absolute, true)
  await mkdir(dirname(absolute), { recursive: true })
  // Check again after creation and before opening the verified handle.
  await assertLocalPathInside(root, absolute, true)
  await writeLocalTextVerified(root, absolute, content, exec.signal)
}

import { readFile, open, mkdir, lstat, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolveInside, isPathInside, SandboxViolationError } from '@fongap-labs/shared'
import type { CodeWorkerConfig, GitHubAccountConfig, LspServerConfig, Settings } from './types.js'

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
  'Use the `code_multi_edit` tool for batch file edits instead of repeated single edits.',
  'Use `code_git_status` and `code_git_diff` to inspect repository state before and after changes.',
  'Use `code_workspace_map` to find relevant tracked files before opening large source trees.',
  'Run `code_verify` only when explicitly enabled; report test failures instead of claiming success.',
  'Use `code_git_worktree` for isolated branches when worktree creation is enabled. Pass the task worktree as cwd to context, Git, and verification tools; prepend it to file paths for multi-edit.',
  'Use `code_github_connection` to verify a repository-scoped GitHub account before remote operations.',
  'GitHub tools choose a token from the repository name or the workspace origin; do not request or expose tokens.',
  'GitHub write tools create changes on feature branches and open pull requests; do not bypass merge gates.',
  'Use `code_lsp_probe` to detect available language servers in the current workspace.',
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
  const unwrap = (value: any): any => {
    if (value && typeof value === 'object' && typeof value.get === 'function') return unwrap(value.get())
    if (Array.isArray(value)) return value.map(unwrap)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, unwrap(v)]))
    return value
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
export type GuardedWriteIntent =
  | { kind: 'createIfAbsent' }
  | { kind: 'replaceIfVersion'; version: string }

async function guardedWriteTarget(
  fs: {
    resolve(path: string, opts: { cwd: string; signal?: AbortSignal }): Promise<unknown>
    contains?(parent: unknown, child: unknown): boolean
    stat?(target: unknown, signal?: AbortSignal): Promise<{ type: string; version?: unknown } | undefined>
    writeText(target: unknown, content: string, intent: unknown, signal?: AbortSignal): Promise<unknown>
  },
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
  const fs = ctx.get('fs')
  if (fs) {
    if (typeof fs.resolve !== 'function' || typeof fs.writeText !== 'function') {
      throw new Error('DSH Host FS missing resolve/writeText; refusing local fallback')
    }
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
  const fs = ctx.get('fs')
  if (fs) {
    if (typeof fs.resolve !== 'function' || typeof fs.readText !== 'function') {
      throw new Error('DSH Host FS missing resolve/readText; refusing local fallback')
    }
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.readText(resolved, signal)
  }
  if (process.platform === 'linux') return readLocalTextAnchored(root, absolute, exec.signal)
  await assertLocalPathInside(root, absolute, false)
  return readFile(absolute, 'utf8')
}

/**
 * Anchor each directory traversal to an open descriptor on Linux. Unlike
 * path-based realpath/open sequences, renaming or replacing an intermediate
 * directory cannot redirect a subsequent lookup outside the opened parent.
 * Windows/macOS keep the existing compatibility fallback.
 */
async function openAnchoredLocalFile(
  root: string, absolute: string, forWrite: boolean, signal?: AbortSignal,
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
        if (!forWrite || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
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
    const flags = forWrite
      ? constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW
      : constants.O_RDONLY | constants.O_NOFOLLOW
    const file = await open(target, flags, 0o666)
    try {
      const metadata = await file.stat()
      if (!metadata.isFile() || (forWrite && metadata.nlink > 1)) {
        throw new SandboxViolationError('anchored target is not a regular unshared file',
          { root, target: absolute })
      }
    } catch (error) {
      await file.close()
      throw error
    }
    return file
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
): Promise<void> {
  if (pinnedIntent && settings?.fsWriteContract !== 'guarded-intent') {
    throw new Error('pinned write intent requires guarded-intent Host FS')
  }
  const absolute = resolveInside(root, relPath)
  const fs = ctx.get('fs')
  if (fs) {
    if (typeof fs.resolve !== 'function' || typeof fs.writeText !== 'function') {
      throw new Error('DSH Host FS missing resolve/writeText; refusing local fallback')
    }
    const signal = exec.signal
    if (settings?.fsWriteContract === 'guarded-intent') {
      const { target, intent } = await guardedWriteTarget(fs, root, absolute, signal)
      // Never replace the preflight snapshot's version with a newer one:
      // the Host must atomically reject concurrent changes, not adopt them.
      await fs.writeText(target, content, pinnedIntent ?? intent, signal)
      return
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
  // Recheck after directory creation; do not write through a pre-existing link.
  await assertLocalPathInside(root, absolute, true)
  await writeLocalTextNoFollow(absolute, content)
}

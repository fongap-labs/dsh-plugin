import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { resolveInside } from '@fongap-labs/shared'
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
  'Use `code_git_worktree` for isolated branches when worktree creation is enabled.',
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

/** Reject invalid or overlapping account configuration before any token can be used. */
export function validateGitHubAccounts(accounts: unknown): GitHubAccountConfig[] {
  if (accounts === undefined) return []
  if (!Array.isArray(accounts)) throw new Error('github.accounts must be an array')
  const ids = new Set<string>()
  const result: GitHubAccountConfig[] = []
  for (const item of accounts) {
    if (!item || typeof item !== 'object') throw new Error('invalid GitHub account')
    const account = item as Partial<GitHubAccountConfig>
    if (typeof account.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(account.id)) {
      throw new Error('GitHub account id must contain only letters, digits, _ or -')
    }
    if (ids.has(account.id.toLowerCase())) throw new Error('duplicate GitHub account id')
    ids.add(account.id.toLowerCase())
    if (typeof account.tokenEnv !== 'string' || !/^[A-Z_][A-Z0-9_]*$/.test(account.tokenEnv)) {
      throw new Error('GitHub tokenEnv must name an uppercase environment variable')
    }
    if (account.login !== undefined &&
      (typeof account.login !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(account.login))) {
      throw new Error('invalid GitHub account login')
    }
    if (!Array.isArray(account.repositories) || account.repositories.length === 0 ||
      !account.repositories.every((pattern) =>
        typeof pattern === 'string' &&
        /^[a-zA-Z0-9_.-]+\/(?:[a-zA-Z0-9_.-]+|\*)$/.test(pattern))) {
      throw new Error('github.accounts[].repositories must contain owner/repo or owner/*')
    }
    result.push({
      id: account.id,
      tokenEnv: account.tokenEnv,
      ...(account.login ? { login: account.login } : {}),
      repositories: account.repositories.map((pattern) => pattern.toLowerCase()),
    })
  }
  return result
}

export function normalizeConfig(config: CodeWorkerConfig | undefined): Settings {
  const cfg: CodeWorkerConfig = config && typeof config === 'object' ? config : {}
  const git = cfg.git && typeof cfg.git === 'object' ? cfg.git : {}
  const lsp = cfg.lsp && typeof cfg.lsp === 'object' ? cfg.lsp : {}
  const execution = cfg.execution && typeof cfg.execution === 'object' ? cfg.execution : {}
  const github = cfg.github && typeof cfg.github === 'object' ? cfg.github : {}
  const accounts = validateGitHubAccounts(github.accounts)
  const servers =
    Array.isArray(lsp.servers) && lsp.servers.length > 0 ? lsp.servers : DEFAULT_LSP_SERVERS
  return {
    enabled: cfg.enabled !== false,
    workspaceRoot: typeof cfg.workspaceRoot === 'string' ? cfg.workspaceRoot.trim() : '',
    gitEnabled: git.enabled !== false,
    gitCommand:
      typeof git.command === 'string' && git.command.trim() !== '' ? git.command.trim() : 'git',
    allowWorktreeWrites: execution.allowWorktreeWrites === true,
    allowCommands: execution.allowCommands === true,
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
    try {
      const dir = await workingDirectory.ensure(exec.agent, exec.signal)
      if (dir) return dir
    } catch {
      /* fall through to config / cwd */
    }
  }
  if (settings.workspaceRoot) return settings.workspaceRoot
  return process.cwd()
}

export async function readTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
): Promise<string> {
  const absolute = resolveInside(root, relPath)
  const fs = ctx.get('fs')
  if (fs && typeof fs.readText === 'function') {
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.readText(resolved, signal)
  }
  return readFile(absolute, 'utf8')
}

export async function writeTextSafe(
  ctx: Context,
  exec: ToolRunContext,
  root: string,
  relPath: string,
  content: string,
): Promise<void> {
  const absolute = resolveInside(root, relPath)
  const fs = ctx.get('fs')
  if (fs && typeof fs.writeText === 'function') {
    const signal = exec.signal
    const resolved = await fs.resolve(absolute, { cwd: root, signal })
    return fs.writeText(resolved, content, 'overwrite', signal)
  }
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, content, 'utf8')
}


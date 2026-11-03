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
  'Start coding tasks with code_project_profile to identify project rules, stack and verification commands. Read applicable AGENTS.md / CLAUDE.md with the Host file reader.',
  'Use native Harness search, editor, terminal, LSP, Skills, subagents and task tracking rather than duplicating them.',
  'When autoRouting is enabled, coding requests select a procedure automatically. For substantial tasks use the read-only code_workflow_route to refine risk and scope; load other native code-* Skills only as needed. Keep small changes lightweight.',
  'Use code_workspace_map for compact tracked-file discovery and code_multi_edit only for carefully scoped batch edits.',
  'Check code_git_status and code_git_diff around edits; preserve unrelated user changes.',
  'Use code_verify for explicit project scripts only if execution is enabled. Report actual evidence and never represent unrun checks as passes.',
  'Use code_git_worktree only when isolation is enabled, and do not bypass the Harness permissions or GitHub CI gates.',
  'GitHub account tokens stay private. Push only feature branches; CI, release and merge authority remain external.',
  'Apply code-verification-gate before claiming success. A red/pending required check or an unrun test is not a pass; obey all Host permissions and project rules.',
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
    const token = typeof account.token === 'string' ? account.token.trim() : ''
    const tokenEnv = typeof account.tokenEnv === 'string' ? account.tokenEnv.trim() : ''
    if ((token !== '' && tokenEnv !== '') || (token === '' && tokenEnv === '')) {
      throw new Error('configure exactly one of token or tokenEnv for GitHub owner ' + owner)
    }
    if (tokenEnv && !/^[A-Z_][A-Z0-9_]*$/.test(tokenEnv)) {
      throw new Error('github.accounts[].tokenEnv must name an uppercase environment variable')
    }
    result.push({ owner, ...(token ? { token } : { tokenEnv }) })
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


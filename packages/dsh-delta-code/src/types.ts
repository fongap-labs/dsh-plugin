import type { HostFsService } from './host-fs.js'

/**
 * Internal host contracts and public Code Worker configuration types.
 * Keep the plugin's published type exports available through index.ts.
 */
import type {} from '@deepseek-ai/dsh-system-prompt'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Stable subset of the Host service lookup used by this plugin. */
    get(name: 'workingDirectory'): WorkingDirectoryService | undefined
    get(name: 'fs'): HostFsService | undefined
    /** Defer optional prompt registration until the service exists. */
    inject(dependencies: string[], callback: (child: Context) => void): unknown
    /** Optional host workspace provider; paths fall back to config and `cwd`. */
    workingDirectory?: WorkingDirectoryService
    /** Optional host filesystem service; reads and writes fall back to `node:fs`. */
    fs?: HostFsService
  }
}

/** The subset of the host `workingDirectory` service this plugin relies on. */
interface WorkingDirectoryService {
  ensure(agent: unknown, signal?: AbortSignal): Promise<string | undefined | null>
}

export type HostFsWriteContract = 'legacy-overwrite' | 'guarded-intent'

/** One configured language server. `args` is accepted for config compatibility. */
export interface LspServerConfig {
  language: string
  command: string
  args?: string[]
}

/** A GitHub account selected automatically by the repository owner (user or organization). */
export interface GitHubAccountConfig {
  /** GitHub username or organization name (left side of owner/repository). */
  owner: string
  /** Environment variable name that holds the GitHub personal access token. */
  tokenEnv: string
}

/** Plugin configuration as accepted from the Cordis patch file. */
export interface CodeWorkerConfig {
  enabled?: boolean
  autoRouting?: boolean
  workspaceRoot?: string
  git?: {
    enabled?: boolean
    command?: string
  }
  execution?: {
    allowWorktreeWrites?: boolean
    allowCommands?: boolean
    fsWriteContract?: HostFsWriteContract
  }
  github?: {
    enabled?: boolean
    allowWrites?: boolean
    accounts?: GitHubAccountConfig[]
  }
  lsp?: {
    servers?: LspServerConfig[]
  }
  systemPromptText?: string
}

/** Normalized settings with every default resolved. */
export interface Settings {
  enabled: boolean
  autoRoutingEnabled: boolean
  workspaceRoot: string
  gitEnabled: boolean
  gitCommand: string
  allowWorktreeWrites: boolean
  allowCommands: boolean
  fsWriteContract: HostFsWriteContract
  githubEnabled: boolean
  githubAllowWrites: boolean
  githubAccounts: GitHubAccountConfig[]
  lspServers: LspServerConfig[]
  systemPromptText: string
}

/** One edit applied by `code_multi_edit`. */
export interface EditResult {
  path: string
  action: 'overwrite' | 'replace' | 'skipped'
  ok: boolean
  note?: string
}

/** Parsed result of `git status --porcelain=v1 --branch`. */
export interface GitStatusResult {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  unstaged: string[]
  untracked: string[]
  clean: boolean
}

/** One language-server probe result. */
export interface LspProbeResult {
  language: string
  command: string
  available: boolean
  note: string
}

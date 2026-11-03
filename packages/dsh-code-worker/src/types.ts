/**
 * Internal host contracts and public Code Worker configuration types.
 * Keep the plugin's published type exports available through index.ts.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Stable subset of the Host service lookup used by this plugin. */
    get(name: 'workingDirectory'): WorkingDirectoryService | undefined
    get(name: 'fs'): HostFsService | undefined
    /** Defer optional prompt registration until the service exists. */
    inject(dependencies: string[], callback: (child: Context) => void): unknown
    /** Optional host prompt service; the guidance section is skipped without it. */
    systemPrompt?: SystemPromptService
    /** Optional host workspace provider; paths fall back to config and `cwd`. */
    workingDirectory?: WorkingDirectoryService
    /** Optional host filesystem service; reads and writes fall back to `node:fs`. */
    fs?: HostFsService
  }
}

/** Prompt section registration accepted by the host `systemPrompt` service. */
interface PromptSectionSpec {
  name: string
  order: number
  text: string
}

/** The subset of the host `systemPrompt` service this plugin relies on. */
interface SystemPromptService {
  getSectionOrder(section: string): number
  section(spec: PromptSectionSpec): (() => void) | undefined
}

/** The subset of the host `workingDirectory` service this plugin relies on. */
interface WorkingDirectoryService {
  ensure(agent: unknown, signal?: AbortSignal): Promise<string | undefined | null>
}

/** The subset of the host `fs` service this plugin relies on. */
interface HostFsService {
  resolve(path: string, options: { cwd: string; signal?: AbortSignal }): Promise<string>
  readText(path: string, signal?: AbortSignal): Promise<string>
  writeText(path: string, content: string, mode: 'overwrite', signal?: AbortSignal): Promise<void>
}

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
  /** Personal access token. Set only in a local, untracked user profile. */
  token?: string
  /** Optional environment-variable alternative to a literal token. */
  tokenEnv?: string
}

/** Plugin configuration as accepted from the Cordis patch file. */
export interface CodeWorkerConfig {
  enabled?: boolean
  workspaceRoot?: string
  git?: {
    enabled?: boolean
    command?: string
  }
  execution?: {
    allowWorktreeWrites?: boolean
    allowCommands?: boolean
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
  workspaceRoot: string
  gitEnabled: boolean
  gitCommand: string
  allowWorktreeWrites: boolean
  allowCommands: boolean
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

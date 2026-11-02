/**
 * Internal host contracts and public Code Worker configuration types.
 * Keep the plugin's published type exports available through index.ts.
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
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

/** Plugin configuration as accepted from the Cordis patch file. */
export interface CodeWorkerConfig {
  enabled?: boolean
  workspaceRoot?: string
  git?: {
    enabled?: boolean
    command?: string
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

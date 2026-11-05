export const DESKTOP_HOST_API_VERSION = { major: 1, minor: 1 } as const

export interface DesktopHostProtocolVersion {
  major: number
  minor: number
}

export type DesktopHostCapability =
  | 'sessions.list'
  | 'sessions.create'
  | 'sessions.resume'
  | 'sessions.prompt'
  | 'sessions.cancel'
  | 'sessions.events'
  | 'sessions.events.resync'
  | 'approvals.respond'
  | 'questions.respond'
  | 'workspace.list'
  | 'workspace.select'
  | 'workspace.cwd'
  | 'workspace.files'
  | 'settings.read'
  | 'settings.write'
  | 'models.list'
  | 'plugins.list'
  | 'skills.manage'
  | 'terminals.manage'
  | 'terminals.events'

export interface DesktopHostHandshake {
  protocolVersion: DesktopHostProtocolVersion
  runtime: { name: 'deepseek-harness'; version: string }
  capabilities: readonly DesktopHostCapability[]
  upstream: { protocol: 'sdk-stdio-unversioned'; capabilitySource: 'adapter-supported-methods'; eventReplay: false; runCancellation: false }
}

export type RuntimeStatus =
  | { state: 'offline'; message: string }
  | { state: 'starting'; message: string }
  | { state: 'ready'; version: string; message: string }
  | { state: 'faulted'; message: string }

export interface RuntimeStatusPort {
  getSnapshot(): RuntimeStatus
  subscribe(listener: () => void): () => void
}

export type SessionState = 'idle' | 'running' | 'waiting_approval' | 'waiting_input' | 'failed'

export interface SessionSummary {
  id: string
  title: string
  state: SessionState
  workspaceId?: string
  updatedAt: string
}

export interface HostPage<T> {
  items: T[]
  nextCursor?: string
}

export type PromptContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name?: string }

interface DesktopSessionEventBase {
  eventId: string
  sessionId: string
  sequence: number
  occurredAt: number
}

export type DesktopSessionEvent = DesktopSessionEventBase & (
  | { type: 'session.advanced'; payload: Record<string, never> }
  | { type: 'message.completed'; payload: { messageId: string; role: 'user' | 'assistant'; text: string } }
  | { type: 'tool.started'; payload: { callId: string; toolName: string; summary?: string } }
  | { type: 'tool.completed'; payload: { callId: string; outcome: 'success' | 'error' | 'cancelled'; summary?: string } }
  | { type: 'approval.requested'; payload: { requestId: string; toolName: string; reason: string; input: unknown } }
  | { type: 'question.requested'; payload: { requestId: string; questions: Array<{ id: string; prompt: string; options?: string[] }> } }
)

export interface DesktopSessionStatus {
  sessionId: string
  status: 'idle' | 'running'
}

export interface DesktopHostRequest {
  id: string | number
  method: string
  params: Record<string, unknown>
}

export interface WorkspaceSummary {
  id: string
  name: string
  path: string
}

export interface WorkspaceFileEntry {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
}

export interface SettingsSnapshot {
  revision: string
  values: Record<string, unknown>
}

export interface CatalogEntry {
  id: string
  name: string
  description?: string
  enabled?: boolean
}

export interface TerminalSnapshot {
  id: string
  state: 'running' | 'exited' | 'failed'
  exitCode?: number
}

export type DesktopTerminalEvent =
  | { terminalId: string; sequence: number; type: 'output'; data: string }
  | { terminalId: string; sequence: number; type: 'exit'; exitCode?: number }

export interface DesktopHostPort extends RuntimeStatusPort {
  handshake(signal?: AbortSignal): Promise<DesktopHostHandshake>
  listSessions(input?: { cursor?: string; query?: string; state?: SessionState }, signal?: AbortSignal): Promise<HostPage<SessionSummary>>
  createSession(input?: { workspaceId?: string }, signal?: AbortSignal): Promise<SessionSummary>
  resumeSession(sessionId: string, signal?: AbortSignal): Promise<SessionSummary>
  prompt(sessionId: string, content: readonly PromptContentBlock[], signal?: AbortSignal): Promise<{ runId: string }>
  cancelSession(sessionId: string, runId?: string, signal?: AbortSignal): Promise<void>
  respondApproval(requestId: string, outcome: 'allowed-once' | 'rejected' | 'cancelled', signal?: AbortSignal): Promise<void>
  answerQuestion(requestId: string, answers: Record<string, string[]>, signal?: AbortSignal): Promise<void>
  listWorkspaces(signal?: AbortSignal): Promise<WorkspaceSummary[]>
  selectWorkspace(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceSummary>
  listWorkspaceFiles(workspaceId: string, relativePath?: string, signal?: AbortSignal): Promise<WorkspaceFileEntry[]>
  getSettings(signal?: AbortSignal): Promise<SettingsSnapshot>
  updateSettings(values: Record<string, unknown>, revision: string, signal?: AbortSignal): Promise<SettingsSnapshot>
  listModels(signal?: AbortSignal): Promise<CatalogEntry[]>
  listPlugins(signal?: AbortSignal): Promise<CatalogEntry[]>
  listSkills(signal?: AbortSignal): Promise<CatalogEntry[]>
  openTerminal(workspaceId: string, signal?: AbortSignal): Promise<TerminalSnapshot>
  writeTerminal(terminalId: string, input: string, signal?: AbortSignal): Promise<void>
  resizeTerminal(terminalId: string, columns: number, rows: number, signal?: AbortSignal): Promise<void>
  closeTerminal(terminalId: string, signal?: AbortSignal): Promise<void>
  subscribeTerminal(terminalId: string, listener: (event: DesktopTerminalEvent) => void): () => void
  subscribeSession(sessionId: string, listener: (event: DesktopSessionEvent) => void): () => void
}

export type DesktopHostErrorCode =
  | 'protocol_mismatch'
  | 'unsupported_capability'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'invalid_request'
  | 'runtime_unavailable'
  | 'timeout'
  | 'cancelled'
  | 'runtime_error'

export class DesktopHostError extends Error {
  constructor(
    readonly code: DesktopHostErrorCode,
    message: string,
    readonly retryable = false,
    readonly outcomeUnknown = false,
  ) {
    super(message)
    this.name = 'DesktopHostError'
  }
}

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  DESKTOP_HOST_API_VERSION,
  DesktopHostError,
  type DesktopHostCapability,
  type DesktopHostErrorCode,
  type DesktopHostHandshake,
  type DesktopHostRequest,
  type DesktopSessionEvent,
  type DesktopSessionStatus,
  type PromptContentBlock,
  type RuntimeStatus,
} from './desktop-host-contract'

export interface RuntimeConnectInput {
  nodePath: string
  dshPath: string
  dshHome: string
  harnessPatchPath: string
  workspace: string
  provider: string
  model: string
}

let negotiation: DesktopHostHandshake | null = null
let negotiationEpoch = 0
const capabilitySubscribers = new Set<() => void>()

function updateNegotiation(value: DesktopHostHandshake | null) {
  negotiation = value
  for (const listener of capabilitySubscribers) listener()
}

function clearNegotiation() {
  negotiationEpoch += 1
  updateNegotiation(null)
}

export const desktopHostCapabilities = {
  getSnapshot: (): DesktopHostHandshake | null => negotiation,
  subscribe(listener: () => void) {
    capabilitySubscribers.add(listener)
    return () => capabilitySubscribers.delete(listener)
  },
}

function normalizeError(error: unknown): DesktopHostError {
  if (error instanceof DesktopHostError) return error
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    const value = error as { code: DesktopHostErrorCode; message: string; retryable?: boolean; outcomeUnknown?: boolean }
    if (typeof value.code === 'string' && typeof value.message === 'string') {
      return new DesktopHostError(value.code, value.message, value.retryable === true, value.outcomeUnknown === true)
    }
  }
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
  if (message.startsWith('Harness 请求超时：')) {
    return new DesktopHostError('timeout', message + '; runtime outcome is unknown.', false, true)
  }
  if (message.startsWith('Harness RPC error (')) {
    return new DesktopHostError('runtime_error', message, false, false)
  }
  if (message === '请先连接 Harness' || message === 'Harness 连接已关闭') {
    return new DesktopHostError('runtime_unavailable', message, true, true)
  }
  // Current SDK errors are often strings, not typed error codes.
  return new DesktopHostError('runtime_error', message, false, true)
}

function requireCapability(capability: DesktopHostCapability) {
  if (!negotiation?.capabilities.includes(capability)) {
    throw new DesktopHostError('unsupported_capability', `Desktop Host capability ${capability} is unavailable.`)
  }
}

interface CallOptions {
  timeoutMs: number
  signal?: AbortSignal
  capability?: DesktopHostCapability
}

function callHost<T>(command: string, args: Record<string, unknown> | undefined, options: CallOptions): Promise<T> {
  if (options.capability) {
    try { requireCapability(options.capability) } catch (error) { return Promise.reject(error) }
  }
  if (options.signal?.aborted) return Promise.reject(new DesktopHostError('cancelled', 'Local request was cancelled.'))
  return new Promise<T>((resolve, reject) => {
    let isSettled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: { ok: true; value: T } | { ok: false; error: unknown }) => {
      if (isSettled) return
      isSettled = true
      if (timer) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      if (result.ok) resolve(result.value)
      else reject(normalizeError(result.error))
    }
    const onAbort = () => finish({ ok: false, error: new DesktopHostError('cancelled', 'Local wait cancelled; Harness operation outcome is unknown.', false, true) })
    options.signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish({ ok: false, error: new DesktopHostError('timeout', 'Desktop Host request timed out; Harness operation outcome is unknown.', false, true) }), options.timeoutMs)
    // Local abort/timeout never means that the SDK run was cancelled.
    void invoke<T>(command, args).then(value => finish({ ok: true, value }), error => finish({ ok: false, error }))
  })
}

export const desktopHost = {
  getStatus: () => callHost<RuntimeStatus>('runtime_status', undefined, { timeoutMs: 5000 }),
  async handshake(signal?: AbortSignal): Promise<DesktopHostHandshake> {
    const epoch = negotiationEpoch
    const result = await callHost<DesktopHostHandshake>('desktop_host_handshake', {
      protocolVersion: DESKTOP_HOST_API_VERSION,
    }, { timeoutMs: 5000, signal })
    if (result.protocolVersion?.major !== DESKTOP_HOST_API_VERSION.major) {
      throw new DesktopHostError('protocol_mismatch', 'Desktop Host major protocol version is incompatible.')
    }
    if (!Array.isArray(result.capabilities)) {
      throw new DesktopHostError('protocol_mismatch', 'Desktop Host did not provide a valid capability list.')
    }
    if (epoch !== negotiationEpoch) throw new DesktopHostError('runtime_unavailable', 'Runtime connection changed during negotiation.')
    updateNegotiation(result)
    return result
  },
  async connect(input: RuntimeConnectInput) {
    clearNegotiation()
    const connected = await callHost<RuntimeStatus>('connect_runtime', {
      nodePath: input.nodePath,
      dshPath: input.dshPath,
      dshHome: input.dshHome || null,
      patchPath: input.harnessPatchPath.trim() || null,
      workspace: input.workspace || null,
      provider: input.provider,
      model: input.model,
    }, { timeoutMs: 30000 })
    await desktopHost.handshake()
    return connected
  },
  async disconnect() {
    try {
      return await callHost<void>('disconnect_runtime', undefined, { timeoutMs: 5000 })
    } finally {
      clearNegotiation()
    }
  },
  query: (sessionId: string, contentBlocks: readonly PromptContentBlock[], signal?: AbortSignal) =>
    callHost<void>('session_query', { sessionId, contentBlocks }, { timeoutMs: 20000, signal, capability: 'sessions.prompt' }),
  waitForCompletion: (sessionId: string, signal?: AbortSignal) =>
    callHost<void>('wait_session', { sessionId }, { timeoutMs: 24 * 60 * 60 * 1000, signal, capability: 'sessions.wait' }),
  resume: (sessionId: string, signal?: AbortSignal) =>
    callHost<void>('resume_session', { sessionId }, { timeoutMs: 20000, signal, capability: 'sessions.resume' }),
  getWorkingDirectory: (sessionId: string, signal?: AbortSignal) =>
    callHost<string>('get_working_directory', { sessionId }, { timeoutMs: 20000, signal, capability: 'workspace.cwd' }),
  setWorkingDirectory: (sessionId: string, path: string, signal?: AbortSignal) =>
    callHost<string>('set_working_directory', { sessionId, path }, { timeoutMs: 20000, signal, capability: 'workspace.cwd' }),
  respondRequest: (id: DesktopHostRequest['id'], result: Record<string, unknown>, capability: 'approvals.respond' | 'questions.respond') =>
    callHost<void>('respond_host_request', { id, result }, { timeoutMs: 10000, capability }),
  onRuntimeStatus: (listener: (status: RuntimeStatus) => void) =>
    listen<RuntimeStatus>('desktop:runtime-status', event => {
      if (event.payload.state !== 'ready') clearNegotiation()
      else void desktopHost.handshake().catch(() => clearNegotiation())
      listener(event.payload)
    }),
  onSessionEvent: (listener: (event: DesktopSessionEvent) => void) =>
    listen<DesktopSessionEvent>('desktop:session-event', event => listener(event.payload)),
  onSessionStatus: (listener: (status: DesktopSessionStatus) => void) =>
    listen<DesktopSessionStatus>('desktop:session-status', event => listener(event.payload)),
  onHostRequest: (listener: (request: DesktopHostRequest) => void) =>
    listen<DesktopHostRequest>('desktop:host-request', event => listener(event.payload)),
  onHostRequestCancelled: (listener: (requestId: string) => void) =>
    listen<{ requestId: string }>('desktop:host-request-cancelled', event => listener(event.payload.requestId)),
}

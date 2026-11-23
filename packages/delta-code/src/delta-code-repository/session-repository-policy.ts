/** Session-scoped, read-only repository associations replayed from DSH tool events.
 * Never treat model arguments as a permission grant or rely on a second database.
 */
export interface RepositoryBinding {
  id: string
  path: string
  addedSeq: number
}
interface PendingBinding {
  callId: string
  action: 'attach' | 'detach'
  id: string
}
export interface SessionRepositoryState {
  bindings: RepositoryBinding[]
  pending: PendingBinding[]
  lastSeq: number
  invalid: boolean
}
export const SESSION_REPOSITORY_EMPTY: SessionRepositoryState = {
  bindings: [], pending: [], lastSeq: -1, invalid: false,
}
export const REPOSITORY_EVENT_MARKER = 'DELTA_CODE_REPOSITORY_EVENT_V1 '
const REPO_ID = /^repo-[0-9a-f]{20}$/
const MAX_REPOSITORIES = 8
const MAX_PENDING = 16
const PATH_OK = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 2 && value.length <= 1024 &&
  !/[\u0000-\u001f\u007f]/u.test(value)

function validBindings(value: unknown): value is RepositoryBinding[] {
  return Array.isArray(value) && value.length <= MAX_REPOSITORIES &&
    value.every(entry => entry && typeof entry === 'object' &&
      REPO_ID.test(entry.id) && PATH_OK(entry.path) &&
      Number.isSafeInteger(entry.addedSeq) && entry.addedSeq >= 0) &&
    new Set(value.map(entry => entry.id)).size === value.length &&
    new Set(value.map(entry => entry.path)).size === value.length
}
function validPending(value: unknown): value is PendingBinding[] {
  return Array.isArray(value) && value.length <= MAX_PENDING &&
    value.every(entry => entry && typeof entry === 'object' &&
      typeof entry.callId === 'string' && entry.callId.length >= 4 && entry.callId.length <= 256 &&
      (entry.action === 'attach' || entry.action === 'detach') &&
      (entry.action === 'attach' || REPO_ID.test(entry.id)) &&
      typeof entry.id === 'string' && entry.id.length <= 80) &&
    new Set(value.map(entry => entry.callId)).size === value.length
}
export function parseSessionRepositoryView(value: unknown): readonly RepositoryBinding[] {
  if (!validBindings(value)) throw new Error('invalid native session repository view')
  return value
}

export function parseSessionRepositoryState(value: unknown): SessionRepositoryState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid native session repository projection')
  }
  const state = value as SessionRepositoryState
  if (!validBindings(state.bindings) || !validPending(state.pending) ||
      !Number.isSafeInteger(state.lastSeq) || state.lastSeq < -1 ||
      typeof state.invalid !== 'boolean') {
    throw new Error('invalid native session repository projection')
  }
  return state
}
function eventRecord(message: unknown): { action: 'attach' | 'detach'; id: string; path: string } | undefined {
  if (!message || typeof message !== 'object') return undefined
  const m = message as { isError?: unknown; content?: unknown; source?: { kind?: unknown } }
  if (m.isError !== false || m.source?.kind !== 'tool' || !Array.isArray(m.content)) return undefined
  const texts = m.content.filter(x => x && typeof x === 'object' &&
    (x as { type?: unknown }).type === 'text').map(x => (x as { text?: unknown }).text)
  if (!texts.every(x => typeof x === 'string')) return undefined
  const markers = texts.flatMap(text => (text as string).split('\n').filter(line =>
    line.startsWith(REPOSITORY_EVENT_MARKER)))
  if (markers.length !== 1 || markers[0]!.length > 1400) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(markers[0]!.slice(REPOSITORY_EVENT_MARKER.length)) } catch { return undefined }
  if (!parsed || typeof parsed !== 'object') return undefined
  const item = parsed as { version?: unknown; action?: unknown; id?: unknown; path?: unknown; readOnly?: unknown }
  if (item.version !== 1 || item.readOnly !== true || !REPO_ID.test(String(item.id)) ||
      !PATH_OK(item.path) || (item.action !== 'attach' && item.action !== 'detach')) return undefined
  return { action: item.action, id: item.id as string, path: item.path }
}
/** Fold only Host-observed code_session_repositories tool calls and successful tool results. */
export function foldSessionRepositoryEvent(
  state: SessionRepositoryState,
  event: { type: string; seq: number; data?: unknown },
): SessionRepositoryState {
  if (event.type === 'delta-code/repository-binding') {
    if (!Number.isSafeInteger(event.seq) || event.seq < 0 || event.seq <= state.lastSeq) {
      return { ...state, invalid: true }
    }
    if (state.invalid) return state
    const data = event.data && typeof event.data === 'object'
      ? event.data as { version?: unknown; action?: unknown; id?: unknown; path?: unknown }
      : {}
    if (data.version !== 1 || (data.action !== 'attach' && data.action !== 'detach') ||
        typeof data.id !== 'string' || !REPO_ID.test(data.id) || !PATH_OK(data.path)) {
      return { ...state, lastSeq: event.seq, invalid: true }
    }
    const base = { ...state, lastSeq: event.seq }
    if (data.action === 'attach') {
      if (state.bindings.length >= MAX_REPOSITORIES ||
          state.bindings.some(binding => binding.id === data.id || binding.path === data.path)) {
        return { ...base, invalid: true }
      }
      return { ...base, bindings: [...state.bindings, {
        id: data.id, path: data.path, addedSeq: event.seq,
      }] }
    }
    const existing = state.bindings.find(binding => binding.id === data.id)
    if (!existing || existing.path !== data.path) return { ...base, invalid: true }
    return { ...base, bindings: state.bindings.filter(binding => binding.id !== data.id) }
  }
  if (event.type !== 'tool/call' && event.type !== 'tool/result') return state
  if (!Number.isSafeInteger(event.seq) || event.seq < 0 || event.seq <= state.lastSeq) {
    return { ...state, invalid: true }
  }
  if (state.invalid) return state
  const base = { ...state, lastSeq: event.seq }
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : {}
  if (event.type === 'tool/call') {
    if (data.name !== 'code_session_repositories') return base
    if (typeof data.callId !== 'string' || data.callId.length < 4 ||
        data.callId.length > 256 || typeof data.arguments !== 'string') return { ...base, invalid: true }
    let args: unknown
    try { args = JSON.parse(data.arguments) } catch { return { ...base, invalid: true } }
    if (!args || typeof args !== 'object') return base
    const item = args as { action?: unknown; id?: unknown }
    if (item.action !== 'attach' && item.action !== 'detach') return base
    if (item.action === 'detach' && (typeof item.id !== 'string' || !REPO_ID.test(item.id))) {
      return { ...base, invalid: true }
    }
    if (state.pending.length >= MAX_PENDING ||
        state.pending.some(p => p.callId === data.callId)) return { ...base, invalid: true }
    return { ...base, pending: [...state.pending, {
      callId: data.callId, action: item.action, id: item.action === 'detach' ? item.id as string : '',
    }] }
  }
  const message = data.message as { toolCallId?: unknown } | undefined
  const callId = message?.toolCallId
  const pending = state.pending.find(x => x.callId === callId)
  if (!pending) return base
  const remaining = state.pending.filter(x => x.callId !== callId)
  const marker = eventRecord(message)
  if (!marker) return { ...base, pending: remaining }
  if (marker.action !== pending.action ||
      (pending.action === 'detach' && marker.id !== pending.id)) {
    return { ...base, pending: remaining, invalid: true }
  }
  if (marker.action === 'detach') {
    return { ...base, pending: remaining,
      bindings: state.bindings.filter(b => b.id !== marker.id) }
  }
  if (state.bindings.some(b => b.id === marker.id && b.path !== marker.path)) {
    return { ...base, pending: remaining, invalid: true }
  }
  if (state.bindings.some(b => b.id === marker.id)) return { ...base, pending: remaining }
  if (state.bindings.length >= MAX_REPOSITORIES ||
      state.bindings.some(b => b.path === marker.path)) {
    return { ...base, pending: remaining, invalid: true }
  }
  return { ...base, pending: remaining,
    bindings: [...state.bindings, { id: marker.id, path: marker.path, addedSeq: event.seq }] }
}
export const MAX_ATTACHED_REPOSITORIES = MAX_REPOSITORIES

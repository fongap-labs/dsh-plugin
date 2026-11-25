/**
 * Delta Suite browser module. It only registers its lazy factory while loading.
 * Layout/session ownership always remains with the official UI plugins.
 */
interface PublicSessionFace {
  readonly sessionId: string
  prompt(content: { type: 'text'; text: string }[], mode: 'queue' | 'steer', signal?: AbortSignal): Promise<{ ok: boolean; error?: { message?: string } }>
  command?(line: string): Promise<{ matched: boolean }>
  getSnapshot?(): { running?: boolean; awaitingFirstTurn?: boolean; lastAgentError?: string | null }
}
interface SessionReference {
  readonly sessionId: string
  readonly binding: { readonly session: PublicSessionFace }
  readonly ready: Promise<unknown>
  release(): void
}
interface AssistantSessionsApi {
  create(options?: { agentPreset?: string; workspaceId?: string }): Promise<string>
  retain(id: string, options: { source: string; signal?: AbortSignal }): SessionReference
  list: { getSnapshot(): { byId?: Record<string, { title?: string; workspaceId?: string; running?: boolean }> } }
}
interface ResourceProviderApi {
  register(provider: {
    protocol: string
    open(address: string, options: { signal: AbortSignal }): AsyncIterable<{ ok: true; value: AssistantResource }>
  }): () => void
}
interface SidebarRightTabsApi {
  register(definition: {
    id: string; kind: string; patterns: readonly string[]; priority?: 'extension' | 'builtin' | 'fallback'
    canOpen?(address: string): boolean; title(address: string): string
  }): () => void
}
interface AssistantResource {
  readonly parentSessionId: string
  readonly assistantSessionId: string
  readonly purpose: 'discussion' | 'optimization'
  readonly reference: SessionReference
  readonly protectionRevision: number
}
interface AssistantWorkflow {
  readonly purpose: 'discussion' | 'optimization'
  readonly parentSessionId: string
  readonly originalDraft?: string
  appliedDraft?: string
  readonly getCurrentDraft?: () => string
  readonly inputActions?: { setDraft(text: string): void; persistDraft(): void }
}
interface AssistantServices {
  sessions: AssistantSessionsApi
  resources: ResourceProviderApi
  sidebarRightTabs: SidebarRightTabsApi
  sidebarRight: SidebarRightApi
  slots: SlotsApi
  effect(callback: () => void | (() => void), label?: string): void
}
interface AssistantSlotProps {
  sessionId: string
  useSession<T>(selector: (state: any) => T): T
  useInput<T>(selector: (state: any) => T): T
  useChat<T>(selector: (state: AssistantChatSnapshot) => T): T
  useConversation?<T>(selector: (state: any) => T): T
  useProjection<T = any>(key: string): T | undefined
  inputActions: {
    setDraft(text: string): void
    persistDraft(): void
  }
  useTabInfo?(): { tab: { contentId: string } }
  useResource?<T>(address: string): { value?: T }
  SessionProvider?(props: { session: SessionReference; children?: unknown }): unknown
  renderSlot?(name: string, props: Record<string, unknown>): unknown
  renderFactorySlot?(name: string, props: Record<string, unknown>, options?: Record<string, unknown>): unknown
  messageId?: string
}


interface Loader {
  load(entry: { id: string; factory(require: (id: string) => unknown): { inject: string[]; apply(ctx: ClientContext): void } }): void
}
interface Window { __ModuleLoader__: Loader }

const CLIENT_HOME_WIN_RE = /\b([A-Za-z]):[\\/]+Users[\\/]+([^\\/\s"'`]+)(?=[\\/\s"'`,;:]|$)/gi
const CLIENT_HOME_POSIX_RE = /(?<![A-Za-z0-9._-])\/(?:Users|home)\/([^/\s"'`,;:]+)(?=[/\s"'`,;:]|$)/g
const CLIENT_PRIVATE_BLOCK_RE = /<private>[\s\S]*?<\/private>/gi
const CLIENT_AUTH_HEADER_RE = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const CLIENT_KNOWN_TOKEN_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g
const CLIENT_SECRET_ASSIGN_RE = /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|session[_-]?token|authorization|cookie)\b(\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;`"']+)/gi
const CLIENT_EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const CLIENT_MOBILE_RE = /(?<![A-Za-z0-9_-])1[3-9]\d{9}(?![A-Za-z0-9_-])/g

function redactPathForUi(input: string): string {
  if (!input) return ''
  return input
    .replace(CLIENT_HOME_WIN_RE, '~')
    .replace(CLIENT_HOME_POSIX_RE, '~')
}

function redactSensitiveText(input: string): string {
  if (!input) return ''
  return redactPathForUi(input)
    .replace(CLIENT_PRIVATE_BLOCK_RE, '[redacted]')
    .replace(CLIENT_AUTH_HEADER_RE, '$1 [redacted]')
    .replace(CLIENT_KNOWN_TOKEN_RE, '[redacted-token]')
    .replace(CLIENT_SECRET_ASSIGN_RE, '$1$2[redacted]')
    .replace(CLIENT_EMAIL_RE, '[email]')
    .replace(CLIENT_MOBILE_RE, '[phone]')
}

// The release builder replaces both markers with data from locale/*.json and src/theme.css.
const DICTIONARIES = '__DELTA_SUITE_LOCALES__' as unknown as Record<Language, DeltaCopy>
const OWNED_CSS = '__DELTA_SUITE_STYLE__'
const FEATURE_ONLY_CSS = '__DELTA_SUITE_FEATURE_STYLE__'
const DELTA_SUITE_OWNER = '@fongap-labs/delta-suite'
// Theme palette is compiled from client-theme-tokens.ts into this single bundle.

// Public Host locale wins; other locales fall back to Suite English.
let currentHostLocale: string | undefined
function language(): Language {
  const navLang = typeof navigator !== 'undefined' ? navigator.language : ''
  const docLang = typeof document !== 'undefined' ? document.documentElement?.lang : ''
  const value = currentHostLocale || docLang || navLang || 'en'
  return /^zh(?:-|$)/i.test(value) ? 'zh' : 'en'
}
const toastEntries = new Set<{ node: HTMLElement; timer: number }>()
const scheduleTimer = (fn: () => void, ms: number): number => {
  if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') return window.setTimeout(fn, ms)
  if (typeof setTimeout === 'function') return setTimeout(fn, ms) as unknown as number
  return 0
}
const cancelTimer = (id: number): void => {
  if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
    window.clearTimeout(id)
    return
  }
  if (typeof clearTimeout === 'function') clearTimeout(id)
}
const createSvgEl = (tag: string, attrs: Record<string, string | number>): Element => {
  const node = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, String(v))
  }
  return node
}
const clearNodeChildren = (node: HTMLElement): void => {
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren()
    return
  }
  if (Array.isArray((node as unknown as { children?: unknown[] }).children)) {
    const list = (node as unknown as { children: Array<{ remove?: () => void }> }).children
    while (list.length > 0) {
      const child = list[list.length - 1]
      if (typeof child?.remove === 'function') child.remove()
      else list.pop()
    }
    return
  }
  while (node.firstChild && typeof node.removeChild === 'function') {
    node.removeChild(node.firstChild)
  }
}
const showDeltaToast = (message: string): void => {
  try {
    if (!document.body) return
    const node = document.createElement('div')
    node.className = 'dtd-toast'
    node.setAttribute('role', 'status')
    node.textContent = message
    document.body.appendChild(node)
    const entry = { node, timer: 0 }
    toastEntries.add(entry)
    try {
      entry.timer = scheduleTimer(() => {
        if (!toastEntries.delete(entry)) return
        try { node.remove() } catch { /* optional presentation */ }
      }, 3000)
      if (!entry.timer) {
        toastEntries.delete(entry)
        try { node.remove() } catch {}
      }
    } catch {
      toastEntries.delete(entry)
      try { node.remove() } catch {}
    }
  } catch { /* Toasts must never prevent native interaction. */ }
}
const clearDeltaToasts = (): void => {
  const entries = [...toastEntries]
  toastEntries.clear()
  for (const entry of entries) {
    try { cancelTimer(entry.timer) } catch {}
    try { entry.node.remove() } catch { /* continue with other owned toasts */ }
  }
}

function createSearchIconSvg(): SVGElement {
  const createNode = (tag: string): Element =>
    typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag)
  const svg = createNode('svg') as SVGElement
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '15')
  svg.setAttribute('height', '15')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', 'dtd-search-icon')
  const circle = createNode('circle')
  circle.setAttribute('cx', '11')
  circle.setAttribute('cy', '11')
  circle.setAttribute('r', '8')
  const line = createNode('line')
  line.setAttribute('x1', '21')
  line.setAttribute('y1', '21')
  line.setAttribute('x2', '16.65')
  line.setAttribute('y2', '16.65')
  svg.appendChild(circle)
  svg.appendChild(line)
  return svg
}

function createQrSvgElement(uri: string): Element {
  const grid = encodeQrMatrix(uri)
  const quiet = 4
  const total = grid.length + quiet * 2
  const svg = createSvgEl('svg', {
    class: 'dtd-totp-qr-svg',
    viewBox: `0 0 ${total} ${total}`,
    width: 176,
    height: 176,
    role: 'img',
    'aria-label': '2FA QR Code',
  })
  svg.appendChild(createSvgEl('rect', { x: 0, y: 0, width: total, height: total, fill: '#ffffff' }))
  const parts: string[] = []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`)
    }
  }
  svg.appendChild(createSvgEl('path', { d: parts.join(''), fill: '#000000' }))
  return svg
}

function createLockSvg(size = 13, isUnlocked = false): Element {
  const svg = createSvgEl('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })
  svg.appendChild(createSvgEl('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2, ry: 2 }))
  svg.appendChild(createSvgEl('path', {
    d: isUnlocked ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4',
  }))
  return svg
}

function canCallHostHttp(): boolean {
  try {
    return typeof fetch === 'function' &&
      typeof window !== 'undefined' &&
      typeof window.location?.href === 'string' &&
      /^(?:https?|dsh-app):/i.test(window.location.href)
  } catch {
    return false
  }
}

interface ClientFeatureManager {
  getSnapshot(): ClientFeatureSnapshot
  readSearchProtection(): SearchContentProtection
  getContentProtectionRevision(): number
  subscribeContentProtection(listener: () => void): () => void
  /** Public Session catalog change notifications for selected hover metadata. */
  subscribeSessionCatalog(listener: () => void): () => void
  subscribe(listener: () => void): () => void
  ensureLoaded(): void
  getWorkspaces(): readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
  setWorkspacesApi(api: WorkspacesApi | undefined, readNative?: () => WorkspaceSnapshot): void
  setSessionsApi(api: SearchSessionsApi | undefined): void
  setNavigationApi(api: SearchNavigationApi | undefined): void
  setActiveSessionId(id: string | undefined): void
  getActiveSessionId(): string | undefined
  /** Selected public hover visibility and UTC time: null denies identity, 0 omits time. */
  readSessionHoverSelection(sessionId: string): number | null
  /** Sanitized public Host catalog timestamp; never returns paths or private records. */
  readSessionUpdateTime(sessionId: string): number | undefined
  isLocked(sessionId: string | undefined): boolean
  isProtectedView(sessionId: string | undefined): boolean
  isDeleted(sessionId: string | undefined): boolean
  isWorkspaceLocked(wsIdOrPath: string | undefined): boolean
  isWorkspaceProtected(wsIdOrPath: string | undefined): boolean
  isSessionInLockedWorkspace(sessionId: string | undefined): boolean
  getWorkspaceCount(): number
  hasSessionsApi(): boolean
  getUngroupedSessionIds(isIncludingArchived?: boolean): string[]
  refreshState(): Promise<void>
  beginTotpSetup(): Promise<{ ok: boolean; setupToken?: string; secret?: string; otpauthUri?: string; error?: string }>
  confirmTotpSetup(sessionId: string, setupToken: string, code: string): Promise<{ ok: boolean; error?: string }>
  confirmTotpSetupWorkspace(workspaceId: string, setupToken: string, code: string): Promise<{ ok: boolean; error?: string }>
  lockSession(sessionId: string, newPin?: string): Promise<{ ok: boolean; error?: string }>
  lockWorkspace(workspaceId: string): Promise<{ ok: boolean; error?: string }>
  verifyOrUnlockSession(sessionId: string, pin: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }>
  verifyOrUnlockWorkspace(workspaceId: string, pin: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }>
  clearPin(pin: string): Promise<{ ok: boolean; error?: string }>
  moveSession(sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }>
  deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }>
  deleteUngroupedSessions(sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }>
  closeDialog(): void
  openSetPinDialog(sessionId: string, title?: string): void
  openSetPinWorkspaceDialog(workspaceId: string, title?: string): void
  openUnlockPinDialog(sessionId: string): void
  openUnlockWorkspaceDialog(workspaceId: string): void
  openClearPinDialog(): void
  openMoveDialog(sessionId: string, title?: string): void
  openDeleteDialog(sessionId: string, title?: string): void
  openDeleteUngroupedDialog(): void
  syncLockShieldOverlay(container: HTMLElement | null): void
  onDataMutate(listener: () => void): () => void
  triggerDataRefresh(): void
  resetSessionOverlays(): void
}

// Observe the Host's confirmed mainView ownership; a navigation request is not
// evidence that its target became the active Session. Ambiguous or unavailable
// snapshots must not replace the last known selection used by privacy guards.
function readConfirmedMainSessionId(list: SearchSessionsApi['list']): string | undefined {
  try {
    const rows = Object.values(list.getSnapshot().byId)
    const mainRows = rows.filter(row =>
      ((row as { retainedBy?: { mainView?: number } }).retainedBy?.mainView ?? 0) > 0)
    return mainRows.length === 1 && typeof mainRows[0].id === 'string' && mainRows[0].id
      ? mainRows[0].id : undefined
  } catch { return undefined }
}

function observeConfirmedMainSession(list: SearchSessionsApi['list'], onConfirmed: (id: string) => void): () => void {
  let isDisposed = false
  const sync = (): void => {
    if (isDisposed) return
    const id = readConfirmedMainSessionId(list)
    if (id !== undefined) onConfirmed(id)
  }
  let unsubscribe: (() => void) | undefined
  try { unsubscribe = list.subscribe?.(sync) } catch { /* Older Host: keep the existing UI compatibility path. */ }
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    unsubscribe?.()
  }
}

// Scoped projection for Delta-owned views; never replace Host list methods.
function createClientFeatureManager(): ClientFeatureManager {
  let state: ClientFeatureSnapshot = Object.freeze({
    isSearchProtectionReady: false,
    hasPin: false,
    lockMode: 'none',
    lockedSessionIds: Object.freeze([]),
    lockedWorkspaceIds: Object.freeze([]),
    movedSessions: Object.freeze({}),
    deletedSessionIds: Object.freeze([]),
    tempUnlockedIds: Object.freeze([]),
    tempUnlockedWorkspaceIds: Object.freeze([]),
    revision: 0,
  })
  const listeners = new Set<() => void>()
  let workspacesApi: WorkspacesApi | undefined
  let readNativeWorkspaceSnapshot: (() => WorkspaceSnapshot) | undefined
  const projectDeltaWorkspace = createWorkspaceCompatibilityProjection()
  const readDeltaWorkspaceSnapshot = (): WorkspaceSnapshot | undefined => {
    try {
      const base = readNativeWorkspaceSnapshot?.()
      return base ? projectDeltaWorkspace(base, state) : undefined
    } catch { return undefined }
  }
  let sessionsApi: SearchSessionsApi | undefined
  let navigationApi: SearchNavigationApi | undefined
  let hasSyncedStateFromHost = false
  let hostStateConfirmation = 0
  let refreshInFlight: Promise<void> | undefined
  let lastRefreshAttemptAt = 0
  let dialogBackdrop: HTMLElement | undefined
  let shieldEl: HTMLElement | undefined
  let shieldSessionId: string | undefined
  const workspaceNotifyListeners = new Set<() => void>()
  const contentProtectionListeners = new Set<() => void>()
  const sessionCatalogListeners = new Set<() => void>()
  let stopNativeSessionCatalog: (() => void) | undefined
  let sessionCatalogBinding = 0
  const publishSessionCatalog = (): void => {
    for (const listener of [...sessionCatalogListeners]) {
      try { listener() } catch { /* another consumer must not block catalog updates */ }
    }
  }
  let contentProtectionRevision = 0
  let stopNativeContentMembership: (() => void) | undefined
  let workspaceMembershipBinding = 0
  const invalidateContentProtection = (): void => {
    contentProtectionRevision += 1
    for (const listener of [...contentProtectionListeners]) {
      try { listener() } catch {}
    }
  }

  const publish = (patch: Partial<Omit<ClientFeatureSnapshot, 'revision'>>): void => {
    const previous = state
    state = Object.freeze({ ...state, ...patch, revision: state.revision + 1 })
    if (previous.isSearchProtectionReady !== state.isSearchProtectionReady ||
        previous.lockedSessionIds !== state.lockedSessionIds ||
        previous.lockedWorkspaceIds !== state.lockedWorkspaceIds ||
        previous.deletedSessionIds !== state.deletedSessionIds ||
        previous.movedSessions !== state.movedSessions) invalidateContentProtection()
    listeners.forEach(fn => {
      try { fn() } catch {}
    })
  }

  const notifyDataApis = (): void => {
    for (const fn of workspaceNotifyListeners) {
      try { fn() } catch {}
    }
  }

  // Native archive ownership is exclusively enforced by Host Session Ops.
  // The Client must not retry archive/unarchive via Workspace services: it
  // lacks durable attribution and could undo a user's independent archive.

  const applyHostStatePayload = (payload: unknown): void => {
    // Never accept a partial response as evidence that durable locks vanished.
    const patch = projectConfirmedClientSessionState(state, payload)
    if (!patch) {
      revokeHostConfirmation()
      return
    }
    // Even an identical confirmed response supersedes an older in-flight read.
    hostStateConfirmation += 1
    hasSyncedStateFromHost = true
    if ((Object.keys(patch) as (keyof typeof patch)[]).some(key => !Object.is(state[key], patch[key]))) {
      publish(patch)
    }
    // Keep explicit Host refresh notifications independent of UI state changes.
    notifyDataApis()
  }

  const postHostJson = async (path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> => {
    if (!canCallHostHttp()) return { ok: false, status: 0, data: null }
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      return { ok: res.ok, status: res.status, data }
    } catch {
      return { ok: false, status: 0, data: null }
    }
  }

  // Preserve the last confirmed lock membership while revoking authorization.
  // Reset the sync flag so ensureLoaded may retry after transient Host failures.
  const revokeHostConfirmation = (): void => {
    hostStateConfirmation += 1
    hasSyncedStateFromHost = false
    const patch = revokeClientSessionViewGrants(state)
    if (patch) publish(patch)
  }

  const refreshState = async (): Promise<void> => {
    if (!canCallHostHttp()) { revokeHostConfirmation(); return }
    if (refreshInFlight) return refreshInFlight
    lastRefreshAttemptAt = Date.now()
    const confirmation = hostStateConfirmation
    const isCurrent = (): boolean => confirmation === hostStateConfirmation
    refreshInFlight = (async () => {
      try {
        const response = await fetch('/api/delta-suite/state', { credentials: 'same-origin' })
        if (!isCurrent()) return
        if (!response.ok) { revokeHostConfirmation(); return }
        const body = await response.json().catch(() => null) as { state?: unknown } | null
        if (!isCurrent()) return
        if (isConfirmedLockState(body?.state)) {
          applyHostStatePayload(body!.state)
        } else revokeHostConfirmation()
      } catch { if (isCurrent()) revokeHostConfirmation() }
    })().finally(() => { refreshInFlight = undefined })
    return refreshInFlight
  }

  const ensureLoaded = (): void => {
    if (hasSyncedStateFromHost || refreshInFlight) return
    if (Date.now() - lastRefreshAttemptAt < 1200) return
    void refreshState()
  }

  // Serialize complete state operations, including validation and publication.
  // The queue does not grant authority or retry failed operations.
  let hostOperationTail: Promise<void> = Promise.resolve()
  const serializeHostOperation = <Args extends unknown[], Result>(
    operation: (...args: Args) => Promise<Result>,
  ): ((...args: Args) => Promise<Result>) => (...args) => {
    const result = hostOperationTail.then(() => operation(...args))
    hostOperationTail = result.then(() => {}, () => {})
    return result
  }

  const beginTotpSetup = serializeHostOperation(async (): Promise<{
    ok: boolean
    setupToken?: string
    secret?: string
    otpauthUri?: string
    error?: string
  }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', { action: 'setup-begin' })
    if (!res.ok || res.data?.ok !== true || typeof res.data.setupToken !== 'string' || !res.data.setupToken ||
        typeof res.data.secret !== 'string' || !res.data.secret ||
        typeof res.data.otpauthUri !== 'string' || !res.data.otpauthUri) {
      return { ok: false, error: res.data?.error ?? 'TOTP_INIT_FAILED' }
    }
    return {
      ok: true,
      setupToken: String(res.data.setupToken ?? ''),
      secret: String(res.data.secret),
      otpauthUri: String(res.data.otpauthUri),
    }
  })

  const confirmTotpSetup = serializeHostOperation(async (
    sessionId: string,
    setupToken: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'setup-confirm',
      sessionId,
      setupToken,
      code: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    notifyDataApis()
    return { ok: true }
  })

  const confirmTotpSetupWorkspace = serializeHostOperation(async (
    workspaceId: string,
    setupToken: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'setup-confirm',
      workspaceId,
      setupToken,
      code: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedWorkspaceIds.includes(workspaceId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedWorkspaceIds: Object.freeze((state.tempUnlockedWorkspaceIds ?? []).filter(id => id !== workspaceId)),
    })
    notifyDataApis()
    return { ok: true }
  })

  const lockSession = serializeHostOperation(async (sessionId: string, _newPin?: string): Promise<{ ok: boolean; error?: string }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'lock',
      sessionId,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'LOCK_FAILED' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    notifyDataApis()
    return { ok: true }
  })

  const lockWorkspace = serializeHostOperation(async (workspaceId: string): Promise<{ ok: boolean; error?: string }> => {
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'lock',
      workspaceId,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'LOCK_FAILED' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || !confirmedState.lockedWorkspaceIds.includes(workspaceId)) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    publish({
      tempUnlockedWorkspaceIds: Object.freeze((state.tempUnlockedWorkspaceIds ?? []).filter(id => id !== workspaceId)),
    })
    notifyDataApis()
    return { ok: true }
  })


  const verifyOrUnlockSession = serializeHostOperation(async (sessionId: string, code: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: isPermanent ? 'unlock' : 'verify',
      sessionId,
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || res.data.verified !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || confirmedState.lockedSessionIds.includes(sessionId) === isPermanent) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    if (isPermanent) {
      notifyDataApis()
    } else if (!state.tempUnlockedIds.includes(sessionId)) {
      publish({ tempUnlockedIds: Object.freeze([...state.tempUnlockedIds, sessionId]) })
    }
    return { ok: true }
  })

  const verifyOrUnlockWorkspace = serializeHostOperation(async (workspaceId: string, code: string, isPermanent: boolean): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: isPermanent ? 'unlock' : 'verify',
      workspaceId,
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    if (res.data?.ok !== true || res.data.verified !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== true || confirmedState.lockedWorkspaceIds.includes(workspaceId) === isPermanent) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    if (isPermanent) {
      notifyDataApis()
    } else if (!(state.tempUnlockedWorkspaceIds ?? []).includes(workspaceId)) {
      publish({ tempUnlockedWorkspaceIds: Object.freeze([...(state.tempUnlockedWorkspaceIds ?? []), workspaceId]) })
    }
    return { ok: true }
  })

  const clearPin = serializeHostOperation(async (code: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'LOCK_UNAVAILABLE' }

    const res = await postHostJson('/api/delta-suite/session-lock', {
      action: 'unbind-2fa',
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const confirmedState = res.data?.state
    const reported = res.data?.unarchivedIds
    const pending = res.data?.pendingUnarchiveIds ?? []
    if (res.data?.ok !== true || !isConfirmedLockState(confirmedState) ||
        confirmedState.hasPin !== false || confirmedState.lockMode !== 'none' ||
        confirmedState.lockedSessionIds.length !== 0 || confirmedState.lockedWorkspaceIds.length !== 0 ||
        !Array.isArray(reported) || reported.some(id => typeof id !== 'string') ||
        !Array.isArray(pending) || pending.some(id => typeof id !== 'string')) {
      return { ok: false, error: 'LOCK_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    // Host has already handled each owned native archive and reports the
    // restored/pending outcome. Never retry it through Client Workspace APIs.
    notifyDataApis()
    return { ok: true }
  })

  const findWorkspaceCwdForSession = (sessionId: string): string | undefined => {
    const wsItems = readNativeWorkspaceSnapshot?.().items ?? []
    const ws = wsItems.find(item => item.sessionIds?.includes(sessionId))
    if (ws?.path) return ws.path
    const sess = sessionsApi?.list?.getSnapshot?.()?.byId?.[sessionId] as { cwd?: string } | undefined
    return typeof sess?.cwd === 'string' && sess.cwd.trim() ? sess.cwd : undefined
  }

  const moveSession = serializeHostOperation(async (sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }> => {
    if (state.deletedSessionIds.includes(sessionId)) return { ok: false, error: 'SESSION_DELETED' }
    if (!canCallHostHttp()) return { ok: false, error: 'MOVE_UNAVAILABLE' }
    let targetWs: WorkspaceSnapshot['items'][number] | undefined
    let sourceCwd: string | undefined
    try {
      if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId) ||
          isWorkspaceLocked(targetWorkspaceId)) return { ok: false, error: 'SESSION_LOCKED' }
      targetWs = readNativeWorkspaceSnapshot?.().items.find(item => item.workspaceId === targetWorkspaceId)
      sourceCwd = findWorkspaceCwdForSession(sessionId)
    } catch { return { ok: false, error: 'MOVE_UNAVAILABLE' } }
    if (!targetWs?.path) return { ok: false, error: 'MOVE_UNAVAILABLE' }
    const res = await postHostJson('/api/delta-suite/session-move', {
      sessionId,
      targetWorkspaceId,
      targetPath: targetWs.path,
      ...(sourceCwd ? { sourceCwd } : {}),
    })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'MOVE_FAILED' }
    const confirmedState = res.data?.state
    if (!isConfirmedLockState(confirmedState) || confirmedState.movedSessions[sessionId] !== targetWorkspaceId) {
      return { ok: false, error: 'MOVE_UNCONFIRMED' }
    }
    applyHostStatePayload(confirmedState)
    return { ok: true }
  })

  const refreshSessionsAfterDelete = async (): Promise<void> => {
    // The public refresh operation publishes a Host-owned catalog. Never patch its store.
    try { await sessionsApi?.refresh?.() } catch {
      // A confirmed tombstone remains effective inside Delta if the catalog is stale.
    }
  }

  const deleteSession = serializeHostOperation(async (sessionId: string): Promise<{ ok: boolean; error?: string }> => {
    if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId)) {
      return { ok: false, error: 'SESSION_LOCKED' }
    }
    if (!canCallHostHttp()) return { ok: false, error: 'DELETE_UNAVAILABLE' }
    const sourceCwd = findWorkspaceCwdForSession(sessionId)
    const res = await postHostJson('/api/delta-suite/session-delete', {
      sessionId,
      ...(sourceCwd ? { sourceCwd } : {}),
    })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
    const confirmedState = res.data?.state
    if (!isConfirmedLockState(confirmedState) || !confirmedState.deletedSessionIds.includes(sessionId)) {
      return { ok: false, error: 'DELETE_UNCONFIRMED' }
    }
    // Apply only a Host-confirmed durable deletion, never a speculative local tombstone.
    applyHostStatePayload(confirmedState)
    if (state.activeSessionId === sessionId) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    await refreshSessionsAfterDelete()
    return { ok: true }
  })

  const getUngroupedSessionIds = (isIncludingArchived = false): string[] => {
    const wsSnap = readNativeWorkspaceSnapshot?.()
    const sessSnap = sessionsApi?.list?.getSnapshot?.()
    if (!sessSnap?.byId) return []
    const accounted = new Set<string>()
    for (const ws of wsSnap?.items ?? []) {
      for (const sid of ws.sessionIds ?? []) accounted.add(sid)
    }
    for (const sid of Object.keys(state.movedSessions)) accounted.add(sid)
    const archived = new Set(wsSnap?.archivedSessionIds ?? [])
    const deleted = new Set(state.deletedSessionIds)
    const orderIds = Array.isArray(sessSnap.ids) && sessSnap.ids.length > 0 ? sessSnap.ids : Object.keys(sessSnap.byId)
    const out: string[] = []
    for (const sid of orderIds) {
      const rec = sessSnap.byId[sid] as { blank?: boolean } | undefined
      if (!rec || rec.blank || deleted.has(sid) || accounted.has(sid)) continue
      if (!isIncludingArchived && archived.has(sid)) continue
      out.push(sid)
    }
    return out
  }

  const deleteUngroupedSessions = serializeHostOperation(async (sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }> => {
    const targets = [...new Set(sessionIds.filter(Boolean))]
    if (targets.length === 0) return { ok: true, deletedIds: [] }
    const eligible = targets.filter(id => !state.lockedSessionIds.includes(id) && !isSessionInLockedWorkspace(id))
    if (eligible.length === 0) return { ok: false, error: 'SESSION_LOCKED' }
    if (!canCallHostHttp()) return { ok: false, error: 'DELETE_UNAVAILABLE' }
    const cwds: Record<string, string> = {}
    for (const sid of eligible) {
      const cwd = findWorkspaceCwdForSession(sid)
      if (cwd) cwds[sid] = cwd
    }
    // Only eligible IDs may reach the existing Host deletion endpoint.
    const res = await postHostJson('/api/delta-suite/session-delete-ungrouped', { sessionIds: eligible, cwds })
    if (!res.ok || res.data?.ok !== true) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
    const confirmedState = res.data?.state
    const reported = res.data?.deletedIds
    if (!Array.isArray(reported) || !isConfirmedLockState(confirmedState) ||
        reported.some(id => typeof id !== 'string' || !eligible.includes(id) || !confirmedState.deletedSessionIds.includes(id))) {
      return { ok: false, error: 'DELETE_UNCONFIRMED' }
    }
    const deletedIds = [...new Set<string>(reported)]
    if (deletedIds.length === 0) return { ok: false, error: 'DELETE_UNCONFIRMED' }
    applyHostStatePayload(confirmedState)
    if (state.activeSessionId && deletedIds.includes(state.activeSessionId)) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    await refreshSessionsAfterDelete()
    return deletedIds.length === targets.length
      ? { ok: true, deletedIds }
      : { ok: false, error: 'PARTIAL_DELETE', deletedIds }
  })

  const closeDialog = (): void => {
    dialogBackdrop?.remove()
    dialogBackdrop = undefined
  }

  const mountModal = (buildCard: (card: HTMLElement) => void): void => {
    closeDialog()
    if (typeof document?.body?.appendChild !== 'function') return
    const backdrop = document.createElement('div')
    backdrop.className = 'dtd-dialog-backdrop'
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) closeDialog()
    })
    backdrop.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault?.(); closeDialog() }
    })
    const card = document.createElement('div')
    card.className = 'dtd-dialog-card'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dtd-dialog-close-btn'
    closeBtn.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.close ?? 'Close')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', closeDialog)
    card.appendChild(closeBtn)
    buildCard(card)
    backdrop.appendChild(card)
    document.body.appendChild(backdrop)
    dialogBackdrop = backdrop
  }

  const createCodeInputElement = (placeholder: string, isLegacyPin = false): HTMLInputElement => {
    const inp = document.createElement('input')
    if (isLegacyPin) {
      inp.type = 'password'
      inp.className = 'dtd-dialog-input'
      inp.autocomplete = 'current-password'
    } else {
      inp.type = 'text'
      inp.className = 'dtd-dialog-input dtd-totp-code-input'
      inp.inputMode = 'numeric'
      inp.pattern = '[0-9]*'
      inp.maxLength = 6
      inp.autocomplete = 'one-time-code'
      inp.addEventListener('input', () => {
        const cleaned = inp.value.replace(/\D+/g, '').slice(0, 6)
        if (inp.value !== cleaned) inp.value = cleaned
      })
    }
    inp.placeholder = placeholder
    return inp
  }

  const copySecretText = async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {}
    try {
      if (typeof document !== 'undefined' && document.body && typeof document.execCommand === 'function') {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.setProperty('position', 'fixed')
        ta.style.setProperty('opacity', '0')
        document.body.appendChild(ta)
        ta.select?.()
        const ok = document.execCommand('copy')
        ta.remove()
        return Boolean(ok)
      }
    } catch {}
    return false
  }

  const openSetPinGenericDialog = (targetType: 'session' | 'workspace', targetId: string, titleText?: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    mountModal(card => {
      const isWs = targetType === 'workspace'
      const h = document.createElement('h3')
      h.textContent = titleText || ((isWs && copy.workspaceMenu?.setPinTitle) ? copy.workspaceMenu.setPinTitle : copy.sessionMenu.setPinTitle)
      const desc = document.createElement('p')
      desc.textContent = (isWs && copy.workspaceMenu?.setPinDescription) ? copy.workspaceMenu.setPinDescription : copy.sessionMenu.setPinDescription
      const setupBox = document.createElement('div'); setupBox.className = 'dtd-totp-setup-box'
      const loadingMsg = document.createElement('p'); loadingMsg.textContent = copy.sessionMenu.totpLoading
      setupBox.appendChild(loadingMsg)
      const codeInput = createCodeInputElement(copy.sessionMenu.pinPlaceholder, false)
      codeInput.disabled = true
      const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const okBtn = document.createElement('button'); okBtn.type = 'button'; okBtn.className = 'dtd-btn-primary'
      okBtn.textContent = copy.ui.confirm
      okBtn.disabled = true

      let activeSetupToken = ''
      const submit = () => {
        if (!activeSetupToken) { err.textContent = copy.sessionMenu.pinMismatch; err.hidden = false; return }
        const code = codeInput.value.trim()
        if (!/^\d{6}$/.test(code)) { err.textContent = copy.sessionMenu.pinTooShort; err.hidden = false; return }
        okBtn.disabled = true
        const confirmPromise = isWs
          ? confirmTotpSetupWorkspace(targetId, activeSetupToken, code)
          : confirmTotpSetup(targetId, activeSetupToken, code)
        void confirmPromise.then(res => {
          okBtn.disabled = false
          if (!res.ok) {
            err.textContent = res.error === 'SETUP_EXPIRED' ? copy.sessionMenu.pinMismatch : copy.sessionMenu.wrongPin
            err.hidden = false
            return
          }
          closeDialog()
          showDeltaToast(isWs ? (copy.workspaceMenu?.lockedToast ?? copy.sessionMenu.lockedToast) : copy.sessionMenu.lockedToast)
        })
      }
      okBtn.addEventListener('click', submit)
      codeInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit() })
      actions.append(cancelBtn, okBtn)
      card.append(h, desc, setupBox, codeInput, err, actions)

      void beginTotpSetup().then(initRes => {
        setupBox.replaceChildren()
        if (!initRes.ok || !initRes.secret || !initRes.otpauthUri) {
          err.textContent = copy.sessionMenu.totpInitFailed
          err.hidden = false
          return
        }
        activeSetupToken = initRes.setupToken ?? ''
        const qrWrap = document.createElement('div'); qrWrap.className = 'dtd-totp-qr-wrap'
        try {
          qrWrap.appendChild(createQrSvgElement(initRes.otpauthUri))
          setupBox.appendChild(qrWrap)
        } catch {}

        const secretRow = document.createElement('div'); secretRow.className = 'dtd-totp-secret-row'
        const secretLbl = document.createElement('span'); secretLbl.className = 'dtd-totp-secret-label'
        secretLbl.textContent = copy.sessionMenu.pinConfirmLabel
        const secretCode = document.createElement('code'); secretCode.className = 'dtd-totp-secret-code'
        secretCode.textContent = initRes.secret
        const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'dtd-totp-copy-btn'
        copyBtn.textContent = copy.sessionMenu.copySecret
        copyBtn.addEventListener('click', () => {
          void copySecretText(initRes.secret!).then(ok => {
            showDeltaToast(ok ? copy.ui.copied : copy.ui.copyFailed)
          })
        })
        secretRow.append(secretLbl, secretCode, copyBtn)
        setupBox.appendChild(secretRow)
        codeInput.disabled = false
        okBtn.disabled = false
        codeInput.focus?.()
      })
    })
  }

  const openSetPinDialog = (sessionId: string, title?: string): void => {
    openSetPinGenericDialog('session', sessionId, title)
  }

  const openSetPinWorkspaceDialog = (workspaceId: string, title?: string): void => {
    openSetPinGenericDialog('workspace', workspaceId, title)
  }

  const openSinglePinDialog = (
    titleText: string,
    descText: string,
    confirmText: string,
    isDangerButton: boolean,
    onVerify: (pin: string) => Promise<{ ok: boolean; error?: string }>,
    successToast: string,
  ): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const isLegacyPin = state.lockMode === 'pin'
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = titleText
      const desc = document.createElement('p'); desc.textContent = descText
      const p1 = createCodeInputElement(copy.sessionMenu.pinPlaceholder, isLegacyPin)
      const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const okBtn = document.createElement('button'); okBtn.type = 'button'
      okBtn.className = isDangerButton ? 'dtd-btn-danger' : 'dtd-btn-primary'
      okBtn.textContent = confirmText
      const submit = () => {
        const code = p1.value.trim()
        if (!isLegacyPin && !/^\d{6}$/.test(code)) {
          err.textContent = copy.sessionMenu.pinTooShort
          err.hidden = false
          return
        }
        okBtn.disabled = true
        void onVerify(code).then(res => {
          okBtn.disabled = false
          if (!res.ok) { err.textContent = copy.sessionMenu.wrongPin; err.hidden = false; return }
          closeDialog()
          showDeltaToast(successToast)
        })
      }
      okBtn.addEventListener('click', submit)
      p1.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submit() })
      actions.append(cancelBtn, okBtn)
      card.append(h, desc, p1, err, actions)
      p1.focus?.()
    })
  }

  const openClearPinDialog = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.sessionMenu.clearPinTitle,
      copy.sessionMenu.clearPinDesc,
      copy.ui.confirm,
      true,
      pin => clearPin(pin),
      copy.sessionMenu.pinClearedToast,
    )
  }

  const openUnlockPinDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.sessionMenu.unlockSession,
      copy.sessionMenu.lockedShieldDesc,
      copy.sessionMenu.unlockPermanent,
      false,
      pin => verifyOrUnlockSession(sessionId, pin, true),
      copy.sessionMenu.unlockedToast,
    )
  }

  const openUnlockWorkspaceDialog = (workspaceId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    openSinglePinDialog(
      copy.workspaceMenu?.unlockWorkspace ?? copy.sessionMenu.unlockSession,
      copy.workspaceMenu?.lockedShieldDesc ?? copy.sessionMenu.lockedShieldDesc,
      copy.workspaceMenu?.unlockPermanent ?? copy.sessionMenu.unlockPermanent,
      false,
      pin => verifyOrUnlockWorkspace(workspaceId, pin, true),
      copy.workspaceMenu?.unlockedToast ?? copy.sessionMenu.unlockedToast,
    )
  }

  const openMoveDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    if (state.lockedSessionIds.includes(sessionId)) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    const items = readDeltaWorkspaceSnapshot()?.items ?? []
    const currentWsId = state.movedSessions[sessionId] ?? items.find(w => w.sessionIds?.includes(sessionId))?.workspaceId
    const candidates = items.filter(w => w.workspaceId !== currentWsId)
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.moveTitle
      const desc = document.createElement('p'); desc.textContent = copy.sessionMenu.moveDescription
      const list = document.createElement('div'); list.className = 'dtd-dialog-list'
      if (candidates.length === 0) {
        const empty = document.createElement('p'); empty.textContent = copy.sessionMenu.moveEmpty
        list.appendChild(empty)
      } else {
        for (const ws of candidates) {
          const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dtd-dialog-ws-btn'
          const strong = document.createElement('strong'); strong.textContent = ws.title || redactPathForUi(ws.path)
          const sub = document.createElement('span'); sub.textContent = redactPathForUi(ws.path)
          btn.append(strong, sub)
          btn.addEventListener('click', () => {
            btn.disabled = true
            void moveSession(sessionId, ws.workspaceId).then(res => {
              btn.disabled = false
              if (!res.ok) {
                showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : copy.ui.unavailable)
                return
              }
              closeDialog()
              showDeltaToast(copy.sessionMenu.movedToast.replace('{workspace}', ws.title || ws.workspaceId))
            })
          })
          list.appendChild(btn)
        }
      }
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      actions.appendChild(cancelBtn)
      card.append(h, desc, list, actions)
    })
  }

  const openDeleteDialog = (sessionId: string, title?: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    if (state.lockedSessionIds.includes(sessionId) || isSessionInLockedWorkspace(sessionId)) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    const label = title?.trim() || sessionsApi?.list?.getSnapshot?.()?.byId?.[sessionId]?.title?.trim() || sessionId
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.deleteTitle
      const desc = document.createElement('p')
      desc.textContent = copy.sessionMenu.deleteDescription.replace('{title}', redactSensitiveText(label))
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'dtd-btn-danger'
      delBtn.textContent = copy.ui.delete
      delBtn.addEventListener('click', () => {
        delBtn.disabled = true
        void deleteSession(sessionId).then(res => {
          delBtn.disabled = false
          if (!res.ok) {
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : (res.error ? `\u5220\u9664\u5931\u8d25: ${res.error}` : copy.ui.unavailable))
            return
          }
          closeDialog()
          showDeltaToast(copy.sessionMenu.deletedToast)
        })
      })
      actions.append(cancelBtn, delBtn)
      card.append(h, desc, actions)
    })
  }

  const openDeleteUngroupedDialog = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const allIds = getUngroupedSessionIds(true)
    const lockedCount = allIds.filter(id => state.lockedSessionIds.includes(id) || isSessionInLockedWorkspace(id)).length
    const unlockedIds = allIds.filter(id => !state.lockedSessionIds.includes(id) && !isSessionInLockedWorkspace(id))
    if (allIds.length > 0 && unlockedIds.length === 0) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.deleteUngroupedTitle
      const desc = document.createElement('p')
      desc.textContent = copy.sessionMenu.deleteUngroupedDescription.replace('{count}', String(unlockedIds.length))
      card.append(h, desc)
      if (lockedCount > 0) {
        const warn = document.createElement('p')
        warn.className = 'dtd-dialog-error'
        warn.textContent = copy.sessionMenu.deleteUngroupedLockedWarning.replace('{locked}', String(lockedCount))
        card.appendChild(warn)
      }
      const actions = document.createElement('div'); actions.className = 'dtd-dialog-actions'
      const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary'
      cancelBtn.textContent = copy.ui.cancel; cancelBtn.addEventListener('click', closeDialog)
      const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.className = 'dtd-btn-danger'
      delBtn.textContent = copy.ui.delete
      delBtn.addEventListener('click', () => {
        delBtn.disabled = true
        void deleteUngroupedSessions(unlockedIds).then(res => {
          delBtn.disabled = false
          if (!res.ok) {
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : (res.error ? `\u5220\u9664\u5931\u8d25: ${res.error}` : copy.ui.unavailable))
            return
          }
          closeDialog()
          showDeltaToast(copy.sessionMenu.deletedUngroupedToast)
        })
      })
      actions.append(cancelBtn, delBtn)
      card.appendChild(actions)
    })
  }

  const isWorkspaceLocked = (wsIdOrPath: string | undefined): boolean => {
    if (!wsIdOrPath) return false
    const list = state.lockedWorkspaceIds ?? []
    if (list.includes(wsIdOrPath)) return true
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    for (const ws of wsList) {
      if (ws.workspaceId === wsIdOrPath || ws.path === wsIdOrPath) {
        if (list.includes(ws.workspaceId) || list.includes(ws.path)) return true
      }
    }
    return false
  }

  const isWorkspaceProtected = (wsIdOrPath: string | undefined): boolean => {
    if (!wsIdOrPath || !isWorkspaceLocked(wsIdOrPath)) return false
    const tempUnlocked = state.tempUnlockedWorkspaceIds ?? []
    if (tempUnlocked.includes(wsIdOrPath)) return false
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    for (const ws of wsList) {
      if (ws.workspaceId === wsIdOrPath || ws.path === wsIdOrPath) {
        if (tempUnlocked.includes(ws.workspaceId) || tempUnlocked.includes(ws.path)) return false
      }
    }
    return true
  }

  const isSessionInLockedWorkspace = (sessionId: string | undefined): boolean => {
    if (!sessionId) return false
    const wsList = readNativeWorkspaceSnapshot?.().items ?? []
    const mappedWorkspace = state.movedSessions[sessionId]
    if (mappedWorkspace && isWorkspaceProtected(mappedWorkspace)) return true
    for (const ws of wsList) {
      if (ws.sessionIds?.includes(sessionId)) {
        if (isWorkspaceProtected(ws.workspaceId) || isWorkspaceProtected(ws.path)) {
          return true
        }
      }
    }
    try {
      const sSnap = sessionsApi?.list?.getSnapshot?.()
      const wsId = sSnap?.byId?.[sessionId]?.workspaceId
      if (wsId && isWorkspaceProtected(wsId)) return true
    } catch {}
    return false
  }

  const syncLockShieldOverlay = (centerCol: HTMLElement | null): void => {
    const activeId = state.activeSessionId
    const isDirectLocked = Boolean(
      activeId &&
      state.lockedSessionIds.includes(activeId) &&
      !state.tempUnlockedIds.includes(activeId)
    )
    const isWsLocked = Boolean(activeId && isSessionInLockedWorkspace(activeId))
    const needShield = Boolean(
      activeId &&
      (isDirectLocked || isWsLocked) &&
      centerCol,
    )
    if (!needShield || !centerCol) {
      if (shieldEl) {
        shieldEl.remove()
        shieldEl = undefined
        shieldSessionId = undefined
      }
      return
    }
    if (shieldEl && shieldEl.parentElement === centerCol && shieldSessionId === activeId) {
      return
    }
    shieldEl?.remove()
    shieldSessionId = activeId
    const resolvedDict = typeof DICTIONARIES !== 'undefined' ? (DICTIONARIES[language()] ?? DICTIONARIES.en) : undefined
    const copy = resolvedDict ?? {
      ui: { close: 'Close', cancel: 'Cancel', unavailable: 'Unavailable' } as any,
      sessionMenu: { lockedShieldTitle: 'Locked', lockedShieldDesc: 'Enter PIN to unlock', pinPlaceholder: 'PIN', unlockViewOnce: 'Unlock', unlockPermanent: 'Permanent' } as any,
      workspaceMenu: { lockedShieldTitle: 'Locked Workspace', lockedShieldDesc: 'Enter PIN to unlock workspace' } as any,
    }
    const isLegacyPin = state.lockMode === 'pin'
    const overlay = document.createElement('div')
    overlay.className = 'dtd-lock-shield'
    overlay.setAttribute('data-delta-lock-shield', activeId!)
    const card = document.createElement('div')
    card.className = 'dtd-lock-card'

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'dtd-dialog-close-btn'
    closeBtn.setAttribute('aria-label', copy.ui.close ?? 'Close')
    closeBtn.textContent = '✕'
    closeBtn.addEventListener('click', () => {
      overlay.remove()
      if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
      deltaFeatures.setActiveSessionId(undefined)
    })
    card.appendChild(closeBtn)

    const iconWrap = document.createElement('div')
    iconWrap.className = 'dtd-lock-icon-wrap'
    iconWrap.appendChild(createLockSvg(22, false))

    const isWsOnly = isWsLocked && !isDirectLocked
    const title = document.createElement('h3')
    title.textContent = (isWsOnly && copy.workspaceMenu?.lockedShieldTitle)
      ? copy.workspaceMenu.lockedShieldTitle
      : copy.sessionMenu.lockedShieldTitle
    const desc = document.createElement('p')
    desc.textContent = (isWsOnly && copy.workspaceMenu?.lockedShieldDesc)
      ? copy.workspaceMenu.lockedShieldDesc
      : copy.sessionMenu.lockedShieldDesc

    const form = document.createElement('div'); form.className = 'dtd-lock-form'
    const pinInput = createCodeInputElement(copy.sessionMenu.pinPlaceholder, isLegacyPin)
    const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
    const rowBtns = document.createElement('div'); rowBtns.className = 'dtd-dialog-actions'
    const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'dtd-btn-secondary dtd-shield-cancel-btn'
    cancelBtn.textContent = copy.ui.cancel
    cancelBtn.addEventListener('click', () => {
      overlay.remove()
      if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
      deltaFeatures.setActiveSessionId(undefined)
    })
    const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.className = 'dtd-btn-primary'
    viewBtn.textContent = copy.sessionMenu.unlockViewOnce
    const permBtn = document.createElement('button'); permBtn.type = 'button'; permBtn.className = 'dtd-btn-secondary'
    permBtn.textContent = copy.sessionMenu.unlockPermanent

    const runUnlock = (isPermanent: boolean) => {
      if (!activeId) return
      const code = pinInput.value.trim()
      if (!isLegacyPin && !/^\d{6}$/.test(code)) {
        err.textContent = copy.sessionMenu.pinTooShort
        err.hidden = false
        return
      }
      viewBtn.disabled = true; permBtn.disabled = true
      let parentWsId: string | undefined
      if (isWsOnly) {
        for (const ws of readNativeWorkspaceSnapshot?.().items ?? []) {
          if (ws.sessionIds?.includes(activeId)) {
            if (isWorkspaceProtected(ws.workspaceId) || isWorkspaceProtected(ws.path)) {
              parentWsId = ws.workspaceId
              break
            }
          }
        }
        if (!parentWsId) {
          try {
            const wsId = sessionsApi?.list?.getSnapshot?.()?.byId?.[activeId]?.workspaceId
            if (wsId && isWorkspaceProtected(wsId)) parentWsId = wsId
          } catch {}
        }
      }

      const unlockPromise = (isWsOnly && parentWsId)
        ? verifyOrUnlockWorkspace(parentWsId, code, isPermanent)
        : verifyOrUnlockSession(activeId, code, isPermanent)

      void unlockPromise.then(res => {
        viewBtn.disabled = false; permBtn.disabled = false
        if (!res.ok) {
          err.textContent = copy.sessionMenu.wrongPin
          err.hidden = false
          return
        }
        overlay.remove()
        if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
        if (isPermanent) showDeltaToast((isWsOnly && copy.workspaceMenu?.unlockedToast) ? copy.workspaceMenu.unlockedToast : copy.sessionMenu.unlockedToast)
      })
    }
    viewBtn.addEventListener('click', () => runUnlock(false))
    permBtn.addEventListener('click', () => runUnlock(true))
    pinInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') runUnlock(false) })
    rowBtns.append(cancelBtn, permBtn, viewBtn)
    form.append(pinInput, err, rowBtns)
    card.append(iconWrap, title, desc, form)
    overlay.appendChild(card)
    centerCol.appendChild(overlay)
    shieldEl = overlay
  }

  // Use one primitive snapshot for both hover visibility and its optional
  // timestamp: null = denied, 0 = visible with no valid time, >0 = UTC ms.
  // The public catalog may update a Session's Workspace without changing its
  // timestamp; React must still revoke the exposed identity and copy action.
  const readSessionHoverSelection = (id: string): number | null => {
    if (!id) return null
    try {
      const policy = createSearchContentProtection(state, () => {
        if (!readNativeWorkspaceSnapshot) throw new Error('workspace membership unavailable')
        return readNativeWorkspaceSnapshot()
      })
      if (!policy.allowsSession(id)) return null
      if (!sessionsApi) return 0 // Published row remains usable on older Hosts.
      const byId = sessionsApi.list.getSnapshot()?.byId
      if (!byId || typeof byId !== 'object') return null
      if (!Object.prototype.hasOwnProperty.call(byId, id)) return 0
      const record = byId[id]
      if (!record || record.id !== id || record.blank ||
          !policy.allowsSession(id, record.workspaceId)) return null
      // Numeric Host timestamps are milliseconds. Unknown or seconds-sized
      // values omit the time without inventing a date in 1970.
      const value = normalizeSearchTime(record.updatedAt)
      return value >= Date.UTC(2000, 0, 1) && value <= Date.UTC(2100, 0, 1) ? value : 0
    } catch { return null }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ensureLoaded,
    getContentProtectionRevision: () => contentProtectionRevision,
    subscribeContentProtection: listener => {
      contentProtectionListeners.add(listener)
      return () => { contentProtectionListeners.delete(listener) }
    },
    subscribeSessionCatalog: listener => {
      sessionCatalogListeners.add(listener)
      return () => { sessionCatalogListeners.delete(listener) }
    },
    readSearchProtection: () => createSearchContentProtection(state, () => {
      if (!readNativeWorkspaceSnapshot) throw new Error('workspace membership unavailable')
      return readNativeWorkspaceSnapshot()
    }),
    getWorkspaces: () => readDeltaWorkspaceSnapshot()?.items ?? [],
    setWorkspacesApi: (api, readNative) => {
      const binding = ++workspaceMembershipBinding
      try { stopNativeContentMembership?.() } catch {}
      stopNativeContentMembership = undefined
      workspacesApi = api
      readNativeWorkspaceSnapshot = api ? (readNative ?? (() => api.list.getSnapshot())) : undefined
      if (api) {
        try {
          stopNativeContentMembership = api.list.subscribe?.(() => {
            if (workspacesApi === api && binding === workspaceMembershipBinding && state.lockedWorkspaceIds.length > 0) invalidateContentProtection()
          })
        } catch {}
      }
      if (state.lockedWorkspaceIds.length > 0) invalidateContentProtection()
      if (api) {
        if (hasSyncedStateFromHost) {
          notifyDataApis()
        } else {
          ensureLoaded()
        }
      }
    },
    setSessionsApi: (api) => {
      const binding = ++sessionCatalogBinding
      try { stopNativeSessionCatalog?.() } catch {}
      stopNativeSessionCatalog = undefined
      sessionsApi = api
      if (api) {
        try {
          // Only the published Host catalog subscribe contract is observed.
          // React's useSyncExternalStore compares each hovered Session's
          // primitive timestamp, so unrelated catalog updates don't rerender it.
          const stop = api.list.subscribe?.(() => {
            if (sessionsApi === api && binding === sessionCatalogBinding) publishSessionCatalog()
          })
          if (typeof stop === 'function') stopNativeSessionCatalog = stop
        } catch { /* older Host without a working subscribe keeps static fallback */ }
      }
      // A replaced or removed Host service invalidates the selected snapshot.
      publishSessionCatalog()
      if (api) {
        const mainSessionId = readConfirmedMainSessionId(api.list)
        if (mainSessionId !== undefined && state.activeSessionId !== mainSessionId) {
          publish({ activeSessionId: mainSessionId })
        }
        if (hasSyncedStateFromHost) notifyDataApis()
        else ensureLoaded()
      }
    },
    setNavigationApi: (api) => { navigationApi = api },
    setActiveSessionId: (id) => {
      if (state.activeSessionId === id) return
      publish({ activeSessionId: id })
    },
    getActiveSessionId: () => state.activeSessionId,
    readSessionHoverSelection,
    readSessionUpdateTime: id => {
      const selected = readSessionHoverSelection(id)
      return selected !== null && selected > 0 ? selected : undefined
    },
    isLocked: (id) => Boolean(id && state.lockedSessionIds.includes(id)),
    isProtectedView: (id) => Boolean(id && state.lockedSessionIds.includes(id) && !state.tempUnlockedIds.includes(id)),
    isDeleted: (id) => Boolean(id && state.deletedSessionIds.includes(id)),
    isWorkspaceLocked,
    isWorkspaceProtected,
    isSessionInLockedWorkspace,
    getWorkspaceCount: () => readNativeWorkspaceSnapshot?.()?.items.length ?? 0,
    hasSessionsApi: () => Boolean(sessionsApi),
    getUngroupedSessionIds,
    refreshState,
    beginTotpSetup,
    confirmTotpSetup,
    confirmTotpSetupWorkspace,
    lockSession,
    lockWorkspace,
    verifyOrUnlockSession,
    verifyOrUnlockWorkspace,
    clearPin,
    moveSession,
    deleteSession,
    deleteUngroupedSessions,
    closeDialog,
    openSetPinDialog,
    openSetPinWorkspaceDialog,
    openUnlockPinDialog,
    openUnlockWorkspaceDialog,
    openClearPinDialog,
    openMoveDialog,
    openDeleteDialog,
    openDeleteUngroupedDialog,
    syncLockShieldOverlay,
    onDataMutate: (listener) => {
      workspaceNotifyListeners.add(listener)
      return () => { workspaceNotifyListeners.delete(listener) }
    },
    triggerDataRefresh: notifyDataApis,
    resetSessionOverlays: () => {
      closeDialog()
      shieldEl?.remove()
      shieldEl = undefined
      shieldSessionId = undefined
      workspaceNotifyListeners.clear()
    },
  }
}

const deltaFeatures = createClientFeatureManager()


// The Host owns its native sidebar. Delta Search renders only inside published Slots.

type SearchTabId = 'all' | 'session' | 'workspace' | 'plugin' | 'skill' | 'shortcut' | 'action'
type SearchItemKind = 'session' | 'content' | 'workspace' | 'plugin' | 'skill' | 'command' | 'shortcut' | 'action'

interface HostContentHit {
  sessionId: string
  title?: string
  snippet: string
  matchStart?: number
  matchEnd?: number
  seq?: number
  turn?: number
  role?: 'user' | 'assistant'
  updatedAt?: number
  workspaceId?: string
  score?: number
}

interface PaletteItem {
  id: string
  tab: Exclude<SearchTabId, 'all'>
  kind: SearchItemKind
  title: string
  subtitle?: string
  snippet?: string
  badge: string
  meta?: string
  score: number
  keywords?: string
  run: () => void
}

function appendHighlightedText(target: HTMLElement, text: string, query: string): void {
  const safe = redactSensitiveText(text)
  const q = query.trim()
  if (!q) {
    target.textContent = safe
    return
  }
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 6)
  if (terms.length === 0) {
    target.textContent = safe
    return
  }
  const lower = safe.toLowerCase()
  const ranges: Array<[number, number]> = []
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase()
    if (!term) continue
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(term, from)
      if (idx < 0) break
      ranges.push([idx, idx + term.length])
      from = idx + term.length
    }
  }
  if (ranges.length === 0) {
    target.textContent = safe
    return
  }
  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const merged: Array<[number, number]> = []
  for (const [s, e] of ranges) {
    const prev = merged[merged.length - 1]
    if (prev && s <= prev[1]) {
      prev[1] = Math.max(prev[1], e)
    } else {
      merged.push([s, e])
    }
  }
  let cursor = 0
  for (const [s, e] of merged) {
    if (s > cursor) target.appendChild(document.createTextNode(safe.slice(cursor, s)))
    const mark = document.createElement('mark')
    mark.textContent = safe.slice(s, e)
    target.appendChild(mark)
    cursor = e
  }
  if (cursor < safe.length) target.appendChild(document.createTextNode(safe.slice(cursor)))
}

function canQueryHostSearchHttp(): boolean {
  return canCallHostHttp()
}

function normalizeSearchTime(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function revealSessionTurnInChat(turn: number | undefined, snippet: string | undefined): () => void {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return () => {}
  if (turn === undefined && !snippet) return () => {}
  let attempts = 0
  let cancelled = false
  let activeTimer: number | undefined
  let clearFlashTimer: number | undefined

  const flashTarget = (el: HTMLElement): void => {
    try { el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) } catch {}
    try { el.classList?.add?.('dtd-search-hit-flash') } catch {}
    clearFlashTimer = scheduleTimer(() => {
      try { el.classList?.remove?.('dtd-search-hit-flash') } catch {}
    }, 1900)
  }

  const probe = (): void => {
    if (cancelled) return
    attempts += 1
    let hitEl: HTMLElement | null = null
    const needle = snippet ? snippet.replace(/^…|…$/g, '').trim().slice(0, 24) : ''
    if (turn !== undefined) {
      const candidate = document.querySelector<HTMLElement>(`[data-chat-flow] [data-chat-turn="${turn}"], [data-chat-turn="${turn}"]`)
      if (candidate && (needle.length < 4 || (candidate.textContent ?? '').includes(needle))) {
        hitEl = candidate
      }
    }
    if (!hitEl && needle.length >= 4) {
      const nodes = document.querySelectorAll<HTMLElement>('[data-chat-flow] [data-chat-turn], [data-chat-turn]')
      for (const node of nodes) {
        if ((node.textContent ?? '').includes(needle)) {
          hitEl = node
          break
        }
      }
    }
    if (!hitEl && turn !== undefined) {
      hitEl = document.querySelector<HTMLElement>(`[data-chat-flow] [data-chat-turn="${turn}"], [data-chat-turn="${turn}"]`)
    }
    if (hitEl) {
      flashTarget(hitEl)
      return
    }
    if (attempts < 16) {
      activeTimer = scheduleTimer(probe, 100)
    }
  }

  activeTimer = scheduleTimer(probe, 80)
  return () => {
    cancelled = true
    if (activeTimer !== undefined) cancelTimer(activeTimer)
    if (clearFlashTimer !== undefined) cancelTimer(clearFlashTimer)
  }
}

/**
 * Plugin-owned Search Palette opened through a verified public composer Slot.
 * Searches sessions, workspaces, plugins, skills/commands, shortcuts, and quick actions without taking over the Host sidebar.
 */
function installHostSearch(
  controller: DeltaController & { toggleSidebarSafe?(): boolean; toggleRightbarSafe?(): boolean },
  sessions: SearchSessionsApi,
  navigation: SearchNavigationApi,
  searchScope?: ClientContext,
  React?: ReactApi,
): () => void {
  // InputActions is a Host-provided session-scope Slot prop, not a global service.
  type ScopedCommandTarget = { sessionId: string; insert(command: string): boolean }
  type CommandInputState = { draft: string; draftRev: number; phase: string; attachmentIds: readonly unknown[]; occurrences: readonly unknown[] }
  type CommandInputSpan = { start: number; end: number; draftRev: number }
  type CommandInputActions = {
    captureInsertion(): CommandInputSpan
    insertText(text: string, span: CommandInputSpan): boolean
  }
  type CommandSlotProps = {
    sessionId: string
    inputActions: CommandInputActions
    useInput<T>(selector: (state: CommandInputState) => T): T
    useAccess(action: 'session/prompt'): boolean | undefined
  }
  type CommandHost = {
    blocks?: { storeFor(id: string): { getSnapshot(): unknown } }
    input?: { for(scope: unknown): { state: { getSnapshot(): CommandInputState } } }
  }
  type CommandAccessHost = {
    whenAccess(sessionId: string, action: 'session/prompt', install: () => () => void): () => void
  }
  type CommandAccessLease = { sessionId: string; allowed: boolean; revision: number }
  const isDarwin = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? navigator.userAgent ?? '')
  const initialCopy = DICTIONARIES[language()] ?? DICTIONARIES.en

  const shell = document.createElement('section')
  shell.className = 'dtd-host-search'
  shell.setAttribute('data-delta-search', 'sessions')
  const searchField = document.createElement('div')
  searchField.className = 'dtd-host-search-field'
  const searchIcon = createSearchIconSvg()

  const input = document.createElement('input')
  input.type = 'search'
  input.maxLength = 500
  input.className = 'dtd-host-search-input'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', initialCopy.ui.searchSessions)
  input.placeholder = initialCopy.searchPalette.sidebarPlaceholder

  const clearBtn = document.createElement('button')
  clearBtn.type = 'button'
  clearBtn.className = 'dtd-search-clear'
  clearBtn.setAttribute('aria-label', initialCopy.searchPalette.clear)
  clearBtn.textContent = '×'
  clearBtn.hidden = true

  const kbdHint = document.createElement('kbd')
  kbdHint.className = 'dtd-search-kbd'
  kbdHint.textContent = 'Enter'

  searchField.append(searchIcon, input, clearBtn, kbdHint)

  const results = document.createElement('div')
  results.className = 'dtd-host-search-results'
  results.setAttribute('role', 'region')
  results.setAttribute('aria-label', initialCopy.ui.searchSessions)
  results.hidden = true
  shell.append(searchField, results)

  let isDisposed = false
  let inlineTimer: number | undefined
  let inlinePending: AbortController | undefined
  let inlineSerial = 0
  let inlineRenderSerial = 0
  let inlineRemoteItems: HostContentHit[] = []
  let isInlineSearching = false
  let hasInlineError = false

  let stopRevealTimer: (() => void) | undefined
  let modalTimer: number | undefined
  let modalPending: AbortController | undefined
  let modalSerial = 0
  let isModalOpen = false
  let modalRemoteHits: HostContentHit[] = []
  let isModalSearching = false
  let activeTab: SearchTabId = 'all'
  let activeIndex = 0
  let cachedCatalog: { plugins: PaletteItem[]; skills: PaletteItem[]; shortcuts: PaletteItem[] } | undefined
  let catalogSerial = 0

  let backdropEl: HTMLElement | undefined
  let modalEl: HTMLElement | undefined
  let modalInputEl: HTMLInputElement | undefined
  let modalClearBtn: HTMLButtonElement | undefined
  let modalTabsEl: HTMLElement | undefined
  let modalListEl: HTMLElement | undefined

  const isActive = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
  const clearInlineRequest = (): void => {
    if (inlineTimer !== undefined) cancelTimer(inlineTimer)
    inlineTimer = undefined
    inlinePending?.abort()
    inlinePending = undefined
    inlineSerial += 1
  }
  const clearModalRequest = (): void => {
    if (modalTimer !== undefined) cancelTimer(modalTimer)
    modalTimer = undefined
    modalPending?.abort()
    modalPending = undefined
    modalSerial += 1
  }

  const getWorkspaces = (): readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[] => {
    try {
      const ws = searchScope?.get?.('workspaces') as WorkspacesApi | undefined
      return ws?.list?.getSnapshot?.()?.items ?? []
    } catch {
      return []
    }
  }

  const readSearchProtection = () => deltaFeatures.readSearchProtection()
  const filterSearchHits = (hits: HostContentHit[]): HostContentHit[] => {
    const policy = readSearchProtection()
    try {
      const rows = sessions.list.getSnapshot().byId
      return hits.filter(hit => typeof hit?.sessionId === 'string' && !!hit.sessionId &&
        policy.allowsSession(hit.sessionId, hit.workspaceId) &&
        policy.allowsSession(hit.sessionId, rows[hit.sessionId]?.workspaceId))
    } catch { return [] }
  }

  const dispatchContentSearch = (
    query: string,
    signal: AbortSignal,
    onDone: (res: { items: HostContentHit[]; ok: boolean; fromDisabledOnly?: boolean }) => void,
  ): void => {
    const finish = (res: { items: HostContentHit[]; ok: boolean; fromDisabledOnly?: boolean }): void => {
      if (signal.aborted || isDisposed) return
      onDone({ ...res, items: filterSearchHits(res.items) })
    }
    const queryLegacy = (): void => {
      if (signal.aborted || isDisposed) return
      if (!readSearchProtection().canUseNativeFallback) {
        finish({ items: [], ok: false })
        return
      }
      void sessions.search(query, signal).then(
        fallback => {
          if (fallback.ok) {
            finish({
              items: (fallback.value?.items ?? []).map(item => ({
                sessionId: item.sessionId,
                snippet: item.snippet,
              })),
              ok: true,
            })
            return
          }
          const errMsg = fallback.error?.message ?? ''
          finish(/DISABLED|UNAVAILABLE/i.test(errMsg) ? { items: [], ok: true, fromDisabledOnly: true } : { items: [], ok: false })
        },
        reason => {
          if (signal.aborted) return
          console.warn('[delta-suite] native Session search failed', reason)
          finish({ items: [], ok: false })
        },
      )
    }

    if (!readSearchProtection().canQuery) {
      finish({ items: [], ok: false })
      return
    }
    if (!canQueryHostSearchHttp()) {
      queryLegacy()
      return
    }
    void fetch('/api/delta-suite/session-search?q=' + encodeURIComponent(query) + '&limit=30', {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    }).then(
      async res => {
        if (signal.aborted || isDisposed) return
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { items?: HostContentHit[] } | null
          if (Array.isArray(data?.items)) {
            finish({ items: data.items, ok: true })
            return
          }
        }
        queryLegacy()
      },
      () => {
        if (!signal.aborted) queryLegacy()
      },
    )
  }

  const openSessionHit = (sessionId: string, workspaceId?: string, turn?: number, snippet?: string): void => {
    if (isDisposed || !readSearchProtection().allowsSession(sessionId, workspaceId)) return
    try {
      if (!readSearchProtection().allowsSession(sessionId, sessions.list.getSnapshot().byId[sessionId]?.workspaceId)) return
    } catch { return }
    stopRevealTimer?.()
    stopRevealTimer = undefined
    try {
      if (workspaceId) navigation.openSession(sessionId, { workspaceId })
      else navigation.openSession(sessionId)
      stopRevealTimer = revealSessionTurnInChat(turn, snippet)
    } catch (reason) {
      console.warn('[delta-suite] native Session navigation failed', reason)
    }
  }

  const openWorkspaceHit = (workspaceId: string): void => {
    if (isDisposed) return
    const policy = readSearchProtection()
    const ws = getWorkspaces().find(w => w.workspaceId === workspaceId)
    if (!ws || !policy.allowsWorkspace(ws.workspaceId, ws.path)) return
    const sid = ws.sessionIds?.find(id => policy.allowsSession(id, workspaceId))
    if (sid) openSessionHit(sid, workspaceId)
    else if (Array.isArray(ws.sessionIds) && ws.sessionIds.length === 0) navigation.startSession(workspaceId)
  }

  const syncSidebarLabels = (): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    input.setAttribute('aria-label', copy.ui.searchSessions)
    input.placeholder = copy.searchPalette.sidebarPlaceholder
    results.setAttribute('aria-label', copy.ui.searchSessions)
    clearBtn.setAttribute('aria-label', copy.searchPalette.clear)
    const hasVal = input.value.length > 0
    clearBtn.hidden = !hasVal
    kbdHint.hidden = hasVal
  }

  const renderInline = (): void => {
    syncSidebarLabels()
    results.replaceChildren()
    const renderSerial = ++inlineRenderSerial
    const policy = readSearchProtection()
    const query = input.value.trim().toLocaleLowerCase()
    if (!query || !isActive()) { results.hidden = true; return }
    // One consistent Host list snapshot per render, including remote hit
    // title fallback; avoid repeated service reads while typing.
    const sessionById = sessions.list.getSnapshot().byId
    results.hidden = false
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    const pal = (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette
    const seen = new Set<string>()
    const matches: { id: string; title: string; snippet?: string; turn?: number; workspaceId?: string; isWorkspace?: boolean }[] = []

    for (const item of Object.values(sessionById)) {
      if (!policy.allowsSession(item.id, item.workspaceId)) continue
      const title = item.title?.trim() ?? ''
      if (!item.blank && title.toLocaleLowerCase().includes(query)) {
        matches.push({ id: item.id, title: redactSensitiveText(title), workspaceId: item.workspaceId })
        seen.add(item.id)
      }
      if (matches.length >= 20) break
    }
    for (const item of inlineRemoteItems) {
      if (!policy.allowsSession(item.sessionId, item.workspaceId) || seen.has(item.sessionId) || matches.length >= 20) continue
      const title = item.title?.trim() || sessionById[item.sessionId]?.title?.trim() || item.sessionId
      matches.push({
        id: item.sessionId,
        title: redactSensitiveText(title),
        snippet: redactSensitiveText(item.snippet),
        turn: item.turn,
        workspaceId: item.workspaceId,
      })
      seen.add(item.sessionId)
    }
    for (const ws of getWorkspaces()) {
      if (matches.length >= 20) break
      if (!policy.allowsWorkspace(ws.workspaceId, ws.path)) continue
      const wsTitle = ws.title?.trim() || redactPathForUi(ws.path)
      const wsPath = redactPathForUi(ws.path)
      if (wsTitle.toLocaleLowerCase().includes(query) || wsPath.toLocaleLowerCase().includes(query)) {
        matches.push({
          id: 'ws:' + ws.workspaceId,
          title: `${pal.kindWorkspace}: ${wsTitle}`,
          snippet: wsPath,
          workspaceId: ws.workspaceId,
          isWorkspace: true,
        })
      }
    }

    for (const match of matches) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dtd-host-search-result'
      const heading = document.createElement('span')
      heading.className = 'dtd-host-search-result-title'
      heading.textContent = match.title
      button.appendChild(heading)
      if (match.snippet) {
        const detail = document.createElement('span')
        detail.className = 'dtd-host-search-result-snippet'
        detail.textContent = match.snippet
        button.appendChild(detail)
      }
      button.addEventListener('click', () => {
        if (!isActive() || renderSerial !== inlineRenderSerial) return
        try {
          if (match.isWorkspace && match.workspaceId) {
            openWorkspaceHit(match.workspaceId)
          } else {
            openSessionHit(match.id, match.workspaceId, match.turn, match.snippet)
          }
          input.value = ''
          clearInlineRequest()
          inlineRemoteItems = []
          renderInline()
        } catch (reason) {
          console.warn('[delta-suite] native Session navigation failed', reason)
          hasInlineError = true
          renderInline()
        }
      })
      results.appendChild(button)
    }
    if (isInlineSearching || hasInlineError || matches.length === 0) {
      const message = document.createElement('p')
      message.className = 'dtd-host-search-hint'
      message.setAttribute('role', 'status')
      message.textContent = hasInlineError ? copy.unavailable : isInlineSearching ? copy.searching : copy.noResults
      results.appendChild(message)
    }
  }

  const onInlineInput = (): void => {
    clearInlineRequest()
    inlineRemoteItems = []
    isInlineSearching = false
    hasInlineError = false
    const query = input.value.replaceAll('\0', '').trim().slice(0, 500)
    if (query) {
      isInlineSearching = true
      const requestId = inlineSerial
      const aborter = new AbortController()
      inlinePending = aborter
      inlineTimer = scheduleTimer(() => {
        inlineTimer = undefined
        dispatchContentSearch(query, aborter.signal, res => {
          if (!isActive() || inlineSerial !== requestId || aborter.signal.aborted) return
          isInlineSearching = false
          hasInlineError = !res.ok
          inlineRemoteItems = res.ok ? res.items : []
          renderInline()
        })
      }, 220)
    }
    renderInline()
  }

  input.addEventListener('input', onInlineInput)
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    input.value = ''
    onInlineInput()
    input.blur()
  })
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation?.()
    input.value = ''
    onInlineInput()
  })

  // ---------------- Centered Command Search Palette ----------------
  // Unscoped sidebar search has no authorized composer target. Copy only.
  // Scoped composer insertion uses Host-provided InputActions, never editor DOM.
  const copySlashCommand = (commandName: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (typeof clipboard?.writeText !== 'function') {
      showDeltaToast(copy.searchPalette.commandCopyFailed)
      return
    }
    try {
      void clipboard.writeText(commandName).then(() => {
        try { controller.openConversation() } catch {}
        showDeltaToast(copy.searchPalette.commandCopied)
      }, () => showDeltaToast(copy.searchPalette.commandCopyFailed))
    } catch {
      showDeltaToast(copy.searchPalette.commandCopyFailed)
    }
  }

  const isSafeCommand = (name: string): boolean =>
    /^\/[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(name) && !/^\/(?:export|feedback)$/i.test(name)

  const getUniqueMainSessionId = (): string | undefined => {
    try {
      const rows = Object.values(sessions.list.getSnapshot().byId)
        .filter(row => (row.retainedBy?.mainView ?? 0) > 0)
      return rows.length === 1 ? rows[0].id : undefined
    } catch { return undefined }
  }

  const isEmptyCommandDraft = (input: CommandInputState | undefined): input is CommandInputState =>
    input?.phase === 'plain' && input.draft === '' && Number.isSafeInteger(input.draftRev) &&
    Array.isArray(input.attachmentIds) && input.attachmentIds.length === 0 &&
    Array.isArray(input.occurrences) && input.occurrences.length === 0

  // This read resolves an already-retained main Session generation. No new Session
  // is opened, no draft is initialized, and no shared Host service is replaced.
  const readCommandTarget = (scope: ClientContext, sessionId: string) => {
    try {
      if (isDisposed || controller.getSnapshot().mode !== 'delta' ||
          getUniqueMainSessionId() !== sessionId || !readSearchProtection().allowsSession(sessionId) || deltaFeatures.isLocked(sessionId) ||
          deltaFeatures.isSessionInLockedWorkspace(sessionId) || deltaFeatures.isDeleted(sessionId)) return undefined
      const binding = sessions.binding?.(sessionId)
      const session = binding?.session.getSnapshot()
      const host = scope.get?.('conversation') as CommandHost | undefined
      if (!binding || session?.sessionId !== sessionId || session.removed !== false ||
          session.subagent !== null || session.openState !== 'open' ||
          typeof host?.blocks?.storeFor !== 'function' || typeof host.input?.for !== 'function') return undefined
      if (host.blocks.storeFor(sessionId).getSnapshot() !== undefined) return undefined
      const input = host.input.for(binding.ctx).state.getSnapshot()
      if (!isEmptyCommandDraft(input)) return undefined
      return { binding, input, host }
    } catch { return undefined }
  }

  const dispatchSlashCommand = (name: string, target: ScopedCommandTarget | undefined): void => {
    if (!target) { copySlashCommand(name); return }
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    let isAccepted = false
    try { isAccepted = isSafeCommand(name) && target.insert(name + ' ') === true } catch {}
    showDeltaToast(isAccepted ? copy.searchPalette.commandInserted : copy.searchPalette.commandInsertFailed)
  }

  const getShortcutsService = (): {
    catalog?: { getSnapshot?: () => ReadonlyArray<{ id?: string; label?: string; keys?: readonly string[]; aliases?: readonly string[] }> }
  } | undefined => {
    try {
      return (searchScope?.get?.('shortcuts') ?? (searchScope as unknown as { shortcuts?: unknown })?.shortcuts) as any
    } catch {
      return undefined
    }
  }

  const buildDynamicCatalog = async (target?: ScopedCommandTarget): Promise<{ plugins: PaletteItem[]; skills: PaletteItem[]; shortcuts: PaletteItem[] }> => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const commandHint = target ? pCopy.commandInsertHint : pCopy.commandCopyHint
    const commandLabel = target ? pCopy.commandInsertLabel : pCopy.commandCopyLabel
    const plugins: PaletteItem[] = []
    const skills: PaletteItem[] = []
    const shortcuts: PaletteItem[] = []

    const remote = (searchScope?.get?.('remote') ?? (searchScope as unknown as { remote?: unknown })?.remote) as {
      skills?: { list?: () => Promise<unknown> }
      commands?: { list?: (sessionId: string) => Promise<{ ok?: boolean; value?: Array<{ name?: string; description?: string }> }> }
    } | undefined

    // Plugin and schedule navigation remain native-owned: without a public
    // navigation contract no Search Palette entry may impersonate a runnable action.

    // Safe built-in & live slash commands (strictly exclude /export & /feedback per privacy rules)
    const safeBuiltins: Array<{ cmd: string; descZh: string; descEn: string }> = [
      { cmd: '/plan', descZh: DICTIONARIES.zh.searchPalette.builtinPlan, descEn: DICTIONARIES.en.searchPalette.builtinPlan },
      { cmd: '/goal', descZh: DICTIONARIES.zh.searchPalette.builtinGoal, descEn: DICTIONARIES.en.searchPalette.builtinGoal },
      { cmd: '/compact', descZh: DICTIONARIES.zh.searchPalette.builtinCompact, descEn: DICTIONARIES.en.searchPalette.builtinCompact },
      { cmd: '/schedule', descZh: DICTIONARIES.zh.searchPalette.builtinSchedule, descEn: DICTIONARIES.en.searchPalette.builtinSchedule },
      { cmd: '/browser', descZh: DICTIONARIES.zh.searchPalette.builtinBrowser, descEn: DICTIONARIES.en.searchPalette.builtinBrowser },
      { cmd: '/boost', descZh: DICTIONARIES.zh.searchPalette.builtinBoost, descEn: DICTIONARIES.en.searchPalette.builtinBoost },
    ]
    const seenCmds = new Set<string>()
    for (const c of safeBuiltins) {
      seenCmds.add(c.cmd.toLowerCase())
      skills.push({
        id: 'cmd:' + c.cmd,
        tab: 'skill',
        kind: 'command',
        title: c.cmd,
        snippet: (language() === 'zh' ? c.descZh : c.descEn) + ' · ' + commandHint,
        badge: pCopy.kindCommand,
        meta: commandLabel,
        score: 52,
        keywords: `${c.cmd} ${c.descZh} ${c.descEn}`,
        run: () => dispatchSlashCommand(c.cmd, target),
      })
    }

    try {
      const targetSid = target?.sessionId ?? getUniqueMainSessionId()
      if (targetSid && readSearchProtection().allowsSession(targetSid) && !deltaFeatures.isLocked(targetSid) && !deltaFeatures.isSessionInLockedWorkspace(targetSid) &&
          !deltaFeatures.isDeleted(targetSid) && remote?.commands?.list) {
        const res = await remote.commands.list(targetSid)
        if (res?.ok && Array.isArray(res.value)) {
          for (const item of res.value) {
            const rawName = item?.name?.trim() ?? ''
            if (!rawName) continue
            const cmdName = rawName.startsWith('/') ? rawName : '/' + rawName
            if (!isSafeCommand(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
            seenCmds.add(cmdName.toLowerCase())
            skills.push({
              id: 'skill:' + cmdName,
              tab: 'skill',
              kind: 'skill',
              title: cmdName,
              snippet: (item.description ? redactSensitiveText(item.description) + ' · ' : '') + commandHint,
              badge: pCopy.kindSkill,
              meta: commandLabel,
              score: 58,
              keywords: `${cmdName} ${item.description ?? ''}`,
              run: () => dispatchSlashCommand(cmdName, target),
            })
          }
        }
      }
      const rawSkills = await remote?.skills?.list?.()
      const skillList = Array.isArray(rawSkills) ? rawSkills : ((rawSkills as { items?: unknown[]; skills?: unknown[] })?.items ?? (rawSkills as { skills?: unknown[] })?.skills ?? [])
      for (const s of skillList as Array<{ name?: string; title?: string; description?: string }>) {
        const raw = (s?.name ?? s?.title ?? '').trim()
        if (!raw) continue
        const cmdName = raw.startsWith('/') ? raw : '/' + raw
        if (!isSafeCommand(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
        seenCmds.add(cmdName.toLowerCase())
        skills.push({
          id: 'skill:' + cmdName,
          tab: 'skill',
          kind: 'skill',
          title: cmdName,
          snippet: (s.description ? redactSensitiveText(s.description) + ' · ' : '') + commandHint,
          badge: pCopy.kindSkill,
          meta: commandLabel,
          score: 57,
          keywords: `${cmdName} ${s.description ?? ''}`,
          run: () => dispatchSlashCommand(cmdName, target),
        })
      }
    } catch {}

    // Existing Host shortcut catalog and Delta-owned shortcuts; never mirror native guide DOM.
    const seenShortcuts = new Set<string>()
    const pushShortcut = (id: string, title: string, keyLabel: string, runner: () => void): void => {
      if (seenShortcuts.has(id)) return
      seenShortcuts.add(id)
      shortcuts.push({
        id: 'sc:' + id,
        tab: 'shortcut',
        kind: 'shortcut',
        title,
        badge: pCopy.kindShortcut,
        meta: keyLabel,
        score: 48,
        keywords: `${title} ${keyLabel}`,
        run: runner,
      })
    }
    try {
      const liveRows = getShortcutsService()?.catalog?.getSnapshot?.() ?? []
      for (const row of liveRows) {
        const id = row?.id?.trim()
        const label = row?.label?.trim()
        // Host Settings is native-owned; this adapter has no public open-settings route.
        if (!id || !label || id === 'settings.open') continue
        // The Host catalog provides labels, not permission to invoke arbitrary commands.
        // Advertise only actions with an explicit Delta-owned execution route.
        let run: (() => void) | undefined
        switch (id) {
          case 'session.search':
            run = () => openPalette('')
            break
          case 'session.new':
            run = () => navigation.startSession()
            break
          case 'sidebar.left.toggle':
            run = () => {
              if (typeof controller.toggleSidebarSafe === 'function') controller.toggleSidebarSafe()
              else controller.toggleSidebar()
            }
            break
          case 'sidebar.right.toggle':
            if (typeof controller.toggleRightbarSafe !== 'function') continue
            run = () => controller.toggleRightbarSafe?.()
            break
          default:
            // Unknown Host commands stay in Harness native shortcut handling.
            continue
        }
        if (!run) continue
        const keysStr = Array.isArray(row.keys) ? row.keys.join(' + ') : ''
        pushShortcut(id, redactSensitiveText(label), keysStr, run)
      }
    } catch {}
    // Native right-sidebar guide entries are Host-owned and not command targets.
    pushShortcut('search', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.globalCommandSearch, '', () => openPalette(''))
    pushShortcut('files', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.workspaceFiles, isDarwin ? '⌘ + P' : 'Ctrl + P', () => controller.toggleRightbarSafe?.())
    pushShortcut('browser', (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.builtInBrowser, isDarwin ? '⌘ + T' : 'Ctrl + T', () => controller.toggleRightbarSafe?.())

    return { plugins, skills, shortcuts }
  }

  const collectPaletteItems = (query: string, hostHits: HostContentHit[]): PaletteItem[] => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const q = query.trim().toLowerCase()
    const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 6) : []
    const items: PaletteItem[] = []
    const policy = readSearchProtection()
    const wsList = getWorkspaces().filter(ws => policy.allowsWorkspace(ws.workspaceId, ws.path))
    const wsById = new Map(wsList.map(w => [w.workspaceId, w]))

    const matchText = (text: string): boolean => {
      if (terms.length === 0) return true
      const lower = text.toLowerCase()
      return terms.every(t => lower.includes(t))
    }

    // 1. Sessions (titles + host in-memory message content hits)
    // Reuse one snapshot across title scoring and matching content hits.
    const sessionById = sessions.list.getSnapshot().byId
    const allSessions = Object.values(sessionById)
      .filter(s => !s.blank && policy.allowsSession(s.id, s.workspaceId))
      .sort((a, b) => normalizeSearchTime(b.updatedAt) - normalizeSearchTime(a.updatedAt))

    const contentHitsBySession = new Map<string, HostContentHit>()
    for (const hit of hostHits) {
      const sess = sessionById[hit.sessionId]
      if (!policy.allowsSession(hit.sessionId, hit.workspaceId) ||
          !policy.allowsSession(hit.sessionId, sess?.workspaceId)) continue
      if (!contentHitsBySession.has(hit.sessionId)) {
        contentHitsBySession.set(hit.sessionId, hit)
      }
      const rawTitle = hit.title?.trim() || sess?.title?.trim() || hit.sessionId
      const wsId = hit.workspaceId ?? sess?.workspaceId
      const ws = wsId ? wsById.get(wsId) : undefined
      const roleLabel = hit.role === 'user' ? pCopy.roleUser : hit.role === 'assistant' ? pCopy.roleAssistant : ''
      const turnText = hit.turn ? pCopy.turnLabel.replace('{turn}', String(hit.turn)) : ''
      const metaParts = [roleLabel, turnText, ws?.title].filter(Boolean)
      items.push({
        id: `hit:${hit.sessionId}:${hit.seq ?? hit.turn ?? 'c'}`,
        tab: 'session',
        kind: 'content',
        title: redactSensitiveText(rawTitle),
        snippet: redactSensitiveText(hit.snippet),
        badge: pCopy.kindContent,
        meta: metaParts.join(' · ') || undefined,
        score: (hit.score ?? 100) + 20,
        run: () => openSessionHit(hit.sessionId, wsId, hit.turn, hit.snippet),
      })
    }

    for (const s of allSessions) {
      const title = redactSensitiveText(s.title?.trim() || s.id)
      const ws = s.workspaceId ? wsById.get(s.workspaceId) : undefined
      const wsLabel = ws ? (ws.title || redactPathForUi(ws.path)) : ''
      const searchable = `${title} ${s.id} ${wsLabel}`
      if (!matchText(searchable)) continue
      if (q && contentHitsBySession.has(s.id) && title.toLowerCase() === (contentHitsBySession.get(s.id)?.title ?? '').toLowerCase()) {
        continue
      }
      const isPrefix = q ? title.toLowerCase().startsWith(q) : false
      const isArchived = Boolean(s.archived)
      items.push({
        id: 'sess:' + s.id,
        tab: 'session',
        kind: 'session',
        title,
        snippet: wsLabel || redactPathForUi(ws?.path ?? ''),
        badge: pCopy.kindSession,
        meta: isArchived ? pCopy.archivedBadge : undefined,
        score: q ? (isPrefix ? 140 : 110) : 70,
        run: () => openSessionHit(s.id, s.workspaceId),
      })
      if (!q && items.length >= 8) break
    }

    // 2. Workspaces
    for (const ws of wsList) {
      const safePath = redactPathForUi(ws.path)
      const title = ws.title?.trim() || safePath
      if (!matchText(`${title} ${safePath}`)) continue
      items.push({
        id: 'ws:' + ws.workspaceId,
        tab: 'workspace',
        kind: 'workspace',
        title: redactSensitiveText(title),
        snippet: safePath,
        badge: pCopy.kindWorkspace,
        meta: ws.sessionIds ? `${ws.sessionIds.filter(id => policy.allowsSession(id, ws.workspaceId)).length}` : undefined,
        score: q ? 85 : 50,
        run: () => openWorkspaceHit(ws.workspaceId),
      })
    }

    // 3. Plugins, Skills/Commands, Shortcuts
    if (cachedCatalog) {
      for (const p of cachedCatalog.plugins) {
        if (matchText(p.keywords || p.title)) items.push(p)
      }
      for (const sk of cachedCatalog.skills) {
        if (matchText(sk.keywords || sk.title)) items.push(sk)
      }
      for (const sc of cachedCatalog.shortcuts) {
        if (matchText(sc.keywords || sc.title)) items.push(sc)
      }
    }

    // 4. Quick Actions
    const quickActions: PaletteItem[] = [
      {
        id: 'act:new',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionNewConversation,
        badge: pCopy.kindAction,
        score: 45,
        keywords: `new conversation chat start \u65B0\u5EFA \u5BF9\u8BDD \u5F00\u59CB\u5BF9\u8BDD`,
        run: () => navigation.startSession(),
      },
      {
        id: 'act:sidebar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleSidebar,
        badge: pCopy.kindAction,
        score: 41,
        keywords: `toggle sidebar left \u4FA7\u8FB9\u680F \u6536\u8D77 \u5C55\u5F00`,
        run: () => controller.toggleSidebarSafe?.() ?? controller.toggleSidebar(),
      },
      {
        id: 'act:rightbar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleRightbar,
        badge: pCopy.kindAction,
        score: 40,
        keywords: `toggle rightbar right \u53F3\u4FA7\u8FB9\u680F \u5DE5\u5177`,
        run: () => controller.toggleRightbarSafe?.(),
      },
    ]
    for (const act of quickActions) {
      if (matchText(`${act.title} ${act.keywords ?? ''}`)) items.push(act)
    }

    items.sort((a, b) => b.score - a.score)
    return items
  }

  let currentFilteredItems: PaletteItem[] = []

  const closePalette = (): void => {
    isModalOpen = false
    catalogSerial += 1
    cachedCatalog = undefined
    currentFilteredItems = []
    clearModalRequest()
    modalRemoteHits = []
    if (backdropEl) {
      backdropEl.hidden = true
      backdropEl.remove()
    }
    backdropEl = undefined
    modalEl = undefined
    modalInputEl = undefined
    modalClearBtn = undefined
    modalTabsEl = undefined
    modalListEl = undefined
  }

  const executePaletteItem = (item: PaletteItem | undefined): void => {
    if (!isModalOpen || !item || !currentFilteredItems.includes(item)) return
    closePalette()
    input.value = ''
    clearInlineRequest()
    inlineRemoteItems = []
    renderInline()
    item.run()
  }

  const renderPalette = (): void => {
    if (!isModalOpen || !modalTabsEl || !modalListEl || !modalInputEl || !modalClearBtn) return
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const q = modalInputEl.value.trim()
    modalClearBtn.hidden = modalInputEl.value.length === 0

    const allItems = collectPaletteItems(q, modalRemoteHits)
    const tabDefs: Array<{ id: SearchTabId; label: string }> = [
      { id: 'all', label: pCopy.tabAll },
      { id: 'session', label: pCopy.tabSession },
      { id: 'workspace', label: pCopy.tabWorkspace },
      { id: 'plugin', label: pCopy.tabPlugin },
      { id: 'skill', label: pCopy.tabSkill },
      { id: 'shortcut', label: pCopy.tabShortcut },
      { id: 'action', label: pCopy.tabAction },
    ]
    const counts = new Map<SearchTabId, number>([['all', allItems.length]])
    for (const item of allItems) {
      counts.set(item.tab, (counts.get(item.tab) ?? 0) + 1)
    }

    modalTabsEl.replaceChildren()
    for (const tab of tabDefs) {
      const count = counts.get(tab.id) ?? 0
      const tabBtn = document.createElement('button')
      tabBtn.type = 'button'
      tabBtn.className = tab.id === activeTab ? 'dtd-search-tab dtd-active' : 'dtd-search-tab'
      const lbl = document.createElement('span')
      lbl.textContent = tab.label
      const cnt = document.createElement('span')
      cnt.className = 'dtd-search-tab-count'
      cnt.textContent = String(count)
      tabBtn.append(lbl, cnt)
      tabBtn.addEventListener('click', () => {
        activeTab = tab.id
        activeIndex = 0
        renderPalette()
        modalInputEl?.focus?.()
      })
      modalTabsEl.appendChild(tabBtn)
    }

    currentFilteredItems = activeTab === 'all'
      ? allItems.slice(0, 60)
      : allItems.filter(it => it.tab === activeTab).slice(0, 60)

    if (activeIndex >= currentFilteredItems.length) {
      activeIndex = Math.max(0, currentFilteredItems.length - 1)
    }

    modalListEl.replaceChildren()
    if (currentFilteredItems.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dtd-search-empty'
      const title = document.createElement('strong')
      title.textContent = isModalSearching ? pCopy.searchingContent : pCopy.noResults
      const hint = document.createElement('span')
      hint.textContent = pCopy.noResultsHint
      empty.append(title, hint)
      modalListEl.appendChild(empty)
      return
    }

    currentFilteredItems.forEach((item, index) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'dtd-search-item'
      row.setAttribute('role', 'option')
      if (index === activeIndex) row.setAttribute('data-active', '1')

      const head = document.createElement('div')
      head.className = 'dtd-search-item-head'
      const titleSpan = document.createElement('span')
      titleSpan.className = 'dtd-search-item-title'
      appendHighlightedText(titleSpan, item.title, q)

      const metaBox = document.createElement('span')
      metaBox.className = 'dtd-search-item-meta'
      if (item.meta) {
        const metaBadge = document.createElement('span')
        metaBadge.className = 'dtd-search-item-badge'
        metaBadge.setAttribute('data-muted', '1')
        metaBadge.textContent = item.meta
        metaBox.appendChild(metaBadge)
      }
      const kindBadge = document.createElement('span')
      kindBadge.className = 'dtd-search-item-badge'
      kindBadge.textContent = item.badge
      metaBox.appendChild(kindBadge)

      head.append(titleSpan, metaBox)
      row.appendChild(head)

      if (item.snippet) {
        const snip = document.createElement('p')
        snip.className = 'dtd-search-item-snippet'
        appendHighlightedText(snip, item.snippet, q)
        row.appendChild(snip)
      }

      row.addEventListener('pointerenter', () => {
        activeIndex = index
        const prev = modalListEl?.querySelector?.('[data-active="1"]')
        if (prev && prev !== row) prev.removeAttribute('data-active')
        row.setAttribute('data-active', '1')
      })
      row.addEventListener('click', () => executePaletteItem(item))
      modalListEl!.appendChild(row)
    })

    if (isModalSearching) {
      const status = document.createElement('div')
      status.className = 'dtd-search-empty'
      const span = document.createElement('span')
      span.textContent = pCopy.searchingContent
      status.appendChild(span)
      modalListEl.appendChild(status)
    }
  }

  const triggerModalSearch = (rawQuery: string): void => {
    clearModalRequest()
    modalRemoteHits = []
    isModalSearching = false
    const query = rawQuery.replaceAll('\0', '').trim().slice(0, 500)
    if (query) {
      isModalSearching = true
      const requestId = modalSerial
      const aborter = new AbortController()
      modalPending = aborter
      modalTimer = scheduleTimer(() => {
        modalTimer = undefined
        dispatchContentSearch(query, aborter.signal, res => {
          if (!isModalOpen || isDisposed || modalSerial !== requestId || aborter.signal.aborted) return
          isModalSearching = false
          modalRemoteHits = res.ok ? res.items : []
          renderPalette()
        })
      }, 150)
    }
    renderPalette()
  }

  const openPalette = (seedQuery = '', target?: ScopedCommandTarget): void => {
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    if (typeof document.body?.appendChild !== 'function') return
    results.hidden = true
    clearInlineRequest()
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette

    if (!backdropEl) {
      const backdrop = document.createElement('div')
      backdrop.className = 'dtd-search-backdrop'
      backdrop.addEventListener('pointerdown', (e) => {
        if (e.target === backdrop) closePalette()
      })

      const modal = document.createElement('div')
      modal.className = 'dtd-search-modal'
      modal.setAttribute('role', 'dialog')
      modal.setAttribute('aria-modal', 'true')
      modal.setAttribute('aria-label', copy.ui.searchSessions)
      // Escape belongs to this Delta-owned dialog, never to the page-wide key event.
      modal.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!isModalOpen || e.key !== 'Escape') return
        e.preventDefault?.()
        closePalette()
      })

      const header = document.createElement('div')
      header.className = 'dtd-search-header'
      const icon = createSearchIconSvg()
      const mInput = document.createElement('input')
      mInput.type = 'text'
      mInput.maxLength = 500
      mInput.autocomplete = 'off'
      mInput.className = 'dtd-search-modal-input'
      mInput.placeholder = pCopy.placeholder
      mInput.setAttribute('aria-label', pCopy.placeholder)

      const mClear = document.createElement('button')
      mClear.type = 'button'
      mClear.className = 'dtd-search-clear'
      const clearSvg = createSvgEl('svg', {
        viewBox: '0 0 16 16',
        width: 14,
        height: 14,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 1.75,
        'stroke-linecap': 'round',
        'aria-hidden': 'true',
      })
      clearSvg.appendChild(createSvgEl('path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7' }))
      mClear.appendChild(clearSvg)
      mClear.setAttribute('aria-label', pCopy.clear)
      mClear.hidden = true
      mClear.addEventListener('click', () => {
        mInput.value = ''
        activeIndex = 0
        triggerModalSearch('')
        mInput.focus()
      })

      const escHint = document.createElement('kbd')
      escHint.className = 'dtd-search-kbd'
      escHint.textContent = 'Esc'
      escHint.addEventListener('click', closePalette)

      header.append(icon, mInput, mClear, escHint)

      const tabs = document.createElement('div')
      tabs.className = 'dtd-search-tabs'
      const list = document.createElement('div')
      list.className = 'dtd-search-list'
      list.setAttribute('role', 'listbox')

      const footer = document.createElement('div')
      footer.className = 'dtd-search-footer'
      const hints = document.createElement('div')
      hints.className = 'dtd-search-footer-hints'
      for (const h of [pCopy.footerNav, pCopy.footerOpen, pCopy.footerTab, pCopy.footerEsc]) {
        const s = document.createElement('span')
        s.textContent = h
        hints.appendChild(s)
      }
      footer.appendChild(hints)

      modal.append(header, tabs, list, footer)
      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)

      mInput.addEventListener('input', () => {
        activeIndex = 0
        triggerModalSearch(mInput.value)
      })
      mInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault?.()
          closePalette()
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault?.()
          if (currentFilteredItems.length > 0) {
            activeIndex = (activeIndex + 1) % currentFilteredItems.length
            renderPalette()
            modalListEl?.querySelector?.<HTMLElement>('[data-active="1"]')?.scrollIntoView?.({ block: 'nearest' })
          }
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault?.()
          if (currentFilteredItems.length > 0) {
            activeIndex = (activeIndex - 1 + currentFilteredItems.length) % currentFilteredItems.length
            renderPalette()
            modalListEl?.querySelector?.<HTMLElement>('[data-active="1"]')?.scrollIntoView?.({ block: 'nearest' })
          }
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault?.()
          const order: SearchTabId[] = ['all', 'session', 'workspace', 'plugin', 'skill', 'shortcut', 'action']
          const idx = order.indexOf(activeTab)
          const delta = e.shiftKey ? -1 : 1
          activeTab = order[(idx + delta + order.length) % order.length]
          activeIndex = 0
          renderPalette()
          return
        }
        if (e.key === 'Enter') {
          e.preventDefault?.()
          executePaletteItem(currentFilteredItems[activeIndex])
        }
      })

      backdropEl = backdrop
      modalEl = modal
      modalInputEl = mInput
      modalClearBtn = mClear
      modalTabsEl = tabs
      modalListEl = list
    }

    isModalOpen = true
    const request = ++catalogSerial
    cachedCatalog = undefined
    currentFilteredItems = []
    activeTab = target ? 'skill' : 'all'
    activeIndex = 0
    if (modalInputEl) {
      modalInputEl.value = seedQuery
      modalInputEl.focus?.()
      modalInputEl.select?.()
    }
    triggerModalSearch(seedQuery)
    void buildDynamicCatalog(target).then(cat => {
      if (!isModalOpen || isDisposed || request !== catalogSerial) return
      cachedCatalog = cat
      renderPalette()
    }).catch(() => { /* no stale catalog or guessed commands on failure */ })
  }

  // Public Search Palette access is independent of private composer InputActions.
  // An unavailable public Slot must fall back to Harness native search.
  if (React && searchScope) {
    const react = React
      // Official composer Slot, not a guessed Host sidebar DOM insertion point.
      try {
        searchScope.slots.inject('conversation.input.left', () => searchScope.slots.register({
          name: 'conversation.input.left', id: 'delta.search.palette', order: 65,
          label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions,
        }, () => controller.getSnapshot().mode === 'delta'
          ? react.createElement('button', {
            type: 'button',
            'aria-label': (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions,
            onClick: () => openPalette(''),
          }, (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
          : null))
      } catch { /* official Slot missing: preserve native Harness search */ }
  }

  // Register only in the declared session-scoped Host Slot. Older Host builds
  // without the public provider/props simply keep the copy-only sidebar route.
  if (React && searchScope && typeof React.useRef === 'function' && typeof React.useEffect === 'function') {
    const react = React
    try { searchScope.inject(['conversation', 'uiSession'], composerScope => {
      if (isDisposed) return
      const host = composerScope.get?.('conversation') as CommandHost | undefined
      const accessCandidate = composerScope.get?.('uiSession') as CommandAccessHost | undefined
      if (typeof host?.input?.for !== 'function' || typeof host.blocks?.storeFor !== 'function' ||
          typeof accessCandidate?.whenAccess !== 'function') return
      const accessOwner = accessCandidate
      const sameAccessOwner = (): boolean => {
        try { return composerScope.get?.('uiSession') === accessOwner } catch { return false }
      }

      function ScopedCommandEntry(props: CommandSlotProps): unknown {
        const view = react.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
        const input = props.useInput(state => state)
        const allowed = props.useAccess('session/prompt') === true
        const current = react.useRef({ props, allowed })
        current.current = { props, allowed }
        const leaseRef = react.useRef<CommandAccessLease | undefined>(undefined)
        react.useEffect(() => {
          const lease: CommandAccessLease = { sessionId: props.sessionId, allowed: false, revision: 0 }
          leaseRef.current = lease
          let stop: (() => void) | undefined
          // Host's session-specific access subscription revokes immediately,
          // even before a React permission Hook has rendered its new value.
          try {
            stop = accessOwner.whenAccess(lease.sessionId, 'session/prompt', () => {
              lease.allowed = true
              lease.revision += 1
              return () => { lease.allowed = false; lease.revision += 1 }
            })
          } catch { lease.allowed = false }
          return () => {
            lease.allowed = false
            lease.revision += 1
            if (leaseRef.current === lease) leaseRef.current = undefined
            try { stop?.() } catch {}
          }
        }, [props.sessionId])
        if (isDisposed || view.mode !== 'delta' || !allowed ||
            getUniqueMainSessionId() !== props.sessionId || !isEmptyCommandDraft(input)) return null
        const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
        return react.createElement('button', {
          type: 'button',
          className: 'dtd-context-action',
          title: copy.searchPalette.commandInsertHint,
          onClick: () => {
            const sid = props.sessionId
            const actions = props.inputActions
            const lease = leaseRef.current
            if (!lease?.allowed || lease.sessionId !== sid || !current.current.allowed ||
                current.current.props.sessionId !== sid || current.current.props.inputActions !== actions ||
                !sameAccessOwner()) {
              showDeltaToast(copy.searchPalette.commandInsertFailed)
              return
            }
            const source = readCommandTarget(composerScope, sid)
            if (!source) { showDeltaToast(copy.searchPalette.commandInsertFailed); return }
            const accessRevision = lease.revision
            try {
              const span = actions.captureInsertion()
              if (span.start !== 0 || span.end !== 0 || span.draftRev !== source.input.draftRev) {
                showDeltaToast(copy.searchPalette.commandInsertFailed)
                return
              }
              openPalette('', { sessionId: sid, insert(command) {
                // Recheck the same mounted Slot and live Host generation, block,
                // lock, empty draft and captured revision immediately before edit.
                if (leaseRef.current !== lease || !lease.allowed || lease.revision !== accessRevision ||
                    !current.current.allowed || current.current.props.sessionId !== sid ||
                    current.current.props.inputActions !== actions ||
                    !sameAccessOwner()) return false
                const latest = readCommandTarget(composerScope, sid)
                if (!latest || latest.binding !== source.binding || latest.host !== source.host ||
                    latest.input.draftRev !== span.draftRev) return false
                return actions.insertText(command, span) === true
              } })
            } catch { showDeltaToast(copy.searchPalette.commandInsertFailed) }
          },
        }, copy.searchPalette.commandPickerLabel)
      }

      function ComposerCommandEntry(props: CommandSlotProps): unknown {
        if (typeof props?.sessionId !== 'string' || typeof props.useInput !== 'function' ||
            typeof props.useAccess !== 'function' || typeof props.inputActions?.captureInsertion !== 'function' ||
            typeof props.inputActions?.insertText !== 'function') return null
        return react.createElement(ScopedCommandEntry, props as unknown as Record<string, unknown>)
      }

      try {
        composerScope.slots.inject('conversation.input.left', () => composerScope.slots.register<CommandSlotProps>({
          name: 'conversation.input.left', id: 'delta.search.composer-commands', order: 70,
          label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette.commandPickerLabel,
        }, ComposerCommandEntry))
      } catch { /* optional Slot: preserve copy-only search */ }
    }) } catch { /* optional Host services: preserve copy-only search */ }
  }

  // Delta sidebar Enter opens Search Palette; global Ctrl/Cmd+K remains Harness-owned.
  searchField.addEventListener('click', (e) => {
    if (e.target === input || e.target === clearBtn) return
    input.focus?.()
  })
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!isModalOpen && e.key === 'Enter') {
      e.preventDefault?.()
      openPalette(input.value)
    }
  })

  // No Host sidebar DOM selectors, MutationObserver, or shell insertion.
  // Search remains accessible through the verified conversation.input.left Slot.
  const sync = (): void => {
    if (isDisposed) return
    syncSidebarLabels()
    if (controller.getSnapshot().mode !== 'delta') {
      clearInlineRequest()
      closePalette()
    }
  }
  const unsubscribe = controller.subscribe(sync)
  const invalidateSearchProtection = (): void => {
    if (isDisposed) return
    clearInlineRequest()
    clearModalRequest()
    inlineRemoteItems = []
    modalRemoteHits = []
    cachedCatalog = undefined
    catalogSerial += 1
    currentFilteredItems = []
    inlineRenderSerial += 1
    isInlineSearching = false
    isModalSearching = false
    stopRevealTimer?.()
    stopRevealTimer = undefined
    try { renderInline() } catch { results.replaceChildren() }
    try { renderPalette() } catch { modalListEl?.replaceChildren() }
  }
  let previousProtection = deltaFeatures.getSnapshot()
  const unsubscribeProtection = deltaFeatures.subscribe(() => {
    const next = deltaFeatures.getSnapshot()
    const prev = previousProtection
    previousProtection = next
    if (next.isSearchProtectionReady === prev.isSearchProtectionReady &&
        next.lockedSessionIds === prev.lockedSessionIds &&
        next.lockedWorkspaceIds === prev.lockedWorkspaceIds &&
        next.deletedSessionIds === prev.deletedSessionIds &&
        next.movedSessions === prev.movedSessions) return
    invalidateSearchProtection()
  })
  // Membership may change without a new Delta state payload.
  try { searchScope?.inject(['workspaces'], scope => {
    if (isDisposed) return
    const list = scope.workspaces?.list
    if (!list?.subscribe) return
    scope.effect(() => {
      let isListening = true
      const stop = list.subscribe?.(() => {
        if (isListening && deltaFeatures.getSnapshot().lockedWorkspaceIds.length > 0) invalidateSearchProtection()
      })
      if (deltaFeatures.getSnapshot().lockedWorkspaceIds.length > 0) invalidateSearchProtection()
      return () => {
        isListening = false
        stop?.()
        invalidateSearchProtection()
      }
    }, 'delta-suite: search workspace protection observer')
  }) } catch { /* An unavailable workspace snapshot remains excluded by the policy. */ }
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    unsubscribeProtection()
    stopRevealTimer?.()
    closePalette()
    clearInlineRequest()
    unsubscribe()
    shell.remove()
  }
}

window.__ModuleLoader__.load({
  id: DELTA_SUITE_OWNER,
  factory(require) {
    let React: ReactApi
    try {
      React = require('react') as ReactApi
      if (typeof React?.createElement !== 'function' ||
          typeof React?.useState !== 'function' ||
          typeof React?.useSyncExternalStore !== 'function') {
        throw new Error('Host React platform module is incomplete')
      }
    } catch (error) {
      console.error('[delta-suite] React unavailable; native UI remains active:', error)
      return { inject: [], apply() {} }
    }
    const el = React.createElement
    const bindWorkspaceReferences = createClientBindingLifetime()
    const bindSessionReferences = createClientBindingLifetime()
    const ASSISTANT_TAB_ID = DELTA_SUITE_OWNER
    const ASSISTANT_TAB_KIND = 'delta-context-assistant'
    const ASSISTANT_PROTOCOL = 'dtdelta'
    const ASSISTANT_PRESET = 'delta-context'
    const assistantWorkflows = new Map<string, AssistantWorkflow>()
    const discussionAssociations = new Map<string, string>()
    const activeAssistantReleases = new Set<() => void>()
    let assistantServices: AssistantServices | undefined

    function useContentProtectionRevision(): number {
      return React.useSyncExternalStore(deltaFeatures.subscribeContentProtection, deltaFeatures.getContentProtectionRevision)
    }
    function allowsAssistantContent(scope: AssistantServices | undefined, ...ids: string[]): boolean {
      if (!scope || assistantServices !== scope) return false
      try {
        const policy = deltaFeatures.readSearchProtection()
        const rows = scope.sessions.list.getSnapshot().byId
        return !!rows && ids.every(id => !!id && Object.prototype.hasOwnProperty.call(rows, id) &&
          policy.allowsSession(id, rows[id]?.workspaceId))
      } catch { return false }
    }
    function isCurrentAssistantAccess(scope: AssistantServices | undefined, revision: number, ...ids: string[]): boolean {
      return revision === deltaFeatures.getContentProtectionRevision() && allowsAssistantContent(scope, ...ids)
    }
    function hasAssistantAssociation(parsed: Omit<AssistantResource, 'reference' | 'protectionRevision'>): boolean {
      if (parsed.parentSessionId === parsed.assistantSessionId) return false
      if (parsed.purpose === 'discussion') return savedAssistantSession(parsed.parentSessionId) === parsed.assistantSessionId
      const workflow = assistantWorkflows.get(parsed.assistantSessionId)
      return workflow?.purpose === 'optimization' && workflow.parentSessionId === parsed.parentSessionId
    }
    const savedAssistantKey = 'fongap.delta-suite.assistant-sessions.v1'
    function assistantAddress(parentSessionId: string, assistantSessionId: string, purpose: 'discussion' | 'optimization'): string {
      const query = new URLSearchParams({ parent: parentSessionId, purpose })
      return `dsh-resource://${ASSISTANT_PROTOCOL}/session/${encodeURIComponent(assistantSessionId)}?${query}`
    }
    function parseAssistantAddress(address: string): Omit<AssistantResource, 'reference' | 'protectionRevision'> | undefined {
      try {
        const url = new URL(address)
        const parts = url.pathname.split('/').filter(Boolean)
        const parentSessionId = url.searchParams.get('parent')
        const purpose = url.searchParams.get('purpose')
        if (url.protocol !== 'dsh-resource:' || url.hostname !== ASSISTANT_PROTOCOL ||
            parts.length !== 2 || parts[0] !== 'session' || !parentSessionId ||
            (purpose !== 'discussion' && purpose !== 'optimization')) return undefined
        return { parentSessionId, assistantSessionId: decodeURIComponent(parts[1]!), purpose }
      } catch { return undefined }
    }
    function savedAssistantSession(parentSessionId: string): string | undefined {
      const remembered = discussionAssociations.get(parentSessionId)
      if (remembered !== undefined) return remembered
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        const saved = value[parentSessionId]
        return typeof saved === 'string' ? saved : undefined
      } catch { return undefined }
    }
    function rememberAssistantSession(parentSessionId: string, sessionId: string): void {
      discussionAssociations.set(parentSessionId, sessionId)
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        localStorage.setItem(savedAssistantKey, JSON.stringify({ ...value, [parentSessionId]: sessionId }))
      } catch { /* the current panel remains usable without a saved resume id */ }
    }
    function revokeAssistantAccess(): void {
      assistantWorkflows.clear()
      for (const release of [...activeAssistantReleases]) release()
    }

    // Releasing a Delta reference does not cancel Host-owned running activity.
    // Every retained reference (including a not-yet-ready one) gets one release.
    function retainAssistantAccess(scope: AssistantServices, id: string, signal?: AbortSignal) {
      const reference = scope.sessions.retain(id, { source: 'sidebarChat', ...(signal ? { signal } : {}) })
      let isReleased = false
      let wake: () => void = () => {}
      const ended = new Promise<void>(resolve => { wake = resolve })
      const release = (): void => {
        if (isReleased) return
        isReleased = true
        activeAssistantReleases.delete(release)
        signal?.removeEventListener('abort', release)
        try { reference.release() } catch {} finally { wake() }
      }
      activeAssistantReleases.add(release)
      signal?.addEventListener('abort', release, { once: true })
      if (signal?.aborted) release()
      return {
        reference, release, ended,
        async ready(): Promise<boolean> {
          await Promise.race([reference.ready, ended])
          return !isReleased && reference.sessionId === id && reference.binding.session.sessionId === id
        },
      }
    }

    function registerAssistantSurface(scope: AssistantServices): () => void {
      revokeAssistantAccess()
      discussionAssociations.clear()
      assistantServices = scope
      const stopProtection = deltaFeatures.subscribeContentProtection(revokeAssistantAccess)
      scope.effect(() => scope.resources.register({
        protocol: ASSISTANT_PROTOCOL,
        async *open(address, { signal }) {
          const parsed = parseAssistantAddress(address)
          const revision = deltaFeatures.getContentProtectionRevision()
          if (!parsed || !hasAssistantAssociation(parsed) ||
              !isCurrentAssistantAccess(scope, revision, parsed.parentSessionId, parsed.assistantSessionId)) {
            throw new Error('Delta Assistant: protected or invalid resource')
          }
          if (signal.aborted) return
          const lease = retainAssistantAccess(scope, parsed.assistantSessionId, signal)
          try {
            if (!await lease.ready() || !isCurrentAssistantAccess(scope, revision, parsed.parentSessionId, parsed.assistantSessionId)) return
            yield { ok: true, value: { ...parsed, reference: lease.reference, protectionRevision: revision } }
            await lease.ended
          } finally { lease.release() }
        },
      }), 'delta-suite: independent assistant resources')
      scope.effect(() => scope.sidebarRightTabs.register({
        id: ASSISTANT_TAB_ID,
        kind: ASSISTANT_TAB_KIND,
        patterns: [`dsh-resource://${ASSISTANT_PROTOCOL}/session/**`],
        priority: 'extension',
        canOpen: address => {
          const parsed = parseAssistantAddress(address)
          return !!parsed && hasAssistantAssociation(parsed) &&
            allowsAssistantContent(scope, parsed.parentSessionId, parsed.assistantSessionId)
        },
        title: address => parseAssistantAddress(address)?.purpose === 'optimization'
          ? (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.optimizeDraft
          : (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.discussTask,
      }), 'delta-suite: independent assistant sidebar type')
      scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
        name: 'sidebar.right.pane.tab', key: ASSISTANT_TAB_ID,
        children: { 'delta.assistant.conversation': { kind: 'single', scope: 'session' } },
      }, AssistantTabBody))
      scope.slots.inject('delta.assistant.conversation', () => scope.slots.register({
        name: 'delta.assistant.conversation',
      }, EmbeddedAssistantConversation))
      scope.slots.inject('conversation.input.left', () => scope.slots.register({
        name: 'conversation.input.left', id: 'delta.context.assistant-actions', order: 80,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.discussTask,
      }, AssistantInputControls))
      scope.slots.inject('conversation.chat.assistant-actions', () => scope.slots.register({
        name: 'conversation.chat.assistant-actions', id: 'delta.context.optimizer-apply', order: 90,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.applyOptimization,
      }, OptimizerApplyAction))
      scope.slots.inject('conversation.chat.assistant-actions', () => scope.slots.register({
        name: 'conversation.chat.assistant-actions', id: 'delta.context.compaction-activity', order: 80,
        label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.compacting,
      }, CompactionActivityAction))
      return () => {
        stopProtection()
        if (assistantServices !== scope) return
        assistantServices = undefined
        discussionAssociations.clear()
        revokeAssistantAccess()
      }
    }
    async function openAssistantSession(
      parentSessionId: string,
      purpose: 'discussion' | 'optimization',
      initialPrompt: string,
      workflow?: AssistantWorkflow,
      revision = deltaFeatures.getContentProtectionRevision(),
    ): Promise<string> {
      const services = assistantServices
      if (!services || !isCurrentAssistantAccess(services, revision, parentSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      let assistantSessionId = purpose === 'discussion' ? savedAssistantSession(parentSessionId) : undefined
      let isCreated = false
      if (assistantSessionId) {
        if (services.sessions.list.getSnapshot().byId?.[assistantSessionId] === undefined) assistantSessionId = undefined
        else if (!isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
          throw new Error('Delta Assistant: session protected or unavailable')
        }
      }
      if (!assistantSessionId) {
        const parent = services.sessions.list.getSnapshot().byId?.[parentSessionId]
        assistantSessionId = await services.sessions.create({
          agentPreset: ASSISTANT_PRESET,
          ...(parent?.workspaceId ? { workspaceId: parent.workspaceId } : {}),
        })
        isCreated = true
      }
      if (parentSessionId === assistantSessionId ||
          !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      const lease = retainAssistantAccess(services, assistantSessionId)
      try {
        if (!await lease.ready() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
          throw new Error('Delta Assistant: session protected or unavailable')
        }
        if (isCreated) {
          const result = await lease.reference.binding.session.prompt([{ type: 'text', text: initialPrompt }], 'queue')
          if (!result.ok) throw new Error(result.error?.message || 'Assistant prompt was rejected')
        }
      } finally { lease.release() }
      if (!isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) {
        throw new Error('Delta Assistant: session protected or unavailable')
      }
      if (purpose === 'discussion') rememberAssistantSession(parentSessionId, assistantSessionId)
      if (workflow) assistantWorkflows.set(assistantSessionId, workflow)
      await Promise.resolve(services.sidebarRight.openResource(assistantAddress(parentSessionId, assistantSessionId, purpose)))
      return assistantSessionId
    }
    async function queueMainCorrection(parentSessionId: string, assistantSessionId: string, correction: string, revision: number): Promise<boolean> {
      const services = assistantServices
      if (!services || !correction.trim() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId) ||
          savedAssistantSession(parentSessionId) !== assistantSessionId) return false
      const lease = retainAssistantAccess(services, parentSessionId)
      try {
        if (!await lease.ready() || !isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)) return false
        const result = await lease.reference.binding.session.prompt([{
          type: 'text', text: `User correction from the Delta side conversation. Treat this as the user's queued instruction for the main task:\n\n${correction.trim()}`,
        }], 'queue')
        return result.ok && isCurrentAssistantAccess(services, revision, parentSessionId, assistantSessionId)
      } finally { lease.release() }
    }
    function preferenceRow(title: string, description: string, isEnabled: boolean, onChange: (next: boolean) => void): unknown {
      return el('div', { className: 'dtd-preference-row' },
        el('div', { className: 'dtd-preference-copy' }, el('strong', null, title), el('p', null, description)),
        el('button', { type: 'button', role: 'switch', 'aria-label': title, 'aria-checked': isEnabled,
          className: `dtd-switch${isEnabled ? ' dtd-switch-on' : ''}`,
          onClick: () => onChange(!isEnabled) }, isEnabled ? '●' : '○'))
    }
    function FeaturePreferencesSection(): unknown {
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const prefs = useFeaturePreferences(React)
      return el('section', { className: 'dtd-feature-settings', 'aria-label': copy.ui.contextFeatures },
        el('h3', null, copy.ui.contextFeatures), el('p', null, copy.ui.contextFeaturesDescription),
        preferenceRow(copy.ui.showDeepSeekAccountInfo, copy.ui.showDeepSeekAccountInfoDescription,
          prefs.showDeepSeekAccountInfo, value => updateFeaturePreference('showDeepSeekAccountInfo', value)),
        preferenceRow(copy.ui.showModelInfo, copy.ui.showModelInfoDescription,
          prefs.showModelInfo, value => updateFeaturePreference('showModelInfo', value)),
        preferenceRow(copy.ui.inputOptimization, copy.ui.inputOptimizationDescription,
          prefs.inputOptimization, value => updateFeaturePreference('inputOptimization', value)),
        null)
    }
    function PreferenceBackupSection({ controller }: DeltaProps): unknown {
      const { copy } = useCopy(controller)
      const [draft, setDraft] = React.useState('')
      const [feedback, setFeedback] = React.useState<'applied' | 'invalid' | 'unavailable' | ''>('')
      return el('section', { className: 'dtd-preference-backup', 'aria-label': copy.ui.preferenceBackupTitle },
        el('h3', null, copy.ui.preferenceBackupTitle),
        el('p', null, copy.ui.preferenceBackupDescription),
        el('div', { className: 'dtd-context-actions' },
          el('button', { type: 'button', className: 'dtd-context-action', onClick: () => {
            if (!controller.isActive()) return
            setDraft(createClientPreferenceBackup(controller.getSnapshot().mode))
            setFeedback('')
          } }, copy.ui.preferenceBackupGenerate),
          el('button', { type: 'button', className: 'dtd-context-action', disabled: !draft.trim(), onClick: () => {
            setFeedback(restoreClientPreferenceBackup(controller, draft))
          } }, copy.ui.preferenceBackupRestore)),
        el('textarea', {
          'aria-label': copy.ui.preferenceBackupText, value: draft, rows: 7,
          maxLength: MAX_PREFERENCE_BACKUP_LENGTH, spellCheck: false,
          onChange: (event: { currentTarget: { value: string } }) => {
            setDraft(event.currentTarget.value); setFeedback('')
          },
        }),
        feedback ? el('p', { role: 'status', className: 'dtd-context-feedback' },
          feedback === 'applied' ? copy.ui.preferenceBackupApplied :
            feedback === 'invalid' ? copy.ui.preferenceBackupInvalid : copy.ui.preferenceBackupUnavailable) : null)
    }
    function AccountSummarySection({ controller, summary }: DeltaProps & { summary: ClientAccountSummary }): unknown {
      const { copy } = useCopy(controller)
      const account = React.useSyncExternalStore(summary.subscribe, summary.getSnapshot)
      if (account.status === 'hidden') return null
      const signedIn = account.status !== 'signed-out'
      const rows = (wallets: readonly AccountWalletSummary[]) => wallets.length
        ? wallets.map(wallet => el('span', { key: wallet.currency }, wallet.currency + ' ' + wallet.balance))
        : el('span', null, copy.ui.accountWalletEmpty)
      return el('section', { className: 'dtd-feature-settings', 'aria-label': copy.ui.accountWalletTitle },
        el('h3', null, copy.ui.accountWalletTitle),
        el('p', null, signedIn ? copy.ui.accountWalletDescription : copy.ui.accountWalletSignedOut),
        signedIn ? el('div', { className: 'dtd-context-actions' },
          el('button', { type: 'button', className: 'dtd-context-action', disabled: account.status === 'loading',
            onClick: () => { if (controller.isActive()) void summary.refresh(account) } }, copy.ui.accountWalletRefresh),
          account.usageUrl ? el('button', { type: 'button', className: 'dtd-context-action',
            onClick: () => {
              if (!controller.isActive()) return
              const url = summary.usageUrlFor(account)
              if (url && typeof window.open === 'function') window.open(url, '_blank', 'noopener,noreferrer')
            } }, copy.ui.accountWalletUsage) : null) : null,
        account.status === 'loading' ? el('p', { role: 'status' }, copy.ui.accountWalletLoading) :
          account.status === 'unavailable' ? el('p', { role: 'status' }, copy.ui.accountWalletUnavailable) :
          account.status === 'loaded' ? el('div', { role: 'status' },
            el('div', { className: 'dtd-context-actions' }, el('strong', null, copy.ui.accountWalletRecharge), ...[rows(account.wallets)]),
            el('div', { className: 'dtd-context-actions' }, el('strong', null, copy.ui.accountWalletBonus), ...[rows(account.bonusWallets)])) : null)
    }
    function ModelLabelExtension(props: AssistantSlotProps & {
      provider?: { id?: string; name?: string }
      model?: { name?: string; reasoning?: {
        efforts?: readonly { id: string; name: string }[]
      } }
      placement?: string
    }): unknown {
      const prefs = useFeaturePreferences(React)
      // The Host's public model catalog owns the effort choices. This
      // non-interactive label only describes what the native selector already
      // advertises; it never probes /v1/models or invents a High/Off toggle.
      const modelName = typeof props.model?.name === 'string' ? props.model.name.trim() : ''
      const accountName = props.provider?.id === 'deepseek-account' && props.placement !== 'option' &&
        typeof props.provider.name === 'string' ? props.provider.name.trim() : ''
      const showModel = prefs.showModelInfo && !!modelName
      const showAccount = prefs.showDeepSeekAccountInfo && !!accountName
      if (!showModel && !showAccount) return null
      const publishedEfforts = props.model?.reasoning?.efforts
      const efforts = Array.isArray(publishedEfforts)
        ? publishedEfforts
          .filter(level => typeof level?.id === 'string' && typeof level?.name === 'string' &&
            level.id.length > 0 && level.name.trim().length > 0)
          .slice(0, 8).map(level => level.name.trim().slice(0, 48))
        : []
      // The public label can also be rendered in narrow Host fixtures without
      // the optional Delta locale provider. No effort metadata needs no copy.
      const title = efforts.length > 0
        ? (typeof DICTIONARIES === 'undefined' ? 'Model reasoning levels'
          : (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.modelReasoningLevels) + ': ' + efforts.join(', ')
        : undefined
      return el('span', { className: 'dtd-model-label', 'data-placement': props.placement || '',
        ...(title ? { title } : {}) },
        showAccount ? el('span', { className: 'dtd-model-account' }, accountName) : null,
        showModel ? el('span', { className: 'dtd-model-name' }, modelName) : null)
    }
    function AssistantInputControls(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const prefs = useFeaturePreferences(React)
      const draft = props.useInput(state => state.draft)
      const session = props.useSession(state => state)
      const chat = props.useChat(state => state)
      const draftRef = React.useRef(draft)
      draftRef.current = draft
      const sessionRef = React.useRef(props.sessionId)
      sessionRef.current = props.sessionId
      const [message, setMessage] = React.useState('')
      const alive = React.useRef(true)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const canAct = () => alive.current && sessionRef.current === props.sessionId &&
        isCurrentAssistantAccess(scope, revision, props.sessionId)
      if (!canAct()) return null
      const openDiscussion = async (): Promise<void> => {
        if (!canAct()) return
        const context = conversationContext(chat)
        const status = session.running ? 'running' : session.awaitingFirstTurn ? 'waiting for first turn' : 'idle'
        const prompt = `You are an independent discussion assistant for the user's main task. Discuss ideas, clarify requirements, and help plan corrections. This is a separate session: do not claim to have changed or interrupted the main task.\n\nMain task session: ${props.sessionId}\nMain task status: ${status}\n\nRecent loaded conversation context (may be incomplete):\n${context || '(no conversation excerpt available)'}`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'discussion', prompt, undefined, revision)
          if (canAct()) setMessage(copy.ui.assistantReady)
        } catch (error) { setMessage(error instanceof Error ? error.message : copy.ui.assistantUnavailable) }
      }
      const optimize = async (): Promise<void> => {
        if (!canAct()) return
        if (!prefs.inputOptimization) { setMessage(copy.ui.optimizationDisabled); return }
        if (!draft.trim()) return
        const original = draft
        const context = conversationContext(chat, 1800)
        const prompt = `Optimize the user's draft while preserving its exact intent, facts, tone, and constraints. Do not add unsupported facts, requirements, or commitments. Return only the revised text, with no preface or explanation.\n\nMain task context (use only to resolve references; do not add facts):\n${context || '(none)'}\n\n<original-user-input>\n${original}\n</original-user-input>`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'optimization', prompt, {
            purpose: 'optimization', parentSessionId: props.sessionId, originalDraft: original,
            getCurrentDraft: () => canAct() ? draftRef.current : '',
            inputActions: props.inputActions,
          }, revision)
          if (canAct()) setMessage(copy.ui.assistantReady)
        } catch (error) { setMessage(error instanceof Error ? error.message : copy.ui.assistantUnavailable) }
      }
      return el('div', { className: 'dtd-context-controls' },
        el('div', { className: 'dtd-context-actions' },
          el('button', { type: 'button', className: 'dtd-context-action', onClick: () => { void openDiscussion() } }, copy.ui.discussTask),
          prefs.inputOptimization ? el('button', { type: 'button', className: 'dtd-context-action', disabled: !draft.trim(),
            onClick: () => { void optimize() } }, copy.ui.optimizeDraft) : null),
        message ? el('span', { role: 'status', className: 'dtd-context-feedback' }, message) : null)
    }
    function OptimizerApplyAction(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const workflow = assistantWorkflows.get(props.sessionId)
      const chat = props.useChat(state => state)
      const [open, setOpen] = React.useState(false)
      const [edited, setEdited] = React.useState('')
      const [message, setMessage] = React.useState('')
      const canAct = () => !!workflow && assistantWorkflows.get(props.sessionId) === workflow &&
        isCurrentAssistantAccess(scope, revision, props.sessionId, workflow.parentSessionId)
      if (!workflow || workflow.purpose !== 'optimization' || !props.messageId || !canAct()) return null
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const node = chat.nodes?.values().find(value => {
        const data = value?.data as Record<string, any> | undefined
        return data?.finalNode?.messageId === props.messageId || data?.messageId === props.messageId
      })
      const data = node?.data as Record<string, any> | undefined
      const blocks = Array.isArray(data?.blocks) ? data.blocks : []
      const generated = blocks.flatMap((block: any) => block?.kind === 'text' && typeof block.text === 'string' ? [block.text] : []).join('').trim()
      if (!generated) return null
      return el('div', { className: 'dtd-optimizer-action' },
        el('button', { type: 'button', className: 'dtd-context-action', onClick: () => { if (canAct()) { setEdited(generated); setOpen(true); setMessage('') } } }, copy.ui.previewOptimization),
        open ? el('div', { className: 'dtd-optimizer-preview', role: 'dialog', 'aria-label': copy.ui.previewOptimization },
          el('label', null, copy.ui.previewOptimization),
          el('textarea', { value: edited, rows: 7, onChange: (event: { currentTarget: { value: string } }) => setEdited(event.currentTarget.value) }),
          message ? el('p', { role: 'alert' }, message) : null,
          el('div', { className: 'dtd-context-actions' },
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const current = workflow.getCurrentDraft?.()
              if (!workflow.inputActions || !workflow.getCurrentDraft ||
                  (current !== workflow.originalDraft && current !== workflow.appliedDraft)) {
                setMessage(copy.ui.draftChanged); return
              }
              workflow.inputActions.setDraft(edited)
              workflow.inputActions.persistDraft()
              workflow.appliedDraft = edited
              setMessage(copy.ui.assistantReady)
            } }, copy.ui.applyOptimization),
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const current = workflow.getCurrentDraft?.()
              if (!workflow.inputActions || !workflow.getCurrentDraft ||
                  (current !== workflow.originalDraft && current !== workflow.appliedDraft)) {
                setMessage(copy.ui.draftChanged); return
              }
              workflow.inputActions.setDraft(workflow.originalDraft || '')
              workflow.inputActions.persistDraft()
              workflow.appliedDraft = undefined
              setMessage(copy.ui.restoreOriginal)
            } }, copy.ui.restoreOriginal),
            el('button', { type: 'button', onClick: () => {
              if (!canAct()) return
              const write = navigator.clipboard?.writeText(edited)
              if (write) void write.then(() => setMessage(copy.ui.copied), () => setMessage(copy.ui.copyFailed))
              else setMessage(copy.ui.copyFailed)
            } }, copy.ui.copyText),
            el('button', { type: 'button', onClick: () => setOpen(false) }, copy.ui.cancel))) : null)
    }
    function CompactionActivityAction(props: AssistantSlotProps): unknown {
      useContentProtectionRevision()
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const chat = props.useChat(state => state)
      const status = props.useProjection<{ seq?: number; phase?: 'idle' | 'running' | 'completed' | 'failed'; failed?: boolean }>(
        'deltaContextCompactionStatus')
      if (!allowsAssistantContent(assistantServices, props.sessionId) ||
          !props.messageId || props.messageId !== latestAssistantMessageId(chat) || !status || (status.seq ?? -1) < 0) return null
      const phase = status.failed ? 'failed' : status.phase ?? 'idle'
      if (phase === 'idle') return null
      const checkpoint = latestCheckpoint(chat)
      const failed = phase === 'failed'
      const label = failed ? copy.ui.automaticCompactionFailed
        : phase === 'running' ? copy.ui.compacting : copy.ui.compactionCompleted
      return el('div', { className: `dtd-compaction-event is-${failed ? 'failed' : phase}`,
        role: failed ? 'alert' : 'status', 'aria-live': 'polite' },
        el('span', { className: 'dtd-compaction-event-icon', 'aria-hidden': true },
          failed ? '!' : phase === 'running' ? el('span', { className: 'dtd-compaction-spinner' }) : '✓'),
        el('span', { className: 'dtd-compaction-event-label' }, label),
        !failed && checkpoint ? el('details', { className: 'dtd-compaction-summary-details' },
          el('summary', null, copy.ui.viewCheckpoint),
          el('pre', { className: 'dtd-compaction-summary' }, checkpoint.summary)) : null)
    }
    function EmbeddedAssistantConversation(props: AssistantSlotProps): unknown {
      useContentProtectionRevision()
      const session = props.useSession(state => state)
      const conversation = props.useConversation?.((value: any) => value)
      if (!allowsAssistantContent(assistantServices, props.sessionId)) return null
      const active = !!conversation && (conversation.activeTargets?.size > 0 || !session.blank || session.running)
      const phase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const FixedChatView = (viewProps: { renderSlot(name: string, input: Record<string, unknown>): unknown }): unknown =>
        viewProps.renderSlot('conversation.session', { view: 'chat' })
      return props.renderFactorySlot?.('conversation.content',
        { variant: 'embedded', phase, hero: phase === 'blank' }, { slots: { views: FixedChatView } }) ?? null
    }
    function AssistantTabBody(props: AssistantSlotProps): unknown {
      const revision = useContentProtectionRevision()
      const scope = assistantServices
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const info = props.useTabInfo?.()
      const resource = props.useResource?.<AssistantResource>(info?.tab.contentId || '')
      const mainState = props.useSession(state => state)
      const mainPressure = props.useProjection('contextPressure')
      const breakdown = props.useProjection('contextBreakdown') as Record<string, number> | undefined
      const mainChat = props.useChat(state => state)
      const [correction, setCorrection] = React.useState('')
      const [confirm, setConfirm] = React.useState(false)
      const [feedback, setFeedback] = React.useState('')
      const [correctionOpen, setCorrectionOpen] = React.useState(false)
      const [queuePending, setQueuePending] = React.useState(false)
      const parentId = resource?.value?.parentSessionId
      const assistantId = resource?.value?.assistantSessionId
      const current = React.useRef({ parentId, assistantId, mainSessionId: mainState.sessionId })
      current.current = { parentId, assistantId, mainSessionId: mainState.sessionId }
      const alive = React.useRef(true)
      React.useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
      const canAct = () => !!parentId && !!assistantId && !!resource?.value && alive.current &&
        current.current.parentId === parentId && current.current.assistantId === assistantId &&
        current.current.mainSessionId === parentId && resource.value.protectionRevision === revision &&
        isCurrentAssistantAccess(scope, revision, parentId, assistantId) && hasAssistantAssociation(resource.value)
      React.useEffect(() => {
        setCorrection(''); setConfirm(false); setFeedback(''); setCorrectionOpen(false)
      }, [revision, parentId, assistantId])
      if (!parentId || !assistantId || !canAct()) return null
      const usage = readContextUsage(mainPressure)
      const turns = mainChat.timeline?.turnOrder?.length ?? 0
      const contextExcerpt = conversationContext(mainChat, 3000)
      const mainStatus = mainState.running ? copy.ui.sessionRunning
        : mainState.awaitingFirstTurn ? copy.ui.assistantStarting : copy.ui.sessionIdle
      const checkpoint = latestCheckpoint(mainChat)
      const send = async (): Promise<void> => {
        if (!canAct() || !confirm || !correction.trim() || queuePending) return
        setQueuePending(true)
        try {
          const ok = await queueMainCorrection(parentId, assistantId, correction.trim(), revision)
          if (!canAct()) return
          setFeedback(ok ? copy.ui.correctionQueued : copy.ui.correctionFailed)
          if (ok) { setCorrection(''); setConfirm(false); setCorrectionOpen(false) }
        } catch { if (canAct()) setFeedback(copy.ui.correctionFailed) }
        finally { setQueuePending(false) }
      }
      const conversation = resource?.value
        ? el(props.SessionProvider as any, { session: resource.value.reference },
          el('div', { className: 'dtd-assistant-conversation' }, props.renderSlot?.('delta.assistant.conversation', {}) ?? null)) : null
      return el('section', { className: 'dtd-assistant-panel', 'aria-label': copy.ui.discussTask },
        el('header', { className: 'dtd-assistant-header' },
          el('div', { className: 'dtd-assistant-title-copy' },
            el('strong', null, resource?.value?.purpose === 'optimization' ? copy.ui.optimizeDraft : copy.ui.discussTask),
            el('p', null, copy.ui.assistantContext)),
          el('div', { className: 'dtd-assistant-header-actions' },
            resource?.value?.purpose === 'discussion' ? el('button', { type: 'button', className: 'dtd-assistant-action',
              onClick: () => { if (canAct()) { setCorrectionOpen(true); setConfirm(false); setFeedback('') } } }, copy.ui.queueCorrection) : null,
            assistantServices?.sidebarRight.closeRightbar ? el('button', { type: 'button', className: 'dtd-assistant-close',
              'aria-label': copy.ui.close, title: copy.ui.close,
              onClick: () => assistantServices?.sidebarRight.closeRightbar?.() }, '×') : null)),
        el('details', { className: 'dtd-main-task-status', 'aria-label': copy.ui.mainTaskStatus },
          el('summary', { className: 'dtd-main-task-summary' },
            el('span', { className: `dtd-task-state${mainState.running ? ' is-running' : ''}` }, mainStatus),
            el('span', { className: 'dtd-task-turns' }, `${copy.ui.loadedTurns}: ${turns}`),
            usage ? el('span', { className: 'dtd-task-context' }, `${usage.percent}%`) : null,
            el('span', { className: 'dtd-task-details-label' }, copy.ui.mainTaskStatus)),
          el('div', { className: 'dtd-main-task-details' },
            mainState.lastAgentError ? el('p', { role: 'alert' }, mainState.lastAgentError) : null,
            usage ? el('p', null, `${copy.ui.contextUsage}: ${usage.percent}% (~${usage.used}/${usage.capacity})`) : null,
            breakdown ? el('p', null, `${copy.ui.contextBreakdown}: system ${breakdown.systemTokens ?? 0} · tools ${breakdown.toolsTokens ?? 0} · messages ${breakdown.messageTokens ?? 0}`) : null,
            contextExcerpt ? el('details', { className: 'dtd-checkpoint' },
              el('summary', null, copy.ui.mainContext), el('pre', null, contextExcerpt)) : null,
            checkpoint ? el('details', { className: 'dtd-checkpoint' },
              el('summary', null, copy.ui.checkpoint), el('pre', null, checkpoint.summary)) : null)),
        feedback ? el('p', { className: 'dtd-assistant-feedback', role: 'status' }, feedback) : null,
        conversation,
        correctionOpen ? el('div', { className: 'dtd-correction-overlay', role: 'presentation',
          onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
            if (event.target === event.currentTarget && !queuePending) setCorrectionOpen(false)
          } },
          el('section', { className: 'dtd-correction-dialog', role: 'dialog', 'aria-modal': true,
            'aria-label': copy.ui.queueCorrection },
            el('header', { className: 'dtd-correction-dialog-header' },
              el('strong', null, copy.ui.queueCorrection),
              el('button', { type: 'button', className: 'dtd-assistant-close', 'aria-label': copy.ui.cancel,
                disabled: queuePending, onClick: () => setCorrectionOpen(false) }, '×')),
            el('p', null, copy.ui.queueOnly),
            el('textarea', { value: correction, rows: 5, placeholder: copy.ui.correctionPlaceholder,
              onChange: (event: { currentTarget: { value: string } }) => { setCorrection(event.currentTarget.value); setConfirm(false); setFeedback('') } }),
            confirm ? el('div', { className: 'dtd-correction-confirm' },
              el('p', null, copy.ui.directionChange), el('pre', null, correction),
              el('button', { type: 'button', disabled: !correction.trim() || queuePending, onClick: () => { void send() } },
                queuePending ? copy.ui.assistantStarting : copy.ui.confirmQueue),
              el('button', { type: 'button', disabled: queuePending, onClick: () => setConfirm(false) }, copy.ui.cancel))
              : el('button', { type: 'button', className: 'dtd-context-action', disabled: !correction.trim(),
                onClick: () => setConfirm(true) }, copy.ui.reviewCorrection),
            feedback && correctionOpen ? el('p', { className: 'dtd-assistant-feedback', role: 'status' }, feedback) : null)) : null)
    }

    function useCopy(controller: DeltaController): { state: DeltaState; copy: DeltaCopy } {
      const state = React.useSyncExternalStore(
        callback => controller.subscribe(callback), () => controller.getSnapshot())
      return { state, copy: DICTIONARIES[state.language] ?? DICTIONARIES.en }
    }
    function SettingsSectionIcon(): unknown {
      return el('svg', { viewBox: '0 0 24 24', width: 17, height: 17,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.75,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        el('path', { d: 'M12 21a9 9 0 1 1 8.5-11.9c.5 1.5-.6 3.1-2.2 3.1h-2.1a2 2 0 0 0-2 2c0 .6.2 1.1.6 1.5.5.5.7 1.3.4 2-.5 1.1-1.6 3.3-3.2 3.3Z' }),
        el('circle', { cx: 8.5, cy: 10.5, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 12, cy: 7.5, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 15.5, cy: 10, r: 1, fill: 'currentColor' }),
        el('circle', { cx: 8.5, cy: 15, r: 1, fill: 'currentColor' }))
    }
    function DeltaBrandMark(): unknown {
      return el('span', { 'aria-hidden': true, className: 'dtd-brand-mark' }, 'Δ')
    }
    function DeltaBrandName(): unknown {
      return el('span', { className: 'dtd-brand-name' }, (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title)
    }
    // Published ui-workspace inline list Slot. No native row children, classes,
    // menus, or layout nodes are queried or changed by this indicator.
    function SessionProtectionIndicator({ sessionId }: { sessionId: string }, controller: DeltaController): unknown {
      useContentProtectionRevision()
      const view = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      if (view.mode !== 'delta' || !sessionId) return null
      const state = deltaFeatures.getSnapshot()
      if (state.deletedSessionIds.includes(sessionId)) return null
      const locked = state.lockedSessionIds.includes(sessionId)
      let isInheritedWorkspaceLocked = false
      try { isInheritedWorkspaceLocked = deltaFeatures.isSessionInLockedWorkspace(sessionId) } catch {}
      if (!locked && !isInheritedWorkspaceLocked) return null
      const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
      const label = isInheritedWorkspaceLocked && !locked
        ? copy.workspaceMenu.lockedShieldTitle : copy.sessionMenu.lockedShieldTitle
      return el('span', { className: 'dtd-session-protection-mark', role: 'img',
        title: label, 'aria-label': label },
        el('svg', { width: 14, height: 14, viewBox: '0 0 24 24',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
          strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
          el('rect', { x: 5, y: 10, width: 14, height: 11, rx: 2 }),
          el('path', { d: 'M8 10V7a4 4 0 0 1 8 0v3' })))
    }

    function SessionHoverDetail({ sessionId }: SessionHoverProps, controller: DeltaController): unknown {
      const revision = useContentProtectionRevision()
      const view = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      const hoverSelection = React.useSyncExternalStore<number | null>(
        deltaFeatures.subscribeSessionCatalog,
        () => deltaFeatures.readSessionHoverSelection(sessionId),
      )
      // The published hover Slot is decoration only: no Session binding, raw
      // workspace path or native hover-card layout changes are permitted here.
      if (!controller.isActive() || view.mode !== 'delta' || hoverSelection === null) return null
      // An old rendered button cannot authorize an operation in a later
      // activation or after an appearance/protection transition.
      const isCurrent = (): boolean => controller.isActive() &&
        controller.getSnapshot().mode === 'delta' &&
        controller.getSnapshot().revision === view.revision &&
        revision === deltaFeatures.getContentProtectionRevision() &&
        deltaFeatures.readSessionHoverSelection(sessionId) !== null
      const reportCopy = (isSuccess: boolean): void => {
        if (!isCurrent()) return
        const labels = (DICTIONARIES[controller.getSnapshot().language] ?? DICTIONARIES.en).ui
        showDeltaToast(isSuccess ? labels.copied : labels.copyFailed)
      }
      const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId
      const copy = DICTIONARIES[view.language] ?? DICTIONARIES.en
      const label = copy.ui.sessionId
      const updatedAt = hoverSelection > 0 ? hoverSelection : undefined
      const updatedText = updatedAt === undefined ? undefined : new Date(updatedAt).toLocaleString(
        view.language === 'zh' ? 'zh-CN' : 'en-US',
        { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
      return el('div', { className: 'dtd-session-meta', role: 'group', 'aria-label': label },
        el('span', { className: 'dtd-session-meta-label' }, label),
        el('span', { className: 'dtd-session-meta-id' }, shortId),
        el('button', {
          type: 'button', className: 'dtd-session-meta-copy',
          'aria-label': copy.ui.copySessionId,
          // Do not trigger the Host row's open/select action when copying.
          onPointerDown: (event?: { stopPropagation?: () => void }) => event?.stopPropagation?.(),
          onClick: (event?: { stopPropagation?: () => void }) => {
            event?.stopPropagation?.()
            if (!isCurrent()) return
            try {
              const request = typeof navigator !== 'undefined' ? navigator.clipboard?.writeText(sessionId) : undefined
              if (!request) { reportCopy(false); return }
              void Promise.resolve(request).then(() => reportCopy(true), () => reportCopy(false))
            } catch { reportCopy(false) }
          },
        }, copy.ui.copy),
        updatedText ? el('span', { className: 'dtd-session-meta-updated' },
          copy.ui.sessionLastUpdated + ': ',
          el('time', { dateTime: new Date(updatedAt!).toISOString() }, updatedText)) : null)
    }
    function registerNativeMenuContributions(scope: ClientContext, controller: DeltaController): void {
      try { scope.inject(['contextMenus'], menuScope => {
        const contextMenus = menuScope.contextMenus
        if (typeof menuScope.effect !== 'function' ||
            !contextMenus || typeof contextMenus.register !== 'function') return
        const iconMov = () => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          el('path', { d: 'M15 3h6v6' }),
          el('path', { d: 'M10 14 21 3' }),
          el('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }))
        const iconLock = (isUnlocked: boolean) => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          el('rect', { x: 4, y: 11, width: 16, height: 10, rx: 2, ry: 2 }),
          el('path', { d: isUnlocked ? 'M7 11V7a5 5 0 0 1 9.9-1' : 'M7 11V7a5 5 0 0 1 10 0v4' }))
        const iconTrash = () => el('svg', { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          el('path', { d: 'M3 6h18' }),
          el('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
          el('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }))


        menuScope.effect(() => {
          try {
            return registerClientFeatureGroup(track => {
              let isLive = true
              // Registered last so invalidation runs before Host disposers.
              const validId = (value: unknown): value is string =>
                typeof value === 'string' && value.trim().length > 0
              const sessionAvailable = (id: unknown): id is string =>
                isLive && validId(id) && !deltaFeatures.isDeleted(id)
              const observe = () => [deltaFeatures, controller]
              const registerMenu = contextMenus.register.bind(contextMenus)
              try {
              track(scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.move', key: 'delta.session.move' }, iconMov))
              track(scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.lock', key: 'delta.session.lock' }, () => iconLock(false)))
              track(scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.unlock', key: 'delta.session.unlock' }, () => iconLock(true)))
              track(scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.delete', key: 'delta.session.delete' }, iconTrash))
              track(registerMenu({
                id: 'session.delta.move',
                target: 'session',
                order: 400,
                observe,
                resolve: t => {
                  const id = t?.sessionId
                  if (!sessionAvailable(id)) return []
                  const title = typeof t.displayTitle === 'string' ? t.displayTitle : ''
                  return [{
                    id: 'delta-move',
                    label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.moveSession,
                    icon: { key: 'delta.session.move' },
                    run: () => { if (sessionAvailable(id)) deltaFeatures.openMoveDialog(id, title) },
                  }]
                },
              }))
              track(registerMenu({
                id: 'session.delta.lock',
                target: 'session',
                order: 580,
                observe,
                resolve: t => {
                  const id = t?.sessionId
                  if (!sessionAvailable(id)) return []
                  const title = typeof t.displayTitle === 'string' ? t.displayTitle : ''
                  const locked = deltaFeatures.isLocked(id)
                  const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                  return [{
                    id: 'delta-lock',
                    label: locked ? copy.sessionMenu.unlockSession : copy.sessionMenu.lockSession,
                    icon: { key: locked ? 'delta.session.unlock' : 'delta.session.lock' },
                    afterContent: true,
                    run: () => {
                      if (!sessionAvailable(id)) return
                      if (deltaFeatures.isLocked(id)) {
                        deltaFeatures.openUnlockPinDialog(id)
                      } else if (deltaFeatures.getSnapshot().hasPin) {
                        void deltaFeatures.lockSession(id).then(res => {
                          if (res.ok && isLive) showDeltaToast((DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.lockedToast)
                        })
                      } else {
                        deltaFeatures.openSetPinDialog(id, title)
                      }
                    },
                  }]
                },
              }))
              track(registerMenu({
                id: 'session.delta.delete',
                target: 'session',
                order: 650,
                observe,
                resolve: t => {
                  const id = t?.sessionId
                  if (!sessionAvailable(id)) return []
                  const title = typeof t.displayTitle === 'string' ? t.displayTitle : ''
                  return [{
                    id: 'delta-delete',
                    label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.deleteSession,
                    icon: { key: 'delta.session.delete' },
                    danger: true,
                    separatorBefore: true,
                    afterContent: true,
                    run: () => { if (sessionAvailable(id)) deltaFeatures.openDeleteDialog(id, title) },
                  }]
                },
              }))
              try { track(registerMenu({
                id: 'workspace.delta.lock',
                target: 'workspace',
                order: 250,
                observe,
                resolve: t => {
                  const id = [t?.workspaceId, t?.id, t?.path].find(validId)
                  if (!isLive || !id) return []
                  const title = typeof t.displayTitle === 'string' ? t.displayTitle :
                    typeof t.title === 'string' ? t.title : undefined
                  const locked = deltaFeatures.isWorkspaceLocked(id)
                  const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                  return [{
                    id: 'delta-workspace-lock',
                    label: locked ? copy.workspaceMenu.unlockWorkspace : copy.workspaceMenu.lockWorkspace,
                    icon: { key: locked ? 'delta.session.unlock' : 'delta.session.lock' },
                    run: () => {
                      if (!isLive) return
                      if (deltaFeatures.isWorkspaceLocked(id)) {
                        deltaFeatures.openUnlockWorkspaceDialog(id)
                      } else if (deltaFeatures.getSnapshot().hasPin) {
                        void deltaFeatures.lockWorkspace(id).then(res => {
                          if (res.ok && isLive) showDeltaToast((DICTIONARIES[language()] ?? DICTIONARIES.en).workspaceMenu.lockedToast)
                        })
                      } else {
                        deltaFeatures.openSetPinWorkspaceDialog(id, title)
                      }
                    },
                  }]
                },
              })) } catch { /* optional workspace target */ }
              track(() => { isLive = false })
              } catch (error) { isLive = false; throw error }
            })
          } catch { /* optional menu group rolled back; native menus remain */ }
        }, 'delta-suite: session move/lock/delete menus')
      }) } catch { /* unsupported optional Host menu service */ }
    }

function PersonalizationSection({ controller }: DeltaProps): unknown {
      deltaFeatures.ensureLoaded()
      const { state, copy } = useCopy(controller)
      const fSnap = React.useSyncExternalStore(deltaFeatures.subscribe, deltaFeatures.getSnapshot)
      // Describe implemented compatibility and native fallbacks, not a
      // live capability claim or completed acceptance for the installed Host.
      const nativeFeatureNotes = [
        copy.ui.integrationSidebar,
        copy.ui.integrationCollapse,
        copy.ui.integrationDeletion,
        copy.ui.integrationRunning,
      ]
      return el('section', { className: 'dtd-page', 'data-delta-personalization': '',
        'aria-label': copy.ui.personalization },
        el('div', { className: 'dtd-preference-row' },
          el('div', { className: 'dtd-preference-copy' },
            el('strong', null, copy.ui.appearance),
            el('p', null, copy.ui.appearanceDescription)),
          el('div', { className: 'dtd-segment', role: 'group', 'aria-label': copy.ui.theme },
            (['delta', 'official'] as const).map(mode =>
              el('button', { key: mode, type: 'button', 'aria-pressed': state.mode === mode,
                className: state.mode === mode ? 'dtd-active' : '',
                onClick: () => controller.setMode(mode) },
                mode === 'delta' ? copy.ui.delta : copy.ui.official)))),

        // Host capability report stays visible in both themes and in the
        // installed-bundle Settings entry. An unsupported native operation
        // is never enabled merely because the user switched appearance.
        el('section', { className: 'dtd-integration-status', 'data-delta-integration-status': '',
          'aria-label': copy.ui.integrationTitle },
          el('strong', null, copy.ui.integrationTitle),
          el('p', { className: 'dtd-integration-summary' }, copy.ui.integrationSummary),
          el('ul', { className: 'dtd-integration-list' },
            nativeFeatureNotes.map((label, idx) =>
              el('li', { key: idx },
                el('span', null, label),
                el('span', { className: 'dtd-integration-native' }, copy.ui.integrationNative)))),
          el('p', { className: 'dtd-integration-reasoning' }, copy.ui.integrationReasoning),
          el('p', { className: 'dtd-integration-guidance' }, copy.ui.integrationGuidance)),

        el('div', { className: 'dtd-privacy-card', 'data-delta-privacy-card': '' },
          el('div', { className: 'dtd-privacy-header' },
            el('strong', null, copy.privacy.title)),
          el('div', { className: 'dtd-pin-manage-row' },
            el('span', null, `${copy.sessionMenu.pinSettingsTitle}: ${fSnap.hasPin ? copy.sessionMenu.pinSetStatus : copy.sessionMenu.pinUnsetStatus}`),
            fSnap.hasPin ? el('button', {
              type: 'button',
              className: 'dtd-btn-secondary',
              onClick: () => deltaFeatures.openClearPinDialog(),
            }, copy.sessionMenu.clearPin) : null)),
        el('p', { className: 'dtd-current', role: 'status' },
          copy.ui.status + ': ' + (state.mode === 'delta' ? copy.ui.delta : copy.ui.official)),
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, copy.ui.unavailable) : null,
        el('details', { className: 'dtd-advanced-features' },
          el('summary', null, copy.ui.contextFeatures),
          el(FeaturePreferencesSection, {}),
          el(PreferenceBackupSection, { controller }),
          clientAccountSummaries.has(controller) ? el(AccountSummarySection, {
            controller, summary: clientAccountSummaries.get(controller)!,
          }) : null))
    }
    return {
      inject: [],
      apply(ctx) {
        try {
          ctx.inject(['slots'], (scope) => {
            try {
              if (typeof scope.slots?.inject !== 'function' || typeof scope.slots?.register !== 'function' ||
                  typeof scope.effect !== 'function' || typeof scope.inject !== 'function') {
                throw new Error('Host Slots registration is incomplete')
              }
              const controller = createController() as DeltaController & {
                syncLanguage(): void
                bindTheme(theme: ThemeApi | undefined): void
                bindLayout(layout: LayoutApi | undefined): void
                bindSidebarRight(sidebarRight: SidebarRightApi | undefined): void
              }
              const accountSummary = createClientAccountSummary()
              clientAccountSummaries.set(controller, accountSummary)
              scope.effect(() => () => accountSummary.dispose(), 'delta-suite: account summary ownership')
              try { scope.inject(['accountUi', 'remote', 'remote.account', 'remoteAccess'], accountScope => {
                accountScope.effect(() => accountSummary.bind(accountScope), 'delta-suite: public account summary')
              }) } catch { /* missing public account capabilities */ }
              const bindThemeReference = createClientBindingLifetime()
              const bindLayoutReference = createClientBindingLifetime()
              const bindRightReference = createClientBindingLifetime()
              scope.effect(() => {
                // Optional visual resources must not prevent public Slot registration.
                const releaseOwnedStyle = mountClientOwnedStyle(OWNED_CSS, 'plugin', DELTA_SUITE_OWNER)
                const releaseLocale = bindClientLocale(scope, value => { currentHostLocale = value }, () => controller.syncLanguage())

                const appearance = createClientAppearancePatch()
                // The native layout has no public fixed-navigation setting.
                // Install only the scoped CSS fallback; no node reparenting.
                let releaseSidebarLayout: (() => void) | undefined
                const syncAppearance = (): void => {
                  const isDelta = controller.getSnapshot().mode === 'delta'
                  appearance.sync(isDelta)
                  if (isDelta && !releaseSidebarLayout) {
                    try { releaseSidebarLayout = installClientSidebarLayoutPatch() } catch {}
                  } else if (!isDelta && releaseSidebarLayout) {
                    // Retain the disposer if removal fails, so returning to
                    // Delta cannot stack a second copy over the first.
                    try {
                      releaseSidebarLayout()
                      releaseSidebarLayout = undefined
                    } catch { /* retry only on a later state transition */ }
                  }
                }
                syncAppearance()
                deltaFeatures.ensureLoaded()
                const stopAppearance = controller.subscribe(syncAppearance)
                // DOM-less Host/test runtimes cannot mount the ZIP's DOM-based
                // presentation, but public feature slots must still register.
                // Legacy DOM-based protection is deliberately not mounted.
                // Host-side business authorization remains authoritative.
                // Native sidebar, session-menu and account chrome remain Host-owned.
                // Harness owns native image input and model capabilities.

                // Harness owns built-in Slots and Locale services.
                // Delta contributes only through declared public slots and its own copy.
                // Do not suppress Host slot entries or modify Host translation methods.
                // Unsupported native UI adjustments remain under Harness ownership.

                return () => {
                  releaseLocale()
                  // Cleanup continues even if an optional resource fails.
                  for (const release of [
                    () => stopAppearance(),
                    () => { releaseSidebarLayout?.(); releaseSidebarLayout = undefined },
                    () => appearance.dispose(),
                    () => clearDeltaToasts(),
                    () => releaseOwnedStyle?.(),
                    () => controller.dispose(),
                  ]) {
                    try { release() } catch {}
                  }
                }
              }, 'delta-suite: personalization resource ownership')

              const settingsModules: ReadonlyArray<{
                id: string
                order: number
                content: (props: DeltaProps) => unknown
                icon: (props: DeltaProps) => unknown
              }> = [
                {
                  id: 'delta.personalization',
                  order: 18,
                  content: PersonalizationSection,
                  icon: SettingsSectionIcon,
                },
              ]
              for (const feature of settingsModules) {
                // Keep the public Settings section visible under an explicit
                // Suite name in both Delta and Official theme modes.
                try { scope.slots.inject('settings.section', () => scope.slots.register({
                  name: 'settings.section',
                  id: feature.id,
                  order: feature.order,
                  label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title,
                  inject: () => ({ controller }),
                }, feature.content)) } catch { /* unsupported optional Host surface */ }
                try { scope.slots.inject('settings.section.icon', () => scope.slots.register({
                  name: 'settings.section.icon',
                  id: feature.id,
                  order: feature.order,
                }, feature.icon)) } catch { /* unsupported optional Host surface */ }
                // Also expose the same form through the public Plugins tab,
                // without modifying any native Settings DOM or controls.
                try { scope.slots.inject('settings.plugins.tab', () => scope.slots.register({
                  name: 'settings.plugins.tab',
                  id: 'delta.suite.configuration',
                  order: 70,
                  label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title,
                  inject: () => ({ controller }),
                }, feature.content)) } catch { /* unsupported optional Host surface */ }
              }

              // Harness' Installed plugins bundle detail is a separate public,
              // keyed seat from Settings. Show the same live Suite configuration
              // in the installed bundle rather than relying on Settings navigation.
              // The key must be the npm package name, not the Cordis row ID.
              try { scope.slots.inject('plugins.bundle.config', () => scope.slots.register({
                name: 'plugins.bundle.config',
                key: '@fongap-labs/delta-suite',
              }, ({ view }: { view?: 'page' | 'summary' }) => view === 'summary'
                ? null : el(PersonalizationSection, { controller }))) } catch { /* unsupported optional Host surface */ }

              // The input model label is a public, independent preference surface.
              // Do not gate it on optional sessions, resources or sidebarRight
              // services: the native model picker must still work without them.
              try { scope.slots.inject('conversation.input.model.label', () => scope.slots.register({
                name: 'conversation.input.model.label',
                id: 'delta.model.route-label',
              }, ModelLabelExtension)) } catch { /* unsupported optional Host surface */ }

              // ZIP-first: never replace the ZIP sidebar/search/theme. These
              // additional modules only register their own public Host slots.
              scope.effect(() => {
                if (typeof document === 'undefined' || !document.head) return
                const style = document.createElement('style')
                style.dataset.deltaFeatureOnly = ''
                style.textContent = FEATURE_ONLY_CSS
                document.head.appendChild(style)
                return () => { style.parentNode?.removeChild?.(style) }
              }, 'delta-suite: optional feature styles')

              // Harness retains MCP credential configuration, editing and native plugin actions.
              try { scope.inject(['sessions', 'resources', 'sidebarRightTabs', 'sidebarRight'], assistantScope => {
                const capabilities = assistantScope as ClientContext & AssistantServices
                if (typeof capabilities.sessions?.create !== 'function' ||
                    typeof capabilities.sessions?.retain !== 'function' ||
                    typeof capabilities.sessions?.list?.getSnapshot !== 'function' ||
                    typeof capabilities.resources?.register !== 'function' ||
                    typeof capabilities.sidebarRightTabs?.register !== 'function' ||
                    typeof capabilities.sidebarRight?.openResource !== 'function' ||
                    typeof capabilities.slots?.inject !== 'function' ||
                    typeof capabilities.slots?.register !== 'function' ||
                    typeof capabilities.effect !== 'function') return
                assistantScope.effect(() => registerAssistantSurface(capabilities),
                  'delta-suite: context assistant and compaction activity')
              }) } catch { /* optional context services do not block the ZIP UI */ }

              const registerBrand = (
                name: 'sidebar.brand.mark' | 'sidebar.brand.name',
                id: string,
                component: (props: DeltaProps) => unknown,
              ): void => {
                scope.slots.inject(name, () => {
                  let release: (() => void) | undefined
                  const sync = (): void => {
                    const shouldShow = controller.getSnapshot().mode === 'delta'
                    if (shouldShow && !release) {
                      try {
                        const result = scope.slots.register({ name, id, order: -100, ...({ priority: -100 } as any) }, component)
                        release = typeof result === 'function' ? (result as () => void) : () => {}
                      } catch (error) {
                        console.warn('[delta-suite] Brand slot registration skipped:', error)
                      }
                    } else if (!shouldShow && release) {
                      release?.()
                      release = undefined
                    }
                  }
                  sync()
                  const unsubscribe = controller.subscribe(sync)
                  return () => {
                    unsubscribe()
                    release?.()
                    release = undefined
                  }
                })
              }
              try { registerBrand('sidebar.brand.mark', 'delta.brand.mark', DeltaBrandMark) } catch { /* unsupported optional Host surface */ }
              try { registerBrand('sidebar.brand.name', 'delta.brand.name', DeltaBrandName) } catch { /* unsupported optional Host surface */ }


              // The published inline trailing Slot renders status without owning
              // native Session rows. If an older Host lacks it, retain native UI.
              try { scope.slots.inject('sidebar.session.row.trailing', () => scope.slots.register<{ sessionId: string }>({
                name: 'sidebar.session.row.trailing',
                id: 'delta.session.protection',
                order: 450,
              }, props => SessionProtectionIndicator(props, controller))) } catch { /* unsupported optional Host surface */ }

              try { scope.slots.inject('sidebar.session.row.hover', () => scope.slots.register<SessionHoverProps>({
                name: 'sidebar.session.row.hover',
                id: 'delta.session.identity',
                order: 500,
              }, props => SessionHoverDetail(props, controller))) } catch { /* unsupported optional Host surface */ }

              // Guard Host workspace mutations, register session move/lock/delete menus, and project durable session changes.
              try { scope.inject(['workspaces'], workspaceScope => {
                if (typeof workspaceScope.effect !== 'function') return
                const workspaces = workspaceScope.workspaces
                if (!workspaces || typeof workspaces.list?.getSnapshot !== 'function') return

                // Native WorkspaceBrowser and third-party subscribers keep Host ownership.
                const nativeSnapshot = workspaces.list.getSnapshot
                const readNative = () => nativeSnapshot.call(workspaces.list)
                workspaceScope.effect(() => bindWorkspaceReferences(
                  () => deltaFeatures.setWorkspacesApi(workspaces, readNative),
                  () => deltaFeatures.setWorkspacesApi(undefined),
                ).dispose, 'delta-suite: workspaces reference')

                // Host owns native Workspace mutation permissions and UI.
              }) } catch { /* unsupported optional Host service */ }

              try { scope.inject(['sessions', 'uiWorkspace'], searchScope => {
                if (typeof searchScope.effect !== 'function') return
                if (!searchScope.sessions || typeof searchScope.sessions.list?.getSnapshot !== 'function' ||
                    !searchScope.uiWorkspace) return
                const sessionsApi = searchScope.sessions
                const navApi = searchScope.uiWorkspace

                // Native navigation stays intact. Observe confirmed mainView retention
                // rather than recording the target of a possibly rejected navigation.
                // Host Session catalogs are authoritative; Delta filters its own UI only.
                searchScope.effect(() => registerClientFeatureGroup(track => {
                  const binding = bindSessionReferences(() => {
                    deltaFeatures.setSessionsApi(sessionsApi)
                    deltaFeatures.setNavigationApi(navApi)
                  }, () => {
                    try { deltaFeatures.setSessionsApi(undefined) }
                    finally { deltaFeatures.setNavigationApi(undefined) }
                  })
                  track(binding.dispose)
                  track(observeConfirmedMainSession(sessionsApi.list, id => {
                    if (binding.isCurrent()) deltaFeatures.setActiveSessionId(id)
                  }))
                }), 'delta-suite: session and navigation service lifetime')

                // A usable navigation port is required by the palette, not by the
                // independent catalog/protection observer. Keep the latter bound.
                if (typeof navApi.openSession === 'function' && typeof navApi.startSession === 'function' &&
                    typeof searchScope.slots?.inject === 'function' &&
                    typeof searchScope.slots?.register === 'function') {
                  searchScope.effect(() => {
                    try { return installHostSearch(controller, sessionsApi, navApi, searchScope, React) }
                    catch { /* optional search installation must not own Host references */ }
                  }, 'delta-suite: public-slot service-backed search palette')
                }
              }) } catch { /* unsupported optional Host service */ }

              registerNativeMenuContributions(scope, controller)

              let isThemeBound = false
              try { scope.inject(['theme'], themeScope => {
                if (typeof themeScope.effect !== 'function') return
                themeScope.effect(() => bindThemeReference(
                  () => { isThemeBound = true; controller.bindTheme(themeScope.theme) },
                  () => { isThemeBound = false; controller.bindTheme(undefined) },
                ).dispose, 'delta-suite: theme service lifetime')
              }) } catch { /* optional public service */ }
              if (!isThemeBound) controller.bindTheme(undefined)
              try { scope.inject(['layout'], layoutScope => {
                if (typeof layoutScope.effect !== 'function') return
                layoutScope.effect(() => bindLayoutReference(
                  () => controller.bindLayout(layoutScope.layout),
                  () => controller.bindLayout(undefined),
                ).dispose, 'delta-suite: layout service lifetime')
              }) } catch { /* unsupported optional Host service */ }
              try {
                scope.inject(['sidebarRight'], rightScope => {
                  rightScope.effect(() => bindRightReference(
                    () => controller.bindSidebarRight(rightScope.sidebarRight),
                    () => controller.bindSidebarRight(undefined),
                  ).dispose, 'delta-suite: right sidebar service lifetime')
                })
              } catch { /* sidebarRight service is optional */ }
            } catch (error) {
              console.error('[delta-suite] Settings mount failed; native UI preserved:', error)
            }
          })
        } catch (error) {
          console.error('[delta-suite] deferred Settings registration failed; native UI preserved:', error)
        }
      },
    }
  },
})

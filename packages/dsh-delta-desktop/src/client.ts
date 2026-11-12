/**
 * Delta Desktop browser module. It only registers its lazy factory while loading.
 * Layout/session ownership always remains with the official UI plugins.
 */
interface DeltaCopy {
  meta: { title: string; description: string }
  ui: {
    [key: string]: string
    preference: string; theme: string; official: string; delta: string;
    open: string; close: string; conversation: string; sidebar: string;
    status: string; unavailable: string; recovery: string; shortcut: string; themeWaiting: string;
    personalization: string; personalizationDescription: string; enabled: string;
    appearance: string; appearanceDescription: string; hostOwned: string;
    sessionId: string; copySessionId: string; copy: string;
    searchSessions: string; newConversation: string; searching: string; noResults: string;
    integrationTitle: string; integrationSummary: string; integrationSidebar: string;
    integrationCollapse: string; integrationDeletion: string; integrationRunning: string;
    copied: string; copyFailed: string; protectedDefaultWorkspace: string;
    updateNotification: string; settings: string; signIn: string; signOut: string;
    signedIn: string; latestVersion: string; signedOut: string;
    signInRequired: string; signOutFromMenu: string;
    collapseLeftSidebar: string; expandLeftSidebar: string;
    collapseRightSidebar: string; expandRightSidebar: string;
    cannotDeleteSoleWorkspace: string;
    cancel: string; confirm: string; delete: string;
  }
  privacy: {
    title: string; description: string; statusEnforced: string;
    sessionLogBlocked: string; telemetryBlocked: string;
    geolocationOff: string; redactionActive: string;
  }
  sessionMenu: {
    moveSession: string; lockSession: string; unlockSession: string; deleteSession: string;
    moveTitle: string; moveDescription: string; moveEmpty: string; movedToast: string;
    deleteTitle: string; deleteDescription: string; deletedToast: string;
    deleteUngrouped: string; deleteUngroupedTitle: string; deleteUngroupedDescription: string;
    deleteUngroupedLockedWarning: string; deletedUngroupedToast: string;
    unlockFirst: string;
    setPinTitle: string; setPinDescription: string; pinLabel: string; pinConfirmLabel: string;
    pinPlaceholder: string; pinTooShort: string; pinMismatch: string; wrongPin: string;
    lockedShieldTitle: string; lockedShieldDesc: string; unlockViewOnce: string; unlockPermanent: string;
    lockedToast: string; unlockedToast: string;
    pinSettingsTitle: string; pinSetStatus: string; pinUnsetStatus: string;
    clearPin: string; clearPinTitle: string; clearPinDesc: string; pinClearedToast: string;
    copySecret: string; totpLoading: string; totpInitFailed: string;
  }
  networkProxy: {
    nav: string; title: string; description: string; modeLabel: string;
    modeSystem: string; modeDirect: string; modeManual: string;
    httpProxyLabel: string; httpProxyPlaceholder: string;
    httpsProxyLabel: string; httpsProxyPlaceholder: string;
    noProxyLabel: string; noProxyPlaceholder: string;
    save: string; savedToast: string; invalidUrl: string; socksUnsupported: string;
    statusLabel: string; statusSystemEnv: string; statusSystemReg: string;
    statusDirect: string; statusManual: string; note: string;
  }
  searchPalette: {
    triggerHint: string; sidebarPlaceholder: string; placeholder: string;
    clear: string; close: string; searchingContent: string;
    noResults: string; noResultsHint: string; turnLabel: string;
    roleUser: string; roleAssistant: string;
    tabAll: string; tabSession: string; tabWorkspace: string;
    tabPlugin: string; tabSkill: string; tabShortcut: string; tabAction: string;
    kindSession: string; kindContent: string; kindWorkspace: string;
    kindPlugin: string; kindSkill: string; kindCommand: string;
    kindShortcut: string; kindAction: string;
    actionNewConversation: string; actionPlugins: string;
    actionSchedules: string; actionSettings: string;
    actionToggleSidebar: string; actionToggleRightbar: string;
    footerNav: string; footerOpen: string; footerTab: string; footerEsc: string;
  }
}
type Language = 'zh' | 'en'
type Mode = 'delta' | 'official'
type SearchStatus = 'waiting-services' | 'waiting-sidebar' | 'active' | 'disabled'
type DeltaState = Readonly<{ mode: Mode; language: Language; error: boolean; themeReady: boolean; searchStatus: SearchStatus; createAllowed: boolean; revision: number }>
interface DeltaController {
  getSnapshot(): DeltaState
  subscribe(listener: () => void): () => void
  setMode(mode: Mode): void
  toggleSidebar(): void
  openConversation(): void
  openPanel(panelId: 'plugins' | 'schedules'): boolean
  setSearchStatus(status: SearchStatus): void
  setCreateAllowed(isAllowed: boolean): void
  dispose(): void
}
interface AddPluginActionProps { onDismiss?(): void }
interface ReactRootApi {
  createRoot(container: Element): { render(children: unknown): void; unmount(): void }
}
interface MenuItemButtonApi {
  MenuItemButton(props: { icon?: unknown; disabled?: boolean; onSelect?: () => void; children?: unknown }): unknown
}
interface McpConfigSnapshot {
  status?: 'loading' | 'ready' | 'unavailable' | string
  value?: unknown
  base?: unknown
  user?: unknown
  revision?: number
  writable?: boolean
}
interface McpConfigForm {
  getSnapshot(): McpConfigSnapshot
  subscribe(listener: () => void): () => void
  mutate(ops: readonly { op: 'set' | 'unset'; path: (string | number)[]; value?: unknown }[], expectedRevision?: number): Promise<boolean | unknown>
}
interface ConfigFormsApi { get(namespace: string): McpConfigForm | undefined }
interface CredentialRemoteApi {
  set?(request: { ref: string; value: string }): Promise<unknown>
  unset?(request: { ref: string }): Promise<unknown>
}
interface McpManagedServer {
  name: string
  configured: boolean
  status?: { state?: string; reason?: string; [key: string]: unknown }
}
interface McpManagerApi {
  watch?(signal: AbortSignal): AsyncIterable<readonly McpManagedServer[]>
  probe?(name: string, signal: AbortSignal): Promise<unknown>
  restart?(name: string): Promise<unknown>
}
interface McpServices { form?: McpConfigForm; manager?: McpManagerApi }
let deltaSettingsForm: McpConfigForm | undefined
let deltaCredentialRemote: CredentialRemoteApi | undefined
let deltaSettingsVersion = 0
const deltaSettingsListeners = new Set<() => void>()
function publishDeltaSettings(): void {
  deltaSettingsVersion++
  deltaSettingsListeners.forEach(listener => listener())
}
function useDeltaSettingsVersion(React: ReactApi): number {
  return React.useSyncExternalStore(listener => {
    deltaSettingsListeners.add(listener)
    return () => deltaSettingsListeners.delete(listener)
  }, () => deltaSettingsVersion)
}
interface McpDraft {
  name: string
  transport: 'stdio' | 'streamable-http'
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
  enabled: boolean
}

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
interface AssistantChatSnapshot {
  legacy?: { nodes?: readonly Record<string, any>[] }
  nodes?: { values(): readonly Record<string, any>[] }
  timeline?: { turnOrder?: readonly number[] }
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

interface AccessApi {
  /** Official global grant: callback runs only while session/create is allowed. */
  whenAccess(action: string, callback: () => (() => void)): () => void
}
interface DeltaProps { controller: DeltaController }
interface SessionHoverProps { sessionId: string }
interface ReactApi {
  useRef<T>(initial: T): { current: T }
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void
  createElement(type: string | ((props: any) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T | ((state: T) => T)) => void]
  useSyncExternalStore<T = DeltaState>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T
}
interface ThemeApi {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}
interface LayoutApi { toggleSidebar(): void; selectPanel(id: string | null): void }
interface SidebarRightApi { toggleExpanded?(): void; openResource(address: string): unknown; closeRightbar?(): void }
interface SlotsApi {
  inject(name: string, register: () => unknown): void
  register<P = DeltaProps>(options: { name: string; id?: string; key?: string; order?: number; children?: Record<string, { kind: string; scope?: string }> | readonly string[]; label?: () => string; inject?: () => DeltaProps }, component: (props: P) => unknown): unknown
}
interface WorkspaceSnapshot {
  items: readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
  phase?: string
  state?: 'idle' | 'loading' | 'error'
}
interface WorkspacesApi {
  list: {
    getSnapshot(): WorkspaceSnapshot
    subscribe?(listener: () => void): () => void
  }
  delete(workspaceId: string): Promise<unknown>
  archiveSession?(sessionId: string, opts?: { stopActivity?: boolean }): Promise<unknown>
  unarchiveSession?(sessionId: string): Promise<unknown>
}

/** Optional Harness public Client services. All data and navigation remain Host-owned. */
interface SearchSessionRecord {
  id: string
  title?: string
  blank?: boolean
  workspaceId?: string
  updatedAt?: number | string
  running?: boolean
  archived?: boolean
}
interface SearchSessionsApi {
  list: {
    getSnapshot(): { phase?: string; byId: Record<string, SearchSessionRecord>; ids?: readonly string[] }
    subscribe?(listener: () => void): () => void
  }
  cancel?(sessionId: string): Promise<unknown> | void
  search(query: string, signal: AbortSignal): Promise<{
    ok: boolean
    value?: { items: { sessionId: string; snippet: string }[]; hasMore: boolean }
    error?: { message?: string }
  }>
}
interface SearchNavigationApi {
  openSession(sessionId: string, options?: { workspaceId?: string }): void
  startSession(workspaceId?: string): void
  openWorkspace?(workspaceId: string): Promise<void>
}

interface ClientContext {
  get?(name: string): unknown
  theme?: ThemeApi
  layout?: LayoutApi
  sidebarRight?: SidebarRightApi
  workspaces?: WorkspacesApi
  sessions?: SearchSessionsApi
  resources?: ResourceProviderApi
  sidebarRightTabs?: SidebarRightTabsApi
  remoteAccess?: AccessApi
  configForms?: ConfigFormsApi
  remote?: { mcpManager?: McpManagerApi; credentials?: CredentialRemoteApi }
  uiWorkspace?: SearchNavigationApi
  slots: SlotsApi
  /** Cordis child injection waits for optional UI capabilities without blocking the parent. */
  inject(services: string[], callback: (scope: ClientContext) => void): void
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { subscribe?: (listener: () => void) => (() => void) }
}
type FeaturePreferences = Readonly<{
  showDeepSeekAccountInfo: boolean
  showModelInfo: boolean
  inputOptimization: boolean
}>
type FeaturePreferenceKey = keyof FeaturePreferences
const FEATURE_STORAGE_KEY = 'fongap.dsh-delta-desktop.features.v1'
const DEFAULT_FEATURE_PREFERENCES: FeaturePreferences = Object.freeze({
  showDeepSeekAccountInfo: true, showModelInfo: true, inputOptimization: true,
})
function readFeaturePreferences(): FeaturePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(FEATURE_STORAGE_KEY) ?? 'null') as unknown
    if (value && typeof value === 'object') {
      const saved = value as Record<string, unknown>
      const preferences = {
        showDeepSeekAccountInfo: typeof saved.showDeepSeekAccountInfo === 'boolean' ? saved.showDeepSeekAccountInfo : true,
        showModelInfo: typeof saved.showModelInfo === 'boolean' ? saved.showModelInfo : true,
        inputOptimization: typeof saved.inputOptimization === 'boolean' ? saved.inputOptimization : true,
      }
      const isFeaturePreferences = 'showDeepSeekAccountInfo' in saved || 'showModelInfo' in saved || 'inputOptimization' in saved
      if (isFeaturePreferences && Object.keys(saved).some(key => !['showDeepSeekAccountInfo', 'showModelInfo', 'inputOptimization'].includes(key))) {
        try { localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify(preferences)) }
        catch { /* remove retired preference keys when storage permits */ }
      }
      return Object.freeze(preferences)
    }
  } catch { /* blocked or malformed preference storage falls back to defaults */ }
  return DEFAULT_FEATURE_PREFERENCES
}
let featurePreferences = readFeaturePreferences()
const featurePreferenceListeners = new Set<() => void>()
function updateFeaturePreference(key: FeaturePreferenceKey, isEnabled: boolean): void {
  featurePreferences = Object.freeze({ ...featurePreferences, [key]: isEnabled })
  try { localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify(featurePreferences)) }
  catch { /* preference remains available for this runtime */ }
  featurePreferenceListeners.forEach(listener => listener())
}
function subscribeFeaturePreferences(listener: () => void): () => void {
  featurePreferenceListeners.add(listener)
  return () => { featurePreferenceListeners.delete(listener) }
}
function useFeaturePreferences(React: ReactApi): FeaturePreferences {
  return React.useSyncExternalStore(subscribeFeaturePreferences, () => featurePreferences)
}

function readContextUsage(value: unknown): { percent: number; used: number; capacity: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const pressure = value as Record<string, unknown>
  const used = typeof pressure.projectedTokens === 'number' ? pressure.projectedTokens
    : typeof pressure.pressureTokens === 'number' ? pressure.pressureTokens : undefined
  const capacity = typeof pressure.contextWindow === 'number' ? pressure.contextWindow : undefined
  if (used === undefined || capacity === undefined || capacity <= 0) return undefined
  return { percent: Math.min(100, Math.round(used / capacity * 100)), used, capacity }
}
function messageText(node: Record<string, any>): string {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  if (Array.isArray(data.blocks)) return data.blocks.flatMap((block: any) =>
    block?.kind === 'text' && typeof block.text === 'string' ? [block.text] : []).join('')
  if (Array.isArray(data.content)) return data.content.flatMap((part: any) =>
    part?.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('')
  if (typeof data.summary === 'string') return data.summary
  return ''
}
function compactionCheckpointSource(node: Record<string, any>): boolean {
  const data = (node.data && typeof node.data === 'object' ? node.data : node) as Record<string, any>
  const sources = [node.source, data.source, data.message?.source, data.finalNode?.source,
    data.finalNode?.data?.source, data.node?.source]
  return sources.some(source => source?.kind === 'compact-checkpoint')
}
function isCompactionCheckpoint(node: Record<string, any>): boolean {
  return node.kind === 'compaction' || compactionCheckpointSource(node)
}
function conversationContext(chat: AssistantChatSnapshot | undefined, maxChars = 6000): string {
  const nodes = chat?.legacy?.nodes
  if (!Array.isArray(nodes)) return ''
  const excerpts = nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') return []
    const text = messageText(node).trim()
    if (!text) return []
    const kind = isCompactionCheckpoint(node) ? 'Checkpoint'
      : node.kind === 'user' || node.kind === 'steering' ? 'User'
      : node.kind === 'assistant' ? 'Assistant'
        : undefined
    return kind ? [`${kind}: ${text.slice(0, 1600)}`] : []
  })
  let result = ''
  for (const item of excerpts.slice(-8)) {
    const next = result ? `${result}\n\n${item}` : item
    if (next.length > maxChars) {
      const remaining = maxChars - result.length - (result ? 2 : 0)
      if (remaining > 120) result = `${result}${result ? '\n\n' : ''}${item.slice(-remaining)}`
      break
    }
    result = next
  }
  return result
}
function latestCheckpoint(chat: AssistantChatSnapshot | undefined): { summary: string; count?: number; tokens?: number } | undefined {
  const nodes = chat?.legacy?.nodes ?? []
  const node = nodes.filter(value => value && typeof value === 'object' && isCompactionCheckpoint(value)).at(-1)
  const summary = node ? messageText(node) || (typeof node.summary === 'string' ? node.summary
    : typeof node.data?.summary === 'string' ? node.data.summary : undefined) : undefined
  if (!summary) return undefined
  const shadowedItemCount = node?.shadowedItemCount ?? node?.data?.shadowedItemCount
  const shadowedTokenCount = node?.shadowedTokenCount ?? node?.data?.shadowedTokenCount
  return { summary,
    ...(typeof shadowedItemCount === 'number' ? { count: shadowedItemCount } : {}),
    ...(typeof shadowedTokenCount === 'number' ? { tokens: shadowedTokenCount } : {}) }
}
function latestAssistantMessageId(chat: AssistantChatSnapshot | undefined): string | undefined {
  const nodes = chat?.nodes?.values?.() ?? []
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]
    const data = node?.data as Record<string, any> | undefined
    const id = data?.finalNode?.messageId ?? data?.messageId
    if (node?.kind === 'assistant-step' && typeof id === 'string') return id
  }
  return undefined
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

function makeGeolocationDeniedError(): GeolocationPositionError {
  return {
    code: 1,
    message: 'Geolocation permission is disabled by default without explicit authorization.',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

function installClientPrivacyGuards(): () => void {
  const restores: Array<() => void> = []
  if (typeof navigator === 'undefined') return () => {}

  const patchMethod = (target: object | undefined | null, key: string, replacement: unknown): void => {
    if (!target || typeof target !== 'object') return
    const hadOwn = Object.prototype.hasOwnProperty.call(target, key)
    const origDesc = Object.getOwnPropertyDescriptor(target, key)
    const protoDesc = !origDesc ? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) ?? {}, key) : undefined
    const origValue = (target as Record<string, unknown>)[key]
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        writable: true,
        enumerable: origDesc?.enumerable ?? protoDesc?.enumerable ?? true,
        value: replacement,
      })
      restores.push(() => {
        try {
          if (hadOwn && origDesc) Object.defineProperty(target, key, origDesc)
          else {
            delete (target as Record<string, unknown>)[key]
            if (!hadOwn && origValue !== undefined && key in (target as object) === false) {
              Object.defineProperty(target, key, { configurable: true, writable: true, value: origValue })
            }
          }
        } catch {}
      })
    } catch {
      try {
        (target as Record<string, unknown>)[key] = replacement
        restores.push(() => {
          try { (target as Record<string, unknown>)[key] = origValue } catch {}
        })
      } catch {}
    }
  }

  try {
    const geo = (navigator as unknown as { geolocation?: Geolocation }).geolocation
    if (geo && typeof geo === 'object') {
      const deniedAsync = (errorCallback?: PositionErrorCallback | null): void => {
        if (typeof errorCallback !== 'function') return
        const invoke = () => {
          try { errorCallback(makeGeolocationDeniedError()) } catch {}
        }
        if (typeof queueMicrotask === 'function') queueMicrotask(invoke)
        else scheduleTimer(invoke, 0)
      }
      patchMethod(geo, 'getCurrentPosition', (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        deniedAsync(error)
      })
      patchMethod(geo, 'watchPosition', (_success: PositionCallback, error?: PositionErrorCallback | null): number => {
        deniedAsync(error)
        return 0
      })
      patchMethod(geo, 'clearWatch', () => {})
    }
  } catch {}

  try {
    const permissions = (navigator as unknown as {
      permissions?: { query?: (desc: { name?: string }) => Promise<unknown> }
    }).permissions
    const origQuery = permissions?.query
    if (permissions && typeof origQuery === 'function') {
      patchMethod(permissions, 'query', (desc: { name?: string }) => {
        if (desc && desc.name === 'geolocation') {
          return Promise.resolve({
            name: 'geolocation',
            state: 'denied',
            status: 'denied',
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          })
        }
        return origQuery.call(permissions, desc)
      })
    }
  } catch {}

  return () => {
    for (let i = restores.length - 1; i >= 0; i--) {
      try { restores[i]() } catch {}
    }
    restores.length = 0
  }
}

const RUNNING_STATUS_HOST_SELECTOR = '[data-chat-running], [data-chat-running] [role="status"], [class*="runningStatus"], [class*="runningContent"]'

function unwrapCordisOriginal<T>(obj: T): T {
  let cur: unknown = obj
  const sym = typeof Symbol !== 'undefined' ? Symbol.for('cordis.original') : undefined
  for (let i = 0; i < 4 && cur && typeof cur === 'object' && sym && (cur as Record<symbol, unknown>)[sym]; i++) {
    cur = (cur as Record<symbol, unknown>)[sym]
  }
  return cur as T
}

function visitElementTextNodes(root: Node, visitor: (textNode: Node) => void): void {
  if (root.nodeType === 3) {
    visitor(root)
    return
  }
  const children = root.childNodes
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    visitElementTextNodes(children[i], visitor)
  }
}

function normalizeRunningStatusNodesInDoc(onOriginal?: (node: Node, originalValue: string) => void): void {
  if (typeof document?.querySelectorAll !== 'function') return
  const hosts = document.querySelectorAll<HTMLElement>(RUNNING_STATUS_HOST_SELECTOR)
  for (let i = 0; i < hosts.length; i++) {
    visitElementTextNodes(hosts[i], cur => {
      const val = cur.nodeValue ?? ''
      if (val.includes('\u6df1\u5ea6\u6c42\u7d22\u4e2d')) {
        onOriginal?.(cur, val)
        cur.nodeValue = val.replaceAll('\u6df1\u5ea6\u6c42\u7d22\u4e2d', '\u4efb\u52a1\u6267\u884c\u4e2d')
      }
    })
  }
}

function syncModalChromeOverlay(): void {
  const doc = typeof document !== 'undefined' ? document : undefined
  const body = doc?.body
  const root = doc?.documentElement
  if (!body || !root || !doc) return
  const hasModal = root.getAttribute?.('data-delta-ui') === 'delta' &&
    typeof doc.querySelectorAll === 'function' &&
    (['.dtd-search-backdrop', '.dtd-dialog-backdrop'] as const).some(sel =>
      Array.from(doc.querySelectorAll(sel)).some(el => !(el as { hidden?: boolean }).hidden),
    )
  if (!hasModal) {
    root.removeAttribute?.('data-delta-modal-open')
    if (body.style?.getPropertyValue?.('--dsw-specific-sidebar-fill')) {
      body.style.removeProperty?.('--dsw-specific-sidebar-fill')
    }
    return
  }
  root.setAttribute?.('data-delta-modal-open', '1')
  const isDark = Boolean(
    body.hasAttribute?.('data-ds-dark-theme') || root.hasAttribute?.('data-ds-dark-theme'),
  )
  let dimmedColor = isDark ? '#0B0B0D' : '#B2B6BD'
  try {
    const win = typeof window !== 'undefined' ? window : undefined
    const computed = win?.getComputedStyle?.(body)?.getPropertyValue?.('--dtd-chrome-overlay-mask')?.trim()
    if (computed) dimmedColor = computed
  } catch {}
  if (body.style?.getPropertyValue?.('--dsw-specific-sidebar-fill') !== dimmedColor) {
    body.style?.setProperty?.('--dsw-specific-sidebar-fill', dimmedColor, 'important')
  }
}

// The release builder replaces both markers with data from locale/*.json and src/theme.css.
const DICTIONARIES = '__DELTA_DESKTOP_LOCALES__' as unknown as Record<Language, DeltaCopy>
const OWNED_CSS = '__DELTA_DESKTOP_STYLE__'
const DELTA_DESKTOP_OWNER = '@fongap-labs/dsh-delta-desktop'
const STORAGE_KEY = 'fongap.dsh-delta-desktop.v1'
const DELTA_PALETTE = {
  brand: { light: '#286F78', dark: '#60B4BF' },
  brandHover: { light: '#1D5E66', dark: '#75CBD5' },
  brandSoft: { light: '#EAF3F4', dark: '#1C3B40' },
  brandSoftStrong: { light: '#DCEBEC', dark: '#1C3B40' },
  brandBorder: { light: '#9AC9CE', dark: '#357079' },
  invertedInk: { light: '#FFFFFF', dark: '#0E1A1C' },
  canvas: { light: '#FFFFFF', dark: '#121316' },
  surface: { light: '#FFFFFF', dark: '#1C1E22' },
  popupBg: { light: '#FFFFFF', dark: '#1E1E20' },
  sidebarBg: { light: '#F2F4F6', dark: '#181A1E' },
  bubbleBg: { light: '#F4F8F8', dark: '#132225' },
  bubbleBorder: { light: '#C2DFE2', dark: '#244E55' },
} as const

const TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-brand-primary': DELTA_PALETTE.brand,
  '--dsw-alias-brand-primary-invert': { light: '#70B1BA', dark: '#286F78' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': DELTA_PALETTE.brand,
  '--dsw-alias-brand-text': DELTA_PALETTE.brand,
  '--dsw-alias-button-primary-fill': DELTA_PALETTE.brand,
  '--dsw-alias-button-primary-hover': DELTA_PALETTE.brandHover,
  '--dsw-alias-button-info-fill': DELTA_PALETTE.brand,
  '--dsw-alias-button-info-hover': DELTA_PALETTE.brandHover,
  '--dsw-alias-button-ghost-active-fill': DELTA_PALETTE.brandSoft,
  '--dsw-alias-button-ghost-active-border': DELTA_PALETTE.brandBorder,
  '--dsw-alias-label-primary-inverted': DELTA_PALETTE.invertedInk,
  '--dsw-alias-label-primary-foreground': DELTA_PALETTE.invertedInk,
  '--dsw-alias-label-primary-bluish': { light: '#10373C', dark: '#E4F4F6' },
  '--dsw-alias-label-deep-diving': DELTA_PALETTE.brand,
  '--dsw-alias-label-deep-diving-shimmer': { light: '#5CA1AA', dark: '#8EE0EA' },
  '--dsw-alias-state-business-primary': DELTA_PALETTE.brand,
  '--dsw-alias-state-business-tertiary': DELTA_PALETTE.brandSoft,
  '--dsw-alias-link': DELTA_PALETTE.brand,
  '--dsw-alias-bg-base': DELTA_PALETTE.canvas,
  '--dsw-alias-bg-layer-1': DELTA_PALETTE.surface,
  '--dsw-alias-bg-overlay': DELTA_PALETTE.popupBg,
  '--dsw-alias-bg-document-selection': { light: 'rgba(40, 111, 120, 0.22)', dark: 'rgba(96, 180, 191, 0.28)' },
  '--dsw-alias-border-l1': { light: '#E5E9EB', dark: '#31363B' },
  '--dsw-specific-sidebar-fill': DELTA_PALETTE.sidebarBg,
  '--dsw-specific-sidebar-nav-item-active-accent': DELTA_PALETTE.brandSoftStrong,
  '--dsw-specific-bubble': DELTA_PALETTE.bubbleBg,
  '--dsw-specific-bubble-highlight': DELTA_PALETTE.bubbleBorder,
  '--dsw-focus-ring-width': { light: '1px', dark: '1px' },
  '--dsw-focus-ring-color': DELTA_PALETTE.brand,
  '--dsw-alias-focus-stroke': DELTA_PALETTE.brand,
  '--dsw-alias-border-focus': DELTA_PALETTE.brand,
  '--dsw-menu-surface-fill': DELTA_PALETTE.popupBg,
  '--dsw-specific-menu': DELTA_PALETTE.popupBg,
  '--dsw-hovercard-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-tooltip-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-tooltip-key-bg': { light: '#EEF0F2', dark: 'rgba(255, 255, 255, 0.12)' },
  '--dsw-alias-toast-bg': DELTA_PALETTE.popupBg,
  '--dsw-alias-toast-label': { light: '#18181B', dark: '#FAFAFA' },
  '--dsw-alias-menu-group-header-fill': { light: '#F8F9FA', dark: '#242427' },
  '--dsw-alias-bg-module-platform': { light: '#EAF3F4', dark: '#1C2A2D' },
  '--dsw-static-deepseek-50': DELTA_PALETTE.bubbleBg,
  '--dsw-static-deepseek-100': DELTA_PALETTE.brandSoft,
  '--dsw-static-deepseek-200': DELTA_PALETTE.bubbleBorder,
  '--dsw-static-deepseek-300': DELTA_PALETTE.brandBorder,
  '--dsw-static-deepseek-400': { light: '#45939D', dark: '#60B4BF' },
  '--dsw-static-deepseek-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-deepseek-500': DELTA_PALETTE.brand,
  '--dsw-static-deepseek-600': { light: '#1D5E66', dark: '#4A98A3' },
  '--dsw-static-deepseek-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-deepseek-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-50': DELTA_PALETTE.bubbleBg,
  '--dsw-static-blue-50p': DELTA_PALETTE.bubbleBg,
  '--dsw-static-blue-75': { light: '#EAF3F4', dark: '#172B2E' },
  '--dsw-static-blue-100': { light: '#DCEBEC', dark: '#1C3B40' },
  '--dsw-static-blue-300': DELTA_PALETTE.brandBorder,
  '--dsw-static-blue-400': { light: '#5CA1AA', dark: '#60B4BF' },
  '--dsw-static-blue-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-blue-500': DELTA_PALETTE.brand,
  '--dsw-static-blue-600': DELTA_PALETTE.brandHover,
  '--dsw-static-blue-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-blue-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-950': { light: '#0A2528', dark: '#D8F6F9' },
  '--ens-color-primary': DELTA_PALETTE.brand,
  '--ens-color-primary-foreground': DELTA_PALETTE.invertedInk,
  '--ens-color-accent': DELTA_PALETTE.brandSoft,
  '--ens-color-accent-foreground': DELTA_PALETTE.brand,
  '--ens-color-ring': DELTA_PALETTE.brand,
}

function language(): Language {
  const value = typeof document !== 'undefined'
    ? (document.documentElement.lang || navigator.language || 'en') : 'en'
  return /^zh(?:-|$)/i.test(value) ? 'zh' : 'en'
}
function readMode(): Mode {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (value !== null && typeof value === 'object' && 'schema' in value &&
        'mode' in value && value.schema === 1 &&
        (value.mode === 'delta' || value.mode === 'official')) return value.mode
  } catch { /* storage is optional */ }
  return 'delta'
}
function writeMode(mode: Mode): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 1, mode })) }
  catch { /* session-only preference when storage is blocked */ }
}

function createController(): DeltaController {
  const initialMode = readMode()
  let snapshot: DeltaState = Object.freeze({ mode: initialMode, language: language(), error: false, themeReady: false, searchStatus: initialMode === 'official' ? 'disabled' : 'waiting-services', createAllowed: false, revision: 0 })
  let ownedLayer: (() => void) | undefined
  let activeTheme: ThemeApi | undefined
  let activeLayout: LayoutApi | undefined
  let activeSidebarRight: SidebarRightApi | undefined
  let isDisposed = false
  const listeners = new Set<() => void>()
  const publish = (change: Partial<Omit<DeltaState, 'revision'>>): void => {
    if (isDisposed) return
    snapshot = Object.freeze({ ...snapshot, ...change, revision: snapshot.revision + 1 })
    listeners.forEach(listener => listener())
  }
  const applyPalette = (mode: Mode): boolean => {
    ownedLayer?.()
    ownedLayer = undefined
    if (mode === 'official') return true
    try {
      if (!activeTheme || typeof activeTheme.overrideTokens !== 'function') return false
      ownedLayer = activeTheme.overrideTokens(DELTA_DESKTOP_OWNER, TOKENS)
      return typeof ownedLayer === 'function'
    } catch { return false }
  }
  const safeLayout = (command: (layout: LayoutApi) => void): void => {
    if (isDisposed) return
    try {
      if (!activeLayout) throw new Error('Host layout capability is unavailable')
      command(activeLayout)
      publish({ error: false })
    } catch { publish({ error: true }) }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (isDisposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setMode: (mode) => {
      if (isDisposed || (mode !== 'delta' && mode !== 'official')) return
      const success = applyPalette(mode)
      if (!success) { publish({ error: true }); return }
      writeMode(mode)
      publish({ mode, error: false, themeReady: mode === 'delta' && success, searchStatus: mode === 'official' ? 'disabled' : 'waiting-services' })
    },
    toggleSidebar: () => { safeLayout(layout => layout.toggleSidebar()) },
    toggleSidebarSafe: () => {
      if (isDisposed || !activeLayout || typeof activeLayout.toggleSidebar !== 'function') return false
      try { activeLayout.toggleSidebar(); return true } catch { return false }
    },
    toggleRightbarSafe: () => {
      if (isDisposed || !activeSidebarRight || typeof activeSidebarRight.toggleExpanded !== 'function') return false
      try { activeSidebarRight.toggleExpanded(); return true } catch { return false }
    },
    openConversation: () => { safeLayout(layout => layout.selectPanel(null)) },
    openPanel: (panelId) => {
      if (isDisposed || !activeLayout) { publish({ error: true }); return false }
      try { activeLayout.selectPanel(panelId); publish({ error: false }); return true }
      catch { publish({ error: true }); return false }
    },
    setSearchStatus: (status) => { if (!isDisposed && snapshot.searchStatus !== status) publish({ searchStatus: status }) },
    setCreateAllowed: (isAllowed) => { if (!isDisposed && snapshot.createAllowed !== isAllowed) publish({ createAllowed: isAllowed }) },
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      ownedLayer?.()
      ownedLayer = undefined
      activeLayout = undefined
      activeSidebarRight = undefined
      listeners.clear()
    },
    // Used by the owning activation to sync a host language switch.
    syncLanguage: () => { publish({ language: language() }) },
    activate: () => { const ok = applyPalette(snapshot.mode); publish({ error: !ok, themeReady: snapshot.mode === 'delta' && ok }) },
    bindTheme: (theme: ThemeApi | undefined) => {
      if (isDisposed) return
      activeTheme = theme
      const ok = applyPalette(snapshot.mode)
      publish({ error: !ok, themeReady: snapshot.mode === 'delta' && ok })
    },
    bindLayout: (layout: LayoutApi | undefined) => {
      if (isDisposed) return
      activeLayout = layout
    },
    bindSidebarRight: (sidebarRight: SidebarRightApi | undefined) => {
      if (!isDisposed) activeSidebarRight = sidebarRight
    },
  } as DeltaController & {
    syncLanguage(): void
    activate(): void
    toggleSidebarSafe(): boolean
    toggleRightbarSafe(): boolean
    bindSidebarRight(sidebarRight: SidebarRightApi | undefined): void
  }
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
/** Schedules one DOM sync per animation frame while staying safe under synchronous rAF stubs. */
const createFrameScheduler = (run: () => void): { schedule: () => void; cancel: () => void } => {
  let rafId: number | undefined
  let timerId: number | undefined
  let cancelled = false
  return {
    schedule: () => {
      if (cancelled) return
      if (typeof requestAnimationFrame === 'function') {
        if (rafId !== undefined) return
        let hasFired = false
        const nextId = requestAnimationFrame(() => {
          hasFired = true
          rafId = undefined
          if (!cancelled) run()
        })
        if (!hasFired) rafId = nextId
      } else if (typeof setTimeout === 'function') {
        if (timerId !== undefined) return
        timerId = scheduleTimer(() => {
          timerId = undefined
          if (!cancelled) run()
        }, 16)
      } else {
        run()
      }
    },
    cancel: () => {
      cancelled = true
      if (rafId !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
      if (timerId !== undefined) cancelTimer(timerId)
      rafId = undefined
      timerId = undefined
    },
  }
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
    entry.timer = scheduleTimer(() => {
      node.remove()
      toastEntries.delete(entry)
    }, 3000)
    toastEntries.add(entry)
  } catch { /* Toasts must never prevent native interaction. */ }
}
const clearDeltaToasts = (): void => {
  for (const entry of toastEntries) {
    cancelTimer(entry.timer)
    entry.node.remove()
  }
  toastEntries.clear()
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

type ClientProxyMode = 'system' | 'direct' | 'manual'
interface ClientProxyConfig {
  mode: ClientProxyMode
  httpProxy: string
  httpsProxy: string
  noProxy: string
}
interface ClientEffectiveProxy {
  mode: ClientProxyMode
  source: 'system-env' | 'system-registry' | 'direct' | 'manual'
  httpProxy?: string
  httpsProxy?: string
  noProxy: string
}
interface ClientFeatureSnapshot {
  hasPin: boolean
  lockMode?: 'totp' | 'pin' | 'none'
  lockedSessionIds: readonly string[]
  movedSessions: Readonly<Record<string, string>>
  deletedSessionIds: readonly string[]
  tempUnlockedIds: readonly string[]
  proxy: ClientProxyConfig
  effectiveProxy?: ClientEffectiveProxy
  proxyBusy: boolean
  proxyError?: string
  activeSessionId?: string
  revision: number
}

// Self-contained ISO/IEC 18004 QR Code encoder (ECC Level M, Byte mode, Versions 1..10) + SVG builder.
// Zero external dependencies and zero network calls for full privacy compliance.
interface QrVersionSpec {
  size: number
  align: readonly number[]
  ecPerBlock: number
  groups: readonly (readonly [number, number])[]
}

const QR_LEVEL_M_VERSIONS: readonly QrVersionSpec[] = [
  { size: 21, align: [], ecPerBlock: 10, groups: [[1, 16]] },
  { size: 25, align: [6, 18], ecPerBlock: 16, groups: [[1, 28]] },
  { size: 29, align: [6, 22], ecPerBlock: 26, groups: [[1, 44]] },
  { size: 33, align: [6, 26], ecPerBlock: 18, groups: [[2, 32]] },
  { size: 37, align: [6, 30], ecPerBlock: 24, groups: [[2, 43]] },
  { size: 41, align: [6, 34], ecPerBlock: 16, groups: [[4, 27]] },
  { size: 45, align: [6, 22, 38], ecPerBlock: 18, groups: [[4, 31]] },
  { size: 49, align: [6, 24, 42], ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { size: 53, align: [6, 26, 46], ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { size: 57, align: [6, 28, 50], ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
]

const QR_GF_EXP = new Uint8Array(512)
const QR_GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x
    QR_GF_EXP[i + 255] = x
    QR_GF_LOG[x] = i
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1
  }
}

function qrGfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]]
}

function qrRsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  let gen: number[] = [1]
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    const root = QR_GF_EXP[i]
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= qrGfMul(gen[j], root)
    }
    gen = next
  }
  const work = new Uint8Array(data.length + ecCount)
  work.set(data, 0)
  for (let i = 0; i < data.length; i++) {
    const coef = work[i]
    if (coef === 0) continue
    for (let j = 0; j < gen.length; j++) {
      work[i + j] ^= qrGfMul(gen[j], coef)
    }
  }
  return work.slice(data.length)
}

function encodeQrBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)
  const utf8 = unescape(encodeURIComponent(text))
  const out = new Uint8Array(utf8.length)
  for (let i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i)
  return out
}

function encodeQrMatrix(text: string): boolean[][] {
  const bytes = encodeQrBytes(text)
  let version = -1
  let totalDataCap = 0
  for (let v = 1; v <= QR_LEVEL_M_VERSIONS.length; v++) {
    const spec = QR_LEVEL_M_VERSIONS[v - 1]
    const cap = spec.groups.reduce((acc, [cnt, len]) => acc + cnt * len, 0)
    const headerBytes = v >= 10 ? 3 : 2
    if (bytes.length + headerBytes <= cap) {
      version = v
      totalDataCap = cap
      break
    }
  }
  if (version < 1) throw new Error('QR payload exceeds supported Version 10-M capacity')

  const spec = QR_LEVEL_M_VERSIONS[version - 1]
  const n = spec.size

  // Build Byte-mode bit stream
  const bits: number[] = []
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  pushBits(0b0100, 4)
  pushBits(bytes.length, version >= 10 ? 16 : 8)
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8)
  const capBits = totalDataCap * 8
  pushBits(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  let padIdx = 0
  while (bits.length < capBits) {
    pushBits(padIdx % 2 === 0 ? 0xec : 0x11, 8)
    padIdx++
  }

  const dataCw = new Uint8Array(totalDataCap)
  for (let i = 0; i < totalDataCap; i++) {
    let cw = 0
    for (let b = 0; b < 8; b++) cw = (cw << 1) | bits[i * 8 + b]
    dataCw[i] = cw
  }

  // Split blocks, compute RS ECC, and interleave
  const dataBlocks: Uint8Array[] = []
  const eccBlocks: Uint8Array[] = []
  let offset = 0
  for (const [cnt, len] of spec.groups) {
    for (let i = 0; i < cnt; i++) {
      const blk = dataCw.slice(offset, offset + len)
      offset += len
      dataBlocks.push(blk)
      eccBlocks.push(qrRsComputeRemainder(blk, spec.ecPerBlock))
    }
  }
  const codewords: number[] = []
  const maxDataLen = dataBlocks.reduce((m, b) => Math.max(m, b.length), 0)
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) codewords.push(blk[i])
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ecc of eccBlocks) codewords.push(ecc[i])
  }
  const cwBits: number[] = []
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) cwBits.push((cw >>> b) & 1)
  }

  // Setup function patterns
  const modules: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const isFunc: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const setFunc = (r: number, c: number, isDark: boolean) => {
    modules[r][c] = isDark
    isFunc[r][c] = true
  }

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr
        const c = c0 + dc
        if (r < 0 || r >= n || c < 0 || c >= n) continue
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const border = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6)
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        setFunc(r, c, border || center)
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0)
    setFunc(i, 6, i % 2 === 0)
  }

  // Reserve format info strips & set fixed dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true
      isFunc[i][8] = true
    }
  }
  for (let i = 0; i < 8; i++) isFunc[8][n - 8 + i] = true
  for (let i = 0; i < 7; i++) isFunc[n - 7 + i][8] = true
  setFunc(n - 8, 8, true)

  // Alignment patterns
  for (const cy of spec.align) {
    for (const cx of spec.align) {
      if ((cy <= 8 && cx <= 8) || (cy <= 8 && cx >= n - 8) || (cy >= n - 8 && cx <= 8)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dy), Math.abs(dx))
          setFunc(cy + dy, cx + dx, dist === 2 || dist === 0)
        }
      }
    }
  }

  // Version info for Version >= 7
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const vBits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1
      const r = Math.floor(i / 3)
      const c = n - 11 + (i % 3)
      setFunc(r, c, bit)
      setFunc(c, r, bit)
    }
  }

  // Zigzag placement
  let bitIdx = 0
  let isUp = true
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--
    for (let step = 0; step < n; step++) {
      const r = isUp ? n - 1 - step : step
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc
        if (isFunc[r][c]) continue
        modules[r][c] = bitIdx < cwBits.length ? cwBits[bitIdx] === 1 : false
        bitIdx++
      }
    }
    isUp = !isUp
  }

  const writeFormatBits = (grid: Array<Array<boolean>>, mask: number) => {
    const data = (0b00 << 3) | mask // ECC Level M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const fBits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) grid[8][i] = ((fBits >>> (14 - i)) & 1) === 1
    grid[8][7] = ((fBits >>> 8) & 1) === 1
    grid[8][8] = ((fBits >>> 7) & 1) === 1
    grid[7][8] = ((fBits >>> 6) & 1) === 1
    for (let i = 0; i <= 5; i++) grid[i][8] = ((fBits >>> i) & 1) === 1
    for (let i = 0; i < 7; i++) grid[n - 1 - i][8] = ((fBits >>> (14 - i)) & 1) === 1
    for (let i = 0; i < 8; i++) grid[8][n - 8 + i] = ((fBits >>> (7 - i)) & 1) === 1
  }

  const maskBit = (mask: number, r: number, c: number): boolean => {
    switch (mask) {
      case 0: return (r + c) % 2 === 0
      case 1: return r % 2 === 0
      case 2: return c % 3 === 0
      case 3: return (r + c) % 3 === 0
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    }
  }

  const penaltyScore = (grid: Array<Array<boolean>>): number => {
    let score = 0
    for (let r = 0; r < n; r++) {
      let runLen = 1
      for (let c = 1; c < n; c++) {
        if (grid[r][c] === grid[r][c - 1]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let c = 0; c < n; c++) {
      let runLen = 1
      for (let r = 1; r < n; r++) {
        if (grid[r][c] === grid[r - 1][c]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = grid[r][c]
        if (grid[r][c + 1] === v && grid[r + 1][c] === v && grid[r + 1][c + 1] === v) score += 3
      }
    }
    let darkCount = 0
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid[r][c]) darkCount++
      }
    }
    score += Math.floor(Math.abs(darkCount * 100 / (n * n) - 50) / 5) * 10
    return score
  }

  let bestGrid = modules
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    const cand = modules.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : v !== maskBit(mask, r, c))))
    writeFormatBits(cand, mask)
    const sc = penaltyScore(cand)
    if (sc < bestScore) {
      bestScore = sc
      bestGrid = cand
    }
  }
  return bestGrid
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
  subscribe(listener: () => void): () => void
  ensureLoaded(): void
  getWorkspaces(): readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
  setWorkspacesApi(api: WorkspacesApi | undefined): void
  setRawUnarchiveSession(fn: ((sessionId: string) => Promise<unknown>) | undefined): void
  setSessionsApi(api: SearchSessionsApi | undefined): void
  setNavigationApi(api: SearchNavigationApi | undefined): void
  setActiveSessionId(id: string | undefined): void
  getActiveSessionId(): string | undefined
  isLocked(sessionId: string | undefined): boolean
  isProtectedView(sessionId: string | undefined): boolean
  isDeleted(sessionId: string | undefined): boolean
  getWorkspaceCount(): number
  hasSessionsApi(): boolean
  getUngroupedSessionIds(shouldIncludeArchived?: boolean): string[]
  refreshState(): Promise<void>
  saveProxy(next: ClientProxyConfig): Promise<boolean>
  beginTotpSetup(): Promise<{ ok: boolean; setupToken?: string; secret?: string; otpauthUri?: string; error?: string }>
  confirmTotpSetup(sessionId: string, setupToken: string, code: string): Promise<{ ok: boolean; error?: string }>
  lockSession(sessionId: string, newPin?: string): Promise<{ ok: boolean; error?: string }>
  verifyOrUnlockSession(sessionId: string, pin: string, shouldUnlockPermanently: boolean): Promise<{ ok: boolean; error?: string }>
  clearPin(pin: string): Promise<{ ok: boolean; error?: string }>
  moveSession(sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }>
  deleteSession(sessionId: string): Promise<{ ok: boolean; error?: string }>
  deleteUngroupedSessions(sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }>
  closeDialog(): void
  openSetPinDialog(sessionId: string, title?: string): void
  openUnlockPinDialog(sessionId: string): void
  openClearPinDialog(): void
  openMoveDialog(sessionId: string, title?: string): void
  openDeleteDialog(sessionId: string, title?: string): void
  openDeleteUngroupedDialog(): void
  syncLockShieldOverlay(container: HTMLElement | null): void
  onDataMutate(listener: () => void): () => void
  triggerDataRefresh(): void
  resetSessionOverlays(): void
}

function createClientFeatureManager(): ClientFeatureManager {
  let state: ClientFeatureSnapshot = Object.freeze({
    hasPin: false,
    lockMode: 'none',
    lockedSessionIds: Object.freeze([]),
    movedSessions: Object.freeze({}),
    deletedSessionIds: Object.freeze([]),
    tempUnlockedIds: Object.freeze([]),
    proxy: Object.freeze({ mode: 'system', httpProxy: '', httpsProxy: '', noProxy: '' }),
    proxyBusy: false,
    revision: 0,
  })
  const listeners = new Set<() => void>()
  let workspacesApi: WorkspacesApi | undefined
  let rawUnarchiveSessionFn: ((sessionId: string) => Promise<unknown>) | undefined
  let sessionsApi: SearchSessionsApi | undefined
  let navigationApi: SearchNavigationApi | undefined
  let isStateSyncedFromHost = false
  let refreshInFlight: Promise<void> | undefined
  let lastRefreshAttemptAt = 0
  let dialogBackdrop: HTMLElement | undefined
  let shieldEl: HTMLElement | undefined
  let shieldSessionId: string | undefined
  const workspaceNotifyListeners = new Set<() => void>()

  const publish = (patch: Partial<Omit<ClientFeatureSnapshot, 'revision'>>): void => {
    state = Object.freeze({ ...state, ...patch, revision: state.revision + 1 })
    listeners.forEach(fn => {
      try { fn() } catch {}
    })
  }

  const notifyDataApis = (): void => {
    for (const fn of workspaceNotifyListeners) {
      try { fn() } catch {}
    }
  }

  const archiveSessionBestEffort = async (sessionId: string): Promise<void> => {
    const fn = workspacesApi?.archiveSession
    if (typeof fn !== 'function') return
    try {
      await Promise.resolve(fn.call(workspacesApi, sessionId))
    } catch {
      try {
        await Promise.resolve(fn.call(workspacesApi, sessionId, { stopActivity: true }))
      } catch {}
    }
  }

  const unarchiveSessionBestEffort = async (sessionId: string): Promise<void> => {
    const fn = rawUnarchiveSessionFn ?? workspacesApi?.unarchiveSession
    if (typeof fn !== 'function') return
    try {
      await Promise.resolve(fn.call(workspacesApi, sessionId))
    } catch {}
  }

  const syncLockedArchiveMembership = (lockedIds: readonly string[]): void => {
    if (lockedIds.length === 0 || !workspacesApi || typeof workspacesApi.archiveSession !== 'function') return
    const archivedSet = new Set(workspacesApi.list?.getSnapshot?.()?.archivedSessionIds ?? [])
    for (const sid of lockedIds) {
      if (!archivedSet.has(sid)) {
        void archiveSessionBestEffort(sid)
      }
    }
  }

  const applyHostStatePayload = (payload: {
    hasPin?: boolean
    lockMode?: 'totp' | 'pin' | 'none'
    lockedSessionIds?: string[]
    movedSessions?: Record<string, string>
    deletedSessionIds?: string[]
    proxy?: ClientProxyConfig
  }): void => {
    const locked = Array.isArray(payload.lockedSessionIds) ? payload.lockedSessionIds : []
    const deleted = Array.isArray(payload.deletedSessionIds) ? payload.deletedSessionIds : []
    const moved = payload.movedSessions && typeof payload.movedSessions === 'object' ? payload.movedSessions : {}
    publish({
      hasPin: Boolean(payload.hasPin),
      lockMode: payload.lockMode ?? (payload.hasPin ? 'totp' : 'none'),
      lockedSessionIds: Object.freeze([...locked]),
      movedSessions: Object.freeze({ ...moved }),
      deletedSessionIds: Object.freeze([...deleted]),
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => locked.includes(id))),
      ...(payload.proxy ? { proxy: Object.freeze({ ...payload.proxy }) } : {}),
    })
    syncLockedArchiveMembership(locked)
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

  const refreshState = async (): Promise<void> => {
    if (!canCallHostHttp()) return
    if (refreshInFlight) return refreshInFlight
    lastRefreshAttemptAt = Date.now()
    refreshInFlight = (async () => {
      try {
        const [stRes, pxRes] = await Promise.all([
          fetch('/api/delta-desktop/state', { credentials: 'same-origin' }),
          fetch('/api/delta-desktop/proxy', { credentials: 'same-origin' }),
        ])
        if (stRes.ok) {
          const stData = (await stRes.json().catch(() => null)) as { state?: any } | null
          if (stData?.state) {
            isStateSyncedFromHost = true
            applyHostStatePayload(stData.state)
          }
        }
        if (pxRes.ok) {
          const pxData = (await pxRes.json().catch(() => null)) as { proxy?: ClientProxyConfig; effective?: ClientEffectiveProxy } | null
          if (pxData?.proxy) {
            publish({
              proxy: Object.freeze({ ...pxData.proxy }),
              ...(pxData.effective ? { effectiveProxy: Object.freeze({ ...pxData.effective }) } : {}),
              proxyError: undefined,
            })
          }
        }
      } catch {}
      finally {
        refreshInFlight = undefined
      }
    })()
    return refreshInFlight
  }

  const ensureLoaded = (): void => {
    if (isStateSyncedFromHost || refreshInFlight) return
    if (Date.now() - lastRefreshAttemptAt < 1200) return
    void refreshState()
  }

  const saveProxy = async (next: ClientProxyConfig): Promise<boolean> => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    publish({ proxyBusy: true, proxyError: undefined })
    if (!canCallHostHttp()) {
      publish({
        proxy: Object.freeze({ ...next }),
        effectiveProxy: Object.freeze({
          mode: next.mode,
          source: next.mode === 'manual' ? 'manual' : 'direct',
          ...(next.httpProxy ? { httpProxy: next.httpProxy } : {}),
          ...(next.httpsProxy ? { httpsProxy: next.httpsProxy } : {}),
          noProxy: next.noProxy,
        }),
        proxyBusy: false,
      })
      return true
    }
    const res = await postHostJson('/api/delta-desktop/proxy', { ...next })
    if (!res.ok) {
      const reason = res.data?.reason
      const errMsg = reason === 'socks' ? copy.networkProxy.socksUnsupported : copy.networkProxy.invalidUrl
      publish({ proxyBusy: false, proxyError: errMsg })
      return false
    }
    publish({
      proxy: Object.freeze({ ...(res.data?.proxy ?? next) }),
      ...(res.data?.effective ? { effectiveProxy: Object.freeze({ ...res.data.effective }) } : {}),
      proxyBusy: false,
      proxyError: undefined,
    })
    showDeltaToast(copy.networkProxy.savedToast)
    return true
  }

  const generatePreviewBase32Secret = (): string => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const bytes = new Uint8Array(20)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    }
    let out = ''
    for (let i = 0; i < 32; i++) out += alphabet[bytes[i % bytes.length] & 31]
    return out
  }

  const beginTotpSetup = async (): Promise<{
    ok: boolean
    setupToken?: string
    secret?: string
    otpauthUri?: string
    error?: string
  }> => {
    if (!canCallHostHttp()) {
      const secret = generatePreviewBase32Secret()
      return {
        ok: true,
        setupToken: 'preview-setup',
        secret,
        otpauthUri: `otpauth://totp/Delta%20Desktop:DeepSeek%20Harness?secret=${secret}&issuer=Delta%20Desktop&algorithm=SHA1&digits=6&period=30`,
      }
    }
    const res = await postHostJson('/api/delta-desktop/session-lock', { action: 'setup-begin' })
    if (!res.ok || !res.data?.secret || !res.data?.otpauthUri) {
      return { ok: false, error: res.data?.error ?? 'TOTP_INIT_FAILED' }
    }
    return {
      ok: true,
      setupToken: String(res.data.setupToken ?? ''),
      secret: String(res.data.secret),
      otpauthUri: String(res.data.otpauthUri),
    }
  }

  const confirmTotpSetup = async (
    sessionId: string,
    setupToken: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    if (!canCallHostHttp()) {
      const nextLocked = state.lockedSessionIds.includes(sessionId)
        ? state.lockedSessionIds
        : Object.freeze([...state.lockedSessionIds, sessionId])
      publish({
        hasPin: true,
        lockMode: 'totp',
        lockedSessionIds: nextLocked,
        tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
      })
      await archiveSessionBestEffort(sessionId)
      notifyDataApis()
      return { ok: true }
    }
    const res = await postHostJson('/api/delta-desktop/session-lock', {
      action: 'setup-confirm',
      sessionId,
      setupToken,
      code: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    if (res.data?.state) applyHostStatePayload(res.data.state)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    await archiveSessionBestEffort(sessionId)
    notifyDataApis()
    return { ok: true }
  }

  const lockSession = async (sessionId: string, _newPin?: string): Promise<{ ok: boolean; error?: string }> => {
    if (!canCallHostHttp()) {
      const nextLocked = state.lockedSessionIds.includes(sessionId)
        ? state.lockedSessionIds
        : Object.freeze([...state.lockedSessionIds, sessionId])
      publish({
        hasPin: true,
        lockMode: state.lockMode === 'pin' ? 'pin' : 'totp',
        lockedSessionIds: nextLocked,
        tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
      })
      await archiveSessionBestEffort(sessionId)
      notifyDataApis()
      return { ok: true }
    }
    const res = await postHostJson('/api/delta-desktop/session-lock', {
      action: 'lock',
      sessionId,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'LOCK_FAILED' }
    if (res.data?.state) applyHostStatePayload(res.data.state)
    publish({
      tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
    })
    await archiveSessionBestEffort(sessionId)
    notifyDataApis()
    return { ok: true }
  }

  const verifyOrUnlockSession = async (sessionId: string, code: string, shouldUnlockPermanently: boolean): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    if (!canCallHostHttp()) {
      if (shouldUnlockPermanently) {
        publish({
          lockedSessionIds: Object.freeze(state.lockedSessionIds.filter(id => id !== sessionId)),
          tempUnlockedIds: Object.freeze(state.tempUnlockedIds.filter(id => id !== sessionId)),
        })
        await unarchiveSessionBestEffort(sessionId)
        notifyDataApis()
      } else {
        publish({
          tempUnlockedIds: state.tempUnlockedIds.includes(sessionId)
            ? state.tempUnlockedIds
            : Object.freeze([...state.tempUnlockedIds, sessionId]),
        })
      }
      return { ok: true }
    }
    const res = await postHostJson('/api/delta-desktop/session-lock', {
      action: shouldUnlockPermanently ? 'unlock' : 'verify',
      sessionId,
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    if (res.data?.state) applyHostStatePayload(res.data.state)
    if (shouldUnlockPermanently) {
      await unarchiveSessionBestEffort(sessionId)
      notifyDataApis()
    } else if (!state.tempUnlockedIds.includes(sessionId)) {
      publish({ tempUnlockedIds: Object.freeze([...state.tempUnlockedIds, sessionId]) })
    }
    return { ok: true }
  }

  const clearPin = async (code: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = code.trim()
    if (state.lockMode !== 'pin' && !/^\d{6}$/.test(trimmed)) {
      return { ok: false, error: 'TOTP_6_DIGITS_REQUIRED' }
    }
    const previouslyLocked = [...state.lockedSessionIds]
    if (!canCallHostHttp()) {
      publish({ hasPin: false, lockMode: 'none', lockedSessionIds: Object.freeze([]), tempUnlockedIds: Object.freeze([]) })
      for (const sid of previouslyLocked) await unarchiveSessionBestEffort(sid)
      notifyDataApis()
      return { ok: true }
    }
    const res = await postHostJson('/api/delta-desktop/session-lock', {
      action: 'unbind-2fa',
      code: trimmed,
      pin: trimmed,
    })
    if (!res.ok) return { ok: false, error: res.data?.error ?? 'INVALID_TOTP_CODE' }
    const unarchivedIds = Array.isArray(res.data?.unarchivedIds) ? (res.data.unarchivedIds as string[]) : previouslyLocked
    for (const sid of unarchivedIds) {
      await unarchiveSessionBestEffort(sid)
    }
    if (res.data?.state) applyHostStatePayload(res.data.state)
    notifyDataApis()
    return { ok: true }
  }

  const findWorkspaceCwdForSession = (sessionId: string): string | undefined => {
    const wsItems = workspacesApi?.list?.getSnapshot?.()?.items ?? []
    const ws = wsItems.find(item => item.sessionIds?.includes(sessionId))
    if (ws?.path) return ws.path
    const sess = sessionsApi?.list?.getSnapshot?.()?.byId?.[sessionId] as { cwd?: string } | undefined
    return typeof sess?.cwd === 'string' && sess.cwd.trim() ? sess.cwd : undefined
  }

  const moveSession = async (sessionId: string, targetWorkspaceId: string): Promise<{ ok: boolean; error?: string }> => {
    const wsItems = workspacesApi?.list?.getSnapshot?.()?.items ?? []
    const targetWs = wsItems.find(item => item.workspaceId === targetWorkspaceId)
    if (canCallHostHttp()) {
      const res = await postHostJson('/api/delta-desktop/session-move', {
        sessionId,
        targetWorkspaceId,
        ...(targetWs?.path ? { targetPath: targetWs.path } : {}),
        ...(findWorkspaceCwdForSession(sessionId) ? { sourceCwd: findWorkspaceCwdForSession(sessionId) } : {}),
      })
      if (!res.ok) return { ok: false, error: res.data?.error ?? 'MOVE_FAILED' }
      if (res.data?.state) applyHostStatePayload(res.data.state)
    } else {
      publish({ movedSessions: Object.freeze({ ...state.movedSessions, [sessionId]: targetWorkspaceId }) })
      notifyDataApis()
    }
    return { ok: true }
  }

  const deleteSession = async (sessionId: string): Promise<{ ok: boolean; error?: string }> => {
    try { await Promise.resolve(sessionsApi?.cancel?.(sessionId)) } catch {}
    if (canCallHostHttp()) {
      const res = await postHostJson('/api/delta-desktop/session-delete', {
        sessionId,
        ...(findWorkspaceCwdForSession(sessionId) ? { sourceCwd: findWorkspaceCwdForSession(sessionId) } : {}),
      })
      if (!res.ok) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
      if (res.data?.state) applyHostStatePayload(res.data.state)
    } else {
      const nextMoved = { ...state.movedSessions }
      delete nextMoved[sessionId]
      publish({
        movedSessions: Object.freeze(nextMoved),
        lockedSessionIds: Object.freeze(state.lockedSessionIds.filter(id => id !== sessionId)),
        deletedSessionIds: Object.freeze([...state.deletedSessionIds, sessionId]),
      })
      notifyDataApis()
    }
    if (state.activeSessionId === sessionId) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    return { ok: true }
  }

  const getUngroupedSessionIds = (shouldIncludeArchived = false): string[] => {
    const wsSnap = workspacesApi?.list?.getSnapshot?.()
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
      if (!shouldIncludeArchived && archived.has(sid)) continue
      out.push(sid)
    }
    return out
  }

  const deleteUngroupedSessions = async (sessionIds: string[]): Promise<{ ok: boolean; error?: string; deletedIds?: string[] }> => {
    const targets = [...new Set(sessionIds.filter(Boolean))]
    if (targets.length === 0) return { ok: true, deletedIds: [] }
    for (const sid of targets) {
      try { await Promise.resolve(sessionsApi?.cancel?.(sid)) } catch {}
    }
    let deletedIds = targets.filter(id => !state.lockedSessionIds.includes(id))
    if (canCallHostHttp()) {
      const cwds: Record<string, string> = {}
      for (const sid of targets) {
        const cwd = findWorkspaceCwdForSession(sid)
        if (cwd) cwds[sid] = cwd
      }
      const res = await postHostJson('/api/delta-desktop/session-delete-ungrouped', { sessionIds: targets, cwds })
      if (!res.ok) return { ok: false, error: res.data?.error ?? 'DELETE_FAILED' }
      if (Array.isArray(res.data?.deletedIds)) deletedIds = res.data.deletedIds
      if (res.data?.state) applyHostStatePayload(res.data.state)
    } else {
      if (deletedIds.length === 0) return { ok: false, error: 'SESSION_LOCKED' }
      const nextMoved = { ...state.movedSessions }
      for (const sid of deletedIds) delete nextMoved[sid]
      const delSet = new Set(state.deletedSessionIds)
      for (const sid of deletedIds) delSet.add(sid)
      publish({
        movedSessions: Object.freeze(nextMoved),
        deletedSessionIds: Object.freeze([...delSet]),
      })
      notifyDataApis()
    }
    if (state.activeSessionId && deletedIds.includes(state.activeSessionId)) {
      publish({ activeSessionId: undefined })
      try { navigationApi?.startSession() } catch {}
    }
    return { ok: true, deletedIds }
  }

  const closeDialog = (): void => {
    dialogBackdrop?.remove()
    dialogBackdrop = undefined
    syncModalChromeOverlay()
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
    buildCard(card)
    backdrop.appendChild(card)
    document.body.appendChild(backdrop)
    dialogBackdrop = backdrop
    syncModalChromeOverlay()
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

  const openSetPinDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    mountModal(card => {
      const h = document.createElement('h3'); h.textContent = copy.sessionMenu.setPinTitle
      const desc = document.createElement('p'); desc.textContent = copy.sessionMenu.setPinDescription
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
        void confirmTotpSetup(sessionId, activeSetupToken, code).then(res => {
          okBtn.disabled = false
          if (!res.ok) {
            err.textContent = res.error === 'SETUP_EXPIRED' ? copy.sessionMenu.pinMismatch : copy.sessionMenu.wrongPin
            err.hidden = false
            return
          }
          closeDialog()
          showDeltaToast(copy.sessionMenu.lockedToast)
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

  const openMoveDialog = (sessionId: string): void => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    if (state.lockedSessionIds.includes(sessionId)) {
      showDeltaToast(copy.sessionMenu.unlockFirst)
      return
    }
    const items = workspacesApi?.list?.getSnapshot?.()?.items ?? []
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
    if (state.lockedSessionIds.includes(sessionId)) {
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
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : copy.ui.unavailable)
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
    const lockedCount = allIds.filter(id => state.lockedSessionIds.includes(id)).length
    const unlockedIds = allIds.filter(id => !state.lockedSessionIds.includes(id))
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
            showDeltaToast(res.error === 'SESSION_LOCKED' ? copy.sessionMenu.unlockFirst : copy.ui.unavailable)
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

  const syncLockShieldOverlay = (centerCol: HTMLElement | null): void => {
    const activeId = state.activeSessionId
    const needShield = Boolean(
      activeId &&
      state.lockedSessionIds.includes(activeId) &&
      !state.tempUnlockedIds.includes(activeId) &&
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
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const isLegacyPin = state.lockMode === 'pin'
    const overlay = document.createElement('div')
    overlay.className = 'dtd-lock-shield'
    overlay.setAttribute('data-delta-lock-shield', activeId!)
    const card = document.createElement('div')
    card.className = 'dtd-lock-card'
    const iconWrap = document.createElement('div')
    iconWrap.className = 'dtd-lock-icon-wrap'
    iconWrap.appendChild(createLockSvg(22, false))
    const title = document.createElement('h3'); title.textContent = copy.sessionMenu.lockedShieldTitle
    const desc = document.createElement('p'); desc.textContent = copy.sessionMenu.lockedShieldDesc
    const form = document.createElement('div'); form.className = 'dtd-lock-form'
    const pinInput = createCodeInputElement(copy.sessionMenu.pinPlaceholder, isLegacyPin)
    const err = document.createElement('p'); err.className = 'dtd-dialog-error'; err.hidden = true
    const rowBtns = document.createElement('div'); rowBtns.className = 'dtd-dialog-actions'
    const viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.className = 'dtd-btn-primary'
    viewBtn.textContent = copy.sessionMenu.unlockViewOnce
    const permBtn = document.createElement('button'); permBtn.type = 'button'; permBtn.className = 'dtd-btn-secondary'
    permBtn.textContent = copy.sessionMenu.unlockPermanent

    const runUnlock = (shouldUnlockPermanently: boolean) => {
      if (!activeId) return
      const code = pinInput.value.trim()
      if (!isLegacyPin && !/^\d{6}$/.test(code)) {
        err.textContent = copy.sessionMenu.pinTooShort
        err.hidden = false
        return
      }
      viewBtn.disabled = true; permBtn.disabled = true
      void verifyOrUnlockSession(activeId, code, shouldUnlockPermanently).then(res => {
        viewBtn.disabled = false; permBtn.disabled = false
        if (!res.ok) {
          err.textContent = copy.sessionMenu.wrongPin
          err.hidden = false
          return
        }
        overlay.remove()
        if (shieldEl === overlay) { shieldEl = undefined; shieldSessionId = undefined }
        if (shouldUnlockPermanently) showDeltaToast(copy.sessionMenu.unlockedToast)
      })
    }
    viewBtn.addEventListener('click', () => runUnlock(false))
    permBtn.addEventListener('click', () => runUnlock(true))
    pinInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') runUnlock(false) })
    rowBtns.append(permBtn, viewBtn)
    form.append(pinInput, err, rowBtns)
    card.append(iconWrap, title, desc, form)
    overlay.appendChild(card)
    centerCol.appendChild(overlay)
    shieldEl = overlay
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    ensureLoaded,
    getWorkspaces: () => workspacesApi?.list?.getSnapshot?.()?.items ?? [],
    setWorkspacesApi: (api) => {
      workspacesApi = api
      if (api) {
        if (isStateSyncedFromHost) {
          syncLockedArchiveMembership(state.lockedSessionIds)
          notifyDataApis()
        } else {
          ensureLoaded()
        }
      }
    },
    setRawUnarchiveSession: (fn) => { rawUnarchiveSessionFn = fn },
    setSessionsApi: (api) => {
      sessionsApi = api
      if (api) {
        const byId = api.list?.getSnapshot?.()?.byId ?? {}
        const mainSess = Object.values(byId).find(s => ((s as { retainedBy?: { mainView?: number } }).retainedBy?.mainView ?? 0) > 0)
        if (mainSess?.id && state.activeSessionId !== mainSess.id) {
          publish({ activeSessionId: mainSess.id })
        }
        if (isStateSyncedFromHost) notifyDataApis()
        else ensureLoaded()
      }
    },
    setNavigationApi: (api) => { navigationApi = api },
    setActiveSessionId: (id) => {
      if (state.activeSessionId === id) return
      publish({ activeSessionId: id })
    },
    getActiveSessionId: () => state.activeSessionId,
    isLocked: (id) => Boolean(id && state.lockedSessionIds.includes(id)),
    isProtectedView: (id) => Boolean(id && state.lockedSessionIds.includes(id) && !state.tempUnlockedIds.includes(id)),
    isDeleted: (id) => Boolean(id && state.deletedSessionIds.includes(id)),
    getWorkspaceCount: () => workspacesApi?.list?.getSnapshot?.()?.items?.length ?? 0,
    hasSessionsApi: () => Boolean(sessionsApi),
    getUngroupedSessionIds,
    refreshState,
    saveProxy,
    beginTotpSetup,
    confirmTotpSetup,
    lockSession,
    verifyOrUnlockSession,
    clearPin,
    moveSession,
    deleteSession,
    deleteUngroupedSessions,
    closeDialog,
    openSetPinDialog,
    openUnlockPinDialog,
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


/**
 * Compatibility layer for the public Harness sidebar DOM. The Host retains
 * ownership of all React nodes, commands, and session data.
 */
function installHostSearch(
  controller: DeltaController,
  getSessions: () => SearchSessionsApi | undefined,
  getNavigation: () => SearchNavigationApi | undefined,
  getWorkspaces: () => WorkspacesApi | undefined,
  bindWorkspaceRefresh: (refresh: (() => void) | undefined) => void,
): () => void {
  const root = document.documentElement
  const shell = document.createElement('section')
  shell.className = 'dtd-host-search'
  shell.setAttribute('data-delta-search', 'sessions')
  const searchField = document.createElement('div')
  searchField.className = 'dtd-host-search-field'
  const glyph = document.createElement('span')
  glyph.className = 'dtd-host-search-icon'
  glyph.setAttribute('aria-hidden', 'true')
  glyph.textContent = '⌕'
  const input = document.createElement('input')
  input.type = 'search'
  input.maxLength = 500
  input.className = 'dtd-host-search-input'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
  input.placeholder = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions
  searchField.append(glyph, input)
  // The Host retains its original navigation. These are additive service-backed shortcuts,
  // not a replacement for Host buttons, access controls, or panel registrations.
  const quickActions = document.createElement('div')
  quickActions.className = 'dtd-host-quick-actions'
  const makeQuickAction = (id: string): HTMLButtonElement => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dtd-host-quick-action'
    button.setAttribute('data-delta-action', id)
    return button
  }
  const pluginsButton = makeQuickAction('plugins')
  const schedulesButton = makeQuickAction('schedules')
  const newSessionButton = makeQuickAction('new-session')
  quickActions.append(pluginsButton, schedulesButton, newSessionButton)
  const feedback = document.createElement('p')
  feedback.className = 'dtd-host-action-feedback'
  feedback.setAttribute('role', 'alert')
  feedback.hidden = true
  const results = document.createElement('div')
  results.className = 'dtd-host-search-results'
  results.setAttribute('role', 'region')
  results.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
  results.hidden = true
  const initialSearchUi = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
  const searchBackdrop = document.createElement('div')
  searchBackdrop.className = 'dtd-search-dialog-backdrop'
  searchBackdrop.hidden = true
  const searchDialog = document.createElement('section')
  searchDialog.className = 'dtd-search-dialog'
  searchDialog.setAttribute('role', 'dialog')
  searchDialog.setAttribute('aria-modal', 'true')
  const searchDialogTitle = document.createElement('h2')
  searchDialogTitle.id = 'dtd-search-dialog-title'
  searchDialogTitle.textContent = initialSearchUi.searchSessions
  searchDialog.setAttribute('aria-labelledby', searchDialogTitle.id)
  const searchDialogClose = document.createElement('button')
  searchDialogClose.type = 'button'
  searchDialogClose.className = 'dtd-search-dialog-close'
  searchDialogClose.setAttribute('aria-label', initialSearchUi.close)
  searchDialogClose.textContent = '×'
  const searchDialogHeader = document.createElement('header')
  searchDialogHeader.className = 'dtd-search-dialog-header'
  searchDialogHeader.append(searchDialogTitle, searchDialogClose)
  const searchDialogSearch = document.createElement('div')
  searchDialogSearch.className = 'dtd-search-dialog-search'
  const searchDialogResults = document.createElement('div')
  searchDialogResults.className = 'dtd-search-dialog-results'
  searchDialog.append(searchDialogHeader, searchDialogSearch, searchDialogResults)
  searchBackdrop.appendChild(searchDialog)
  shell.append(searchField, quickActions, feedback, results)
  let isDisposed = false
  let timer: number | undefined
  let pending: AbortController | undefined
  let serial = 0
  let remoteItems: { sessionId: string; snippet: string }[] = []
  let isSearching = false
  let hasError = false
  let displayedLanguage = language()
  let isSearchDialogOpen = false
  let isSearchFocusSuppressed = false
  const active = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
  const workspaceReady = (snapshot: ReturnType<WorkspacesApi['list']['getSnapshot']>): boolean =>
    (snapshot.phase === undefined || snapshot.phase === 'ready') &&
    (snapshot.state === undefined || snapshot.state === 'idle')
  // Native WorkspaceBrowser's guardedOpen forbids archived Sessions. The public
  // Workspace snapshot is authoritative; missing or loading metadata fails closed.
  const sessionOpenability = (sessionId: string): 'allowed' | 'archived' | 'unknown' => {
    const workspaces = getWorkspaces()
    const sessions = getSessions()
    if (!workspaces || !sessions) return 'unknown'
    try {
      // A session list in a pending/reconnecting phase is not an actionable
      // snapshot, even when the Workspace archive metadata is still cached.
      const sessionSnapshot = sessions.list.getSnapshot()
      if (sessionSnapshot.phase !== undefined && sessionSnapshot.phase !== 'ready') return 'unknown'
      const snapshot = workspaces.list.getSnapshot()
      if (!Array.isArray(snapshot.archivedSessionIds) || !workspaceReady(snapshot)) return 'unknown'
      return snapshot.archivedSessionIds.includes(sessionId) ? 'archived' : 'allowed'
    } catch { return 'unknown' }
  }
  const clearRequest = (): void => {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
    pending?.abort()
    pending = undefined
    serial += 1
  }
  // Search results are native buttons; support arrow navigation in both
  // directions without hijacking the Host's global keyboard shortcuts.
  const closeSearchDialog = (shouldRestoreFocus = true, shouldClearQuery = true): void => {
    if (!isSearchDialogOpen) return
    isSearchDialogOpen = false
    searchBackdrop.hidden = true
    if (searchField.parentElement !== shell) shell.insertBefore(searchField, quickActions)
    if (results.parentElement !== shell) shell.appendChild(results)
    searchBackdrop.remove()
    if (shouldClearQuery) {
      clearRequest()
      input.value = ''
      remoteItems = []
      isSearching = false
      hasError = false
      feedback.hidden = true
      results.hidden = true
      results.replaceChildren()
    }
    if (shouldRestoreFocus && input.isConnected) {
      isSearchFocusSuppressed = true
      input.focus({ preventScroll: true })
      isSearchFocusSuppressed = false
    }
  }
  const openSearchDialog = (): void => {
    if (isSearchDialogOpen || !active() || !document.body) return
    isSearchDialogOpen = true
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    searchDialogTitle.textContent = copy.searchSessions
    searchDialogClose.setAttribute('aria-label', copy.close)
    isSearchFocusSuppressed = true
    searchDialogSearch.appendChild(searchField)
    searchDialogResults.appendChild(results)
    document.body.appendChild(searchBackdrop)
    searchBackdrop.hidden = false
    render()
    input.focus({ preventScroll: true })
    isSearchFocusSuppressed = false
  }
  searchDialogClose.addEventListener('click', () => closeSearchDialog())
  searchBackdrop.addEventListener('pointerdown', event => {
    if (event.target === searchBackdrop) closeSearchDialog()
  })
  searchDialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isSearchDialogOpen) {
      event.preventDefault()
      closeSearchDialog()
      return
    }
    if (event.key !== 'Tab' || !isSearchDialogOpen) return
    const focusable = Array.from(searchDialog.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    ))
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  })
  const focusResult = (current: HTMLButtonElement | null, step: number): void => {
    const buttons = Array.from(results.children)
      .filter((node): node is HTMLButtonElement => node.tagName.toLowerCase() === 'button')
    const nextIndex = current === null ? 0 : buttons.indexOf(current) + step
    if (nextIndex >= 0 && nextIndex < buttons.length) buttons[nextIndex]?.focus()
    else if (nextIndex < 0) input.focus()
  }
  const bindResultKeys = (button: HTMLButtonElement): void => {
    button.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        focusResult(button, event.key === 'ArrowDown' ? 1 : -1)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (isSearchDialogOpen) closeSearchDialog()
        else {
          input.value = ''
          onInput()
          input.focus()
        }
      }
    })
  }
  const resetSearch = (): void => {
    clearRequest()
    input.value = ''
    remoteItems = []
    isSearching = false
    hasError = false
    feedback.hidden = true
    results.hidden = true
    results.replaceChildren()
  }
  const render = (): void => {
    results.replaceChildren()
    const query = input.value.trim().toLocaleLowerCase()
    if (!active()) { results.hidden = true; return }
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    if (!query) {
      if (!isSearchDialogOpen) { results.hidden = true; return }
      results.hidden = false
      const prompt = document.createElement('p')
      prompt.className = 'dtd-host-search-hint dtd-search-dialog-prompt'
      prompt.setAttribute('role', 'status')
      prompt.textContent = copy.searchDialogPrompt
      results.appendChild(prompt)
      return
    }
    results.hidden = false
    // Workspaces are an optional read-only enhancement. No filesystem paths, IDs,
    // permissions, or private viewing-store keys are exposed in search results.
    const workspaceMatches: { id: string; title: string }[] = []
    const workspaceApi = getWorkspaces()
    const navigation = getNavigation()
    if (workspaceApi && typeof navigation?.openWorkspace === 'function') {
      try {
        const snapshot = workspaceApi.list.getSnapshot()
        if (!workspaceReady(snapshot)) throw new Error('Workspace list is not ready')
        for (const item of snapshot.items) {
          const title = typeof item.title === 'string' ? item.title.trim() : ''
          if (!title || typeof item.workspaceId !== 'string' || !title.toLocaleLowerCase().includes(query)) continue
          workspaceMatches.push({ id: item.workspaceId, title })
          if (workspaceMatches.length >= 8) break
        }
      } catch {
        // Workspace snapshots may be unavailable during Host reconnect; keep Session search alive.
      }
    }
    // The published Session list may temporarily reject reads while the Host
    // remounts. A transient failure must not tear down the Delta sidebar.
    let sessionSnapshot: ReturnType<SearchSessionsApi['list']['getSnapshot']>
    try {
      const sessions = getSessions()
      if (!sessions) throw new Error('Host Session service not available')
      sessionSnapshot = sessions.list.getSnapshot()
      if (sessionSnapshot.phase !== undefined && sessionSnapshot.phase !== 'ready') {
        throw new Error('Session catalog not ready')
      }
    } catch {
      const message = document.createElement('p')
      message.className = 'dtd-host-search-hint'
      message.setAttribute('role', 'status')
      message.textContent = copy.searchWaitingServices
      results.appendChild(message)
      return
    }
    const currentSessions = sessionSnapshot.byId
    const seen = new Set<string>()
    const matches: { id: string; title: string; snippet?: string }[] = []
    for (const item of Object.values(currentSessions)) {
      const title = item.title?.trim() ?? ''
      if (!item.blank && title.toLocaleLowerCase().includes(query)) {
        matches.push({ id: item.id, title })
        seen.add(item.id)
      }
      if (matches.length >= 20) break
    }
    for (const item of remoteItems) {
      if (seen.has(item.sessionId) || matches.length >= 20) continue
      const title = currentSessions[item.sessionId]?.title?.trim() || item.sessionId
      matches.push({ id: item.sessionId, title, snippet: item.snippet })
      seen.add(item.sessionId)
    }
    for (const workspace of workspaceMatches) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'dtd-host-search-result'
      button.setAttribute('data-delta-result-kind', 'workspace')
      const kind = document.createElement('span')
      kind.className = 'dtd-host-search-result-kind'
      kind.textContent = copy.workspaceResult
      const heading = document.createElement('span')
      heading.className = 'dtd-host-search-result-title'
      heading.textContent = workspace.title
      button.append(kind, heading)
      button.addEventListener('click', () => {
        const currentNavigation = getNavigation()
        if (!active() || typeof currentNavigation?.openWorkspace !== 'function') return
        // A rendered result is not a grant to navigate: the Host can remove,
        // rename or reload a Workspace between painting this button and click.
        // Recheck its public snapshot at activation, before calling the Host.
        let isStillAvailable = false
        try {
          const snapshot = getWorkspaces()?.list.getSnapshot()
          isStillAvailable = !!snapshot && workspaceReady(snapshot) &&
            snapshot.items.some(item => item.workspaceId === workspace.id &&
              typeof item.title === 'string' && item.title.trim() === workspace.title)
        } catch { /* A reconnecting Host must fail closed. */ }
        if (!isStillAvailable) {
          feedback.textContent = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.unavailable
          feedback.hidden = false
          return
        }
        clearRequest()
        isSearching = false
        const navigationRequest = serial
        try {
          void Promise.resolve(currentNavigation.openWorkspace(workspace.id)).then(() => {
            if (!active() || serial !== navigationRequest) return
            closeSearchDialog(false, false)
            input.value = ''
            clearRequest()
            remoteItems = []
            hasError = false
            feedback.hidden = true
            render()
          }, () => {
            if (!active() || serial !== navigationRequest) return
            hasError = true
            render()
          })
        } catch {
          if (!active() || serial !== navigationRequest) return
          hasError = true
          render()
        }
      })
      bindResultKeys(button)
      results.appendChild(button)
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
      // Add only Host-confirmed state. Native rows remain authoritative for
      // pending approvals, completed runs, relative times and session actions.
      const archived = sessionOpenability(match.id) === 'archived'
      const running = currentSessions[match.id]?.running === true
      if (archived || running) {
        const status = document.createElement('span')
        status.className = 'dtd-host-search-result-status'
        status.textContent = archived ? copy.sessionArchived : copy.sessionRunning
        button.appendChild(status)
      }
      if (archived) button.setAttribute('aria-disabled', 'true')
      button.addEventListener('click', () => {
        if (!active()) return
        const openability = sessionOpenability(match.id)
        if (openability !== 'allowed') {
          const labels = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
          feedback.textContent = openability === 'archived'
            ? labels.archivedSession : labels.sessionStateUnknown
          feedback.hidden = false
          return
        }
        try {
          const currentNavigation = getNavigation()
          if (typeof currentNavigation?.openSession !== 'function') throw new Error('Host Session navigation unavailable')
          feedback.hidden = true
          currentNavigation.openSession(match.id)
          closeSearchDialog(false, false)
          input.value = ''
          clearRequest()
          remoteItems = []
          render()
        } catch (reason) {
          console.warn('[dsh-delta-desktop] native Session navigation failed', reason)
          hasError = true
          render()
        }
      })
      bindResultKeys(button)
      results.appendChild(button)
    }
    if (isSearching || hasError || (matches.length === 0 && workspaceMatches.length === 0)) {
      const message = document.createElement('p')
      message.className = 'dtd-host-search-hint'
      message.setAttribute('role', 'status')
      message.textContent = hasError ? copy.unavailable : isSearching ? copy.searching : copy.noResults
      results.appendChild(message)
    }
  }
  const onInput = (): void => {
    clearRequest()
    remoteItems = []
    isSearching = false
    hasError = false
    const query = input.value.replaceAll('\0', '').trim().slice(0, 500)
    if (query && getSessions()) {
      isSearching = true
      const requestId = serial
      const aborter = new AbortController()
      pending = aborter
      timer = window.setTimeout(() => {
        timer = undefined
        // A callback already queued when clearTimeout ran may still execute.
        // Never issue Host requests after cancellation or sidebar remount.
        if (!active() || serial !== requestId || aborter.signal.aborted) return
        let request: ReturnType<SearchSessionsApi['search']>
        try {
          const sessions = getSessions()
          if (!sessions) throw new Error('Host Session search disconnected')
          request = sessions.search(query, aborter.signal)
        } catch (reason) {
          if (!active() || serial !== requestId || aborter.signal.aborted) return
          isSearching = false
          hasError = true
          console.warn('[dsh-delta-desktop] synchronous Session search failed', reason)
          render()
          return
        }
        void request.then(result => {
          if (!active() || serial !== requestId || aborter.signal.aborted) return
          isSearching = false
          hasError = !result.ok
          remoteItems = result.ok ? (result.value?.items ?? []) : []
          render()
        }, reason => {
          if (!active() || serial !== requestId || aborter.signal.aborted) return
          isSearching = false
          hasError = true
          console.warn('[dsh-delta-desktop] native Session search failed', reason)
          render()
        })
      }, 250)
    }
    render()
  }
  const runQuickAction = (name: string, invoke: () => boolean | void): void => {
    if (!active()) return
    try {
      if (invoke() === false) throw new Error('Host navigation unavailable')
      feedback.hidden = true
      input.value = ''
      onInput()
    } catch (reason) {
      feedback.textContent = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.unavailable
      feedback.hidden = false
      console.warn('[dsh-delta-desktop] native quick action failed: ' + name, reason)
    }
  }
  pluginsButton.addEventListener('click', () =>
    runQuickAction('plugins', () => controller.openPanel('plugins')))
  schedulesButton.addEventListener('click', () =>
    runQuickAction('schedules', () => controller.openPanel('schedules')))
  newSessionButton.addEventListener('click', () =>
    runQuickAction('new-session', () => {
      // Native SidebarRoot gates New Session on useRemoteAccess('session/create').
      // A revoked or missing global grant must never dispatch from Delta either.
      if (!controller.getSnapshot().createAllowed) return false
      const navigation = getNavigation()
      if (typeof navigation?.startSession !== 'function') return false
      navigation.startSession()
    }))
  input.addEventListener('focus', () => {
    if (!isSearchFocusSuppressed) openSearchDialog()
  })
  input.addEventListener('click', () => openSearchDialog())
  input.addEventListener('input', () => {
    feedback.hidden = true
    onInput()
  })
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !results.hidden) {
      event.preventDefault()
      focusResult(null, 1)
      return
    }
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (isSearchDialogOpen) {
      closeSearchDialog()
      return
    }
    input.value = ''
    onInput()
    input.blur()
  })
  const sync = (): void => {
    if (isDisposed) return
    if (controller.getSnapshot().mode !== 'delta') {
      closeSearchDialog(false, false)
      resetSearch()
      shell.remove()
      root.removeAttribute('data-delta-search-adapter')
      controller.setSearchStatus('disabled')
      return
    }
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    if (input.getAttribute('placeholder') !== copy.searchSessions) {
      input.placeholder = copy.searchSessions
    }
    if (input.getAttribute('aria-label') !== copy.searchSessions) {
      input.setAttribute('aria-label', copy.searchSessions)
    }
    if (results.getAttribute('aria-label') !== copy.searchSessions) {
      results.setAttribute('aria-label', copy.searchSessions)
    }
    if (searchDialogTitle.textContent !== copy.searchSessions) searchDialogTitle.textContent = copy.searchSessions
    if (searchDialogClose.getAttribute('aria-label') !== copy.close) {
      searchDialogClose.setAttribute('aria-label', copy.close)
    }
    // The observer watches the whole sidebar subtree. Writing an unchanged
    // textContent still mutates child nodes in browsers and can queue another
    // observer callback, creating an unbounded self-triggering sync loop.
    if (pluginsButton.textContent !== copy.pluginManagement) {
      pluginsButton.textContent = copy.pluginManagement
    }
    if (schedulesButton.textContent !== copy.scheduledTasks) {
      schedulesButton.textContent = copy.scheduledTasks
    }
    if (newSessionButton.textContent !== copy.newConversation) {
      newSessionButton.textContent = copy.newConversation
    }
    newSessionButton.hidden = !controller.getSnapshot().createAllowed || !getNavigation()
    newSessionButton.disabled = !controller.getSnapshot().createAllowed || !getNavigation()
    const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]')
    // The Host only renders <nav> when it has main-panel entries; search must
    // still work with no panels, above the unchanged workspace browsing region.
    if (!viewport) {
      closeSearchDialog(false)
      // A detached sidebar can be rebuilt for a different Host generation.
      // Drop all pending RPCs, prior results and focus context before remount.
      if (shell.parentElement !== null) resetSearch()
      shell.remove()
      root.setAttribute('data-delta-search-adapter', 'waiting-for-sidebar')
      controller.setSearchStatus('waiting-sidebar')
      return
    }
    if (shell.parentElement !== viewport || viewport.firstElementChild !== shell) {
      closeSearchDialog(false)
      viewport.insertBefore(shell, viewport.firstElementChild)
    }
    const hasSearchServices = !!getSessions() && !!getNavigation()
    root.setAttribute('data-delta-search-adapter', hasSearchServices ? 'active' : 'waiting-for-services')
    controller.setSearchStatus(hasSearchServices ? 'active' : 'waiting-services')
    const currentLanguage = language()
    if (displayedLanguage !== currentLanguage) {
      displayedLanguage = currentLanguage
      if (active()) render()
    }
  }
  // Workspace Controller notifications update matches without replacing Host controls.
  bindWorkspaceRefresh(() => {
    if (!isDisposed) {
      sync()
      if (active()) render()
    }
  })
  const observer = new MutationObserver(sync)
  observer.observe(document.body ?? root, { subtree: true, childList: true })
  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    if (isDisposed) return
    closeSearchDialog(false, false)
    isDisposed = true
    clearRequest()
    unsubscribe()
    observer.disconnect()
    bindWorkspaceRefresh(undefined)
    searchBackdrop.remove()
    shell.remove()
    root.removeAttribute('data-delta-search-adapter')
    controller.setSearchStatus(controller.getSnapshot().mode === 'official' ? 'disabled' : 'waiting-services')
  }
}


window.__ModuleLoader__.load({
  id: DELTA_DESKTOP_OWNER,
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
      console.error('[dsh-delta-desktop] React unavailable; native UI remains active:', error)
      return { inject: [], apply() {} }
    }
    const el = React.createElement
    let hoverSessionSource: SearchSessionsApi | undefined
    // The hover seat is mounted only while a row is visible. Subscribe to the
    // public Session list so its running state updates without opening a Session.
    const subscribeHoverSessions = (notify: () => void): (() => void) => {
      try {
        return hoverSessionSource?.list.subscribe?.(notify) ?? (() => {})
      } catch { return () => {} }
    }
    // useSyncExternalStore must receive a stable, primitive snapshot. Reading
    // a fresh Host catalog object here would otherwise cause render loops.
    const readHoverState = (sessionId: string): string => {
      try {
        const snapshot = hoverSessionSource?.list.getSnapshot()
        if (!snapshot || (snapshot.phase !== undefined && snapshot.phase !== 'ready')) return ''
        const session = snapshot.byId[sessionId]
        if (!session) return ''
        const timestamp = typeof session.updatedAt === 'number' && Number.isFinite(session.updatedAt) &&
          session.updatedAt > 0 ? session.updatedAt : 0
        return (session.running === true ? '1' : '0') + ':' + timestamp
      } catch { return '' }
    }
    let MenuItemButton: MenuItemButtonApi['MenuItemButton'] | undefined
    let ReactRoot: ReactRootApi | undefined
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as MenuItemButtonApi
      const domRoot = require('react-dom/client') as ReactRootApi
      if (typeof primitives?.MenuItemButton === 'function' && typeof domRoot?.createRoot === 'function') {
        MenuItemButton = primitives.MenuItemButton
        ReactRoot = domRoot
      }
    } catch { /* MCP menu dependencies are optional Host modules. */ }
    let mcpServices: McpServices | undefined
    let mcpDialogRoot: ReturnType<ReactRootApi['createRoot']> | undefined
    let mcpDialogHost: HTMLElement | undefined
    function closeMcpManagement(): void {
      const root = mcpDialogRoot
      const host = mcpDialogHost
      mcpDialogRoot = undefined
      mcpDialogHost = undefined
      try { root?.unmount() } catch { /* a removed Host root is already closed */ }
      host?.remove()
    }
    function openMcpManagement(): void {
      if (!ReactRoot || typeof document === 'undefined' || !document.body) return
      closeMcpManagement()
      const host = document.createElement('div')
      host.dataset.dtdMcpRoot = ''
      document.body.appendChild(host)
      mcpDialogHost = host
      mcpDialogRoot = ReactRoot.createRoot(host)
      renderMcpManagement()
    }
    function renderMcpManagement(): void {
      if (mcpDialogRoot) mcpDialogRoot.render(el(McpManagementDialog, {
        services: mcpServices,
        onClose: closeMcpManagement,
      }))
    }
    const EMPTY_MCP_SNAPSHOT: McpConfigSnapshot = Object.freeze({
      status: 'unavailable', value: Object.freeze({ servers: Object.freeze({}) }),
      base: Object.freeze({ servers: Object.freeze({}) }), user: Object.freeze({ servers: Object.freeze({}) }),
      revision: 0, writable: false,
    })
    const emptyMcpDraft = (): McpDraft => ({ name: '', transport: 'stdio', command: '', args: '',
      env: '', cwd: '', url: '', headers: '', enabled: true })
    function asRecord(value: unknown): Record<string, unknown> {
      return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {}
    }
    function pairLines(source: string): Record<string, string> | undefined {
      const result: Record<string, string> = {}
      for (const line of source.split(/\r?\n/)) {
        if (!line.trim()) continue
        const separator = line.indexOf('=')
        if (separator < 1) return undefined
        const key = line.slice(0, separator).trim()
        if (!key || Object.prototype.hasOwnProperty.call(result, key)) return undefined
        result[key] = line.slice(separator + 1).trim()
      }
      return result
    }
    function pairsText(value: unknown): string {
      const record = asRecord(value)
      return Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, item]) => `${key}=${item}`).join('\n')
    }
    function mcpStatusText(state: string | undefined, copy: DeltaCopy['ui']): string {
      switch (state) {
        case 'connecting': return copy.mcpConnecting
        case 'connected': return copy.mcpConnected
        case 'disabled': return copy.mcpDisabled
        case 'failed': return copy.mcpFailed
        case 'waiting-credentials': return copy.mcpWaitingCredentials
        default: return state || copy.mcpUnknown
      }
    }
    function McpManagementDialog(props: { services?: McpServices; onClose(): void }): unknown {
      const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
      const form = props.services?.form
      const manager = props.services?.manager
      const formSnapshot = React.useSyncExternalStore(
        listener => form?.subscribe(listener) ?? (() => {}),
        () => form?.getSnapshot() ?? EMPTY_MCP_SNAPSHOT,
      )
      const [liveServers, setLiveServers] = React.useState<readonly McpManagedServer[] | undefined>(undefined)
      const [managerError, setManagerError] = React.useState('')
      const [draft, setDraft] = React.useState<McpDraft>(emptyMcpDraft())
      const [editingName, setEditingName] = React.useState<string | undefined>(undefined)
      const [showForm, setShowForm] = React.useState(false)
      const [pending, setPending] = React.useState(false)
      const [busyName, setBusyName] = React.useState<string | undefined>(undefined)
      const [confirmName, setConfirmName] = React.useState<string | undefined>(undefined)
      const [feedback, setFeedback] = React.useState('')
      React.useEffect(() => {
        if (!manager?.watch) return
        const abort = new AbortController()
        let isCurrent = true
        void (async () => {
          try {
            for await (const rows of manager.watch!(abort.signal)) {
              if (!isCurrent || abort.signal.aborted) return
              setLiveServers(rows)
              setManagerError('')
            }
          } catch {
            if (isCurrent && !abort.signal.aborted) setManagerError(copy.mcpOperationFailed)
          }
        })()
        return () => { isCurrent = false; abort.abort() }
      }, [manager])
      React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
          if (event.key === 'Escape' && !pending) props.onClose()
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [props.onClose, pending])

      const values = asRecord(formSnapshot.value)
      const configured = asRecord(values.servers)
      const user = asRecord(asRecord(formSnapshot.user).servers)
      const base = asRecord(asRecord(formSnapshot.base).servers)
      const liveByName = new Map((liveServers ?? []).map(server => [server.name, server]))
      const names = new Set([...Object.keys(configured), ...(liveServers ?? []).map(server => server.name)])
      const rows = [...names].sort((a, b) => a.localeCompare(b)).map(name => {
        const live = liveByName.get(name)
        const entry = asRecord(configured[name])
        return { name, entry, live, configured: live?.configured ?? Object.prototype.hasOwnProperty.call(configured, name) }
      })
      const formReady = !!form && formSnapshot.status === 'ready'
      const writable = formReady && formSnapshot.writable === true && !pending

      const beginAdd = (): void => {
        setEditingName(undefined)
        setDraft(emptyMcpDraft())
        setShowForm(true)
        setFeedback('')
      }
      const beginEdit = (name: string): void => {
        const entry = asRecord(configured[name])
        if (!Object.keys(entry).length) return
        const transport = entry.transport === 'streamable-http' ? 'streamable-http' : 'stdio'
        setEditingName(name)
        setShowForm(true)
        setDraft({
          name,
          transport,
          command: typeof entry.command === 'string' ? entry.command : '',
          args: Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string').join('\n') : '',
          env: pairsText(entry.env),
          cwd: typeof entry.cwd === 'string' ? entry.cwd : '',
          url: typeof entry.url === 'string' ? entry.url : '',
          headers: pairsText(entry.headers),
          enabled: entry.enabled !== false,
        })
        setFeedback('')
      }
      const saveDraft = async (): Promise<void> => {
        if (!form || !writable) return
        const name = draft.name.trim()
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) { setFeedback(copy.mcpInvalidName); return }
        if (!editingName && (Object.prototype.hasOwnProperty.call(configured, name) || liveByName.has(name))) {
          setFeedback(copy.mcpDuplicateName); return
        }
        const args = draft.args.split(/\r?\n/).filter(line => line.trim().length > 0)
        let entry: Record<string, unknown> = { ...asRecord(configured[name]), transport: draft.transport, enabled: draft.enabled }
        if (draft.transport === 'stdio') {
          const command = draft.command.trim()
          if (!command) { setFeedback(copy.mcpMissingCommand); return }
          const env = pairLines(draft.env)
          if (!env) { setFeedback(copy.mcpInvalidPairs); return }
          delete entry.url
          delete entry.headers
          entry.command = command
          entry.args = args
          entry.env = env
          if (draft.cwd.trim()) entry.cwd = draft.cwd.trim()
          else delete entry.cwd
        } else {
          const headers = pairLines(draft.headers)
          if (!headers) { setFeedback(copy.mcpInvalidPairs); return }
          let url: URL
          try { url = new URL(draft.url.trim()) } catch { setFeedback(copy.mcpInvalidUrl); return }
          if (url.protocol !== 'http:' && url.protocol !== 'https:') { setFeedback(copy.mcpInvalidUrl); return }
          delete entry.command
          delete entry.args
          delete entry.env
          delete entry.cwd
          entry.url = url.toString()
          entry.headers = headers
        }
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'set', path: ['servers', name], value: entry }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
          setEditingName(undefined)
          setDraft(emptyMcpDraft())
          setShowForm(false)
          setFeedback(copy.mcpSaveSuccess)
        } catch { setFeedback(copy.mcpSaveFailed) }
        finally { setPending(false) }
      }
      const toggleServer = async (name: string, isEnabled: boolean): Promise<void> => {
        if (!form || !writable) return
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'set', path: ['servers', name, 'enabled'], value: isEnabled }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
        } catch { setFeedback(copy.mcpSaveFailed) }
        finally { setPending(false) }
      }
      const removeServer = async (name: string): Promise<void> => {
        if (!form || !writable) return
        setPending(true)
        setFeedback('')
        try {
          const result = await form.mutate([{ op: 'unset', path: ['servers', name] }], formSnapshot.revision)
          if (result === false) throw new Error('settings write rejected')
          setConfirmName(undefined)
          setFeedback(copy.mcpRemoveSuccess)
        } catch { setFeedback(copy.mcpRemoveFailed) }
        finally { setPending(false) }
      }
      const managerAction = async (name: string, action: 'probe' | 'restart'): Promise<void> => {
        if (!manager || !manager[action]) return
        setBusyName(name)
        setFeedback('')
        const abort = new AbortController()
        try {
          if (action === 'probe') await manager.probe!(name, abort.signal)
          else await manager.restart!(name)
          setFeedback(action === 'probe' ? copy.mcpProbeComplete : copy.mcpRestartComplete)
        } catch { setFeedback(copy.mcpOperationFailed) }
        finally { setBusyName(undefined) }
      }
      const field = (label: string, value: string, onChange: (value: string) => void,
        options: { multiline?: boolean; hint?: string; required?: boolean; readOnly?: boolean } = {}): unknown => el('label', { className: 'dtd-mcp-field' },
        el('span', null, label, options.required ? ' *' : ''),
        options.multiline
          ? el('textarea', { value, rows: 3, onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value) })
          : el('input', { value, required: options.required, readOnly: options.readOnly,
            onChange: (event: { currentTarget: { value: string } }) => onChange(event.currentTarget.value) }),
        options.hint ? el('small', null, options.hint) : null)
      const serverRows = rows.length ? rows.map(row => {
        const isUserOwned = Object.prototype.hasOwnProperty.call(user, row.name)
        const hasBase = Object.prototype.hasOwnProperty.call(base, row.name)
        const canRestore = hasBase && isUserOwned
        const editable = row.configured && Object.prototype.hasOwnProperty.call(configured, row.name)
        const enabled = row.entry.enabled !== false
        const state = row.live?.status?.state ?? (enabled ? undefined : 'disabled')
        return el('article', { className: 'dtd-mcp-server', key: row.name },
          el('div', { className: 'dtd-mcp-server-main' },
            el('div', { className: 'dtd-mcp-server-heading' },
              el('strong', null, row.name),
              el('span', { className: 'dtd-mcp-source' }, row.configured ? copy.mcpConfigured : copy.mcpRegistered)),
            el('div', { className: 'dtd-mcp-server-meta' },
              el('span', null, `${copy.mcpStatus}: ${mcpStatusText(state, copy)}`),
              row.entry.transport ? el('span', null, row.entry.transport === 'stdio' ? copy.mcpStdio : copy.mcpHttp) : null),
            row.live?.status?.reason ? el('small', { title: String(row.live.status.reason) }, String(row.live.status.reason)) : null),
          el('div', { className: 'dtd-mcp-server-actions' },
            editable ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
              onClick: () => beginEdit(row.name) }, copy.mcpEditServer) : null,
            editable ? el('button', { type: 'button', className: `dtd-mcp-button${enabled ? ' is-active' : ''}`,
              disabled: pending || !writable, 'aria-pressed': enabled,
              onClick: () => { void toggleServer(row.name, !enabled) } }, enabled ? copy.mcpEnabledState : copy.mcpDisabled) : null,
            manager?.probe ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busyName === row.name,
              onClick: () => { void managerAction(row.name, 'probe') } }, busyName === row.name ? copy.mcpWorking : copy.mcpProbe) : null,
            manager?.restart ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busyName === row.name,
              onClick: () => { void managerAction(row.name, 'restart') } }, copy.mcpRestart) : null,
            editable && (isUserOwned || canRestore) ? confirmName === row.name
              ? el('span', { className: 'dtd-mcp-confirm' },
                el('button', { type: 'button', className: 'dtd-mcp-button is-danger', disabled: pending,
                  onClick: () => { void removeServer(row.name) } }, copy.mcpConfirmRemove),
                el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
                  onClick: () => setConfirmName(undefined) }, copy.mcpCancelRemove))
              : el('button', { type: 'button', className: 'dtd-mcp-button is-danger', disabled: pending || !writable,
                onClick: () => setConfirmName(row.name) }, canRestore ? copy.mcpRestore : copy.mcpRemove) : null))
      }) : el('p', { className: 'dtd-mcp-empty' }, copy.mcpNoServers)
      const formPane = showForm
        ? el('form', { className: 'dtd-mcp-form', onSubmit: (event: { preventDefault(): void }) => { event.preventDefault(); void saveDraft() } },
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpBasics),
            field(copy.mcpName, draft.name, value => setDraft(state => ({ ...state, name: value })), {
              hint: copy.mcpNameHint, required: true, readOnly: editingName !== undefined,
            })),
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpConnection),
            el('label', { className: 'dtd-mcp-field' }, el('span', null, copy.mcpTransport),
              el('select', { value: draft.transport, onChange: (event: { currentTarget: { value: string } }) =>
                setDraft(state => ({ ...state, transport: event.currentTarget.value === 'streamable-http' ? 'streamable-http' : 'stdio' })) },
              el('option', { value: 'stdio' }, copy.mcpStdio), el('option', { value: 'streamable-http' }, copy.mcpHttp))),
            draft.transport === 'stdio' ? el('div', { className: 'dtd-mcp-transport-fields' },
              field(copy.mcpCommand, draft.command, value => setDraft(state => ({ ...state, command: value })), { required: true }),
              field(copy.mcpArgs, draft.args, value => setDraft(state => ({ ...state, args: value })), { multiline: true, hint: copy.mcpArgsHint }),
              field(copy.mcpCwd, draft.cwd, value => setDraft(state => ({ ...state, cwd: value })))
            ) : field(copy.mcpUrl, draft.url, value => setDraft(state => ({ ...state, url: value })), { required: true })),
          el('section', { className: 'dtd-mcp-form-section' },
            el('h3', null, copy.mcpAuthentication),
            draft.transport === 'stdio'
              ? field(copy.mcpEnv, draft.env, value => setDraft(state => ({ ...state, env: value })), { multiline: true, hint: copy.mcpEnvHint })
              : field(copy.mcpHeaders, draft.headers, value => setDraft(state => ({ ...state, headers: value })), { multiline: true, hint: copy.mcpHeadersHint }),
            el('p', { className: 'dtd-mcp-security' }, copy.mcpSecurityNotice)),
          el('label', { className: 'dtd-mcp-checkbox' }, el('input', { type: 'checkbox', checked: draft.enabled,
            onChange: (event: { currentTarget: { checked: boolean } }) => setDraft(state => ({ ...state, enabled: event.currentTarget.checked })) }),
          el('span', null, copy.mcpEnabled)),
          feedback ? el('p', { className: 'dtd-mcp-feedback', role: 'status' }, feedback) : null,
          el('div', { className: 'dtd-mcp-form-actions' },
            el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
              onClick: () => { setEditingName(undefined); setDraft(emptyMcpDraft()); setShowForm(false); setFeedback('') } }, copy.mcpBackToList),
            el('button', { type: 'submit', className: 'dtd-mcp-button is-primary', disabled: !writable },
              pending ? copy.mcpWorking : copy.mcpSaveServer))) : null

      return el('div', { className: 'dtd-mcp-overlay', role: 'presentation', onMouseDown: (event: { target: unknown; currentTarget: unknown }) => {
        if (event.target === event.currentTarget && !pending) props.onClose()
      } },
        el('section', { className: 'dtd-mcp-dialog', role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'dtd-mcp-title' },
          el('header', { className: 'dtd-mcp-header' },
            el('div', { className: 'dtd-mcp-heading' },
              el('h2', { id: 'dtd-mcp-title' }, showForm ? (editingName ? copy.mcpEditServer : copy.mcpAddTitle) : copy.mcpTitle),
              el('p', null, showForm ? copy.mcpAddDescription : copy.mcpSubtitle)),
            el('div', { className: 'dtd-mcp-header-actions' },
              showForm
                ? el('button', { type: 'button', className: 'dtd-mcp-button', disabled: pending,
                  onClick: () => { setEditingName(undefined); setDraft(emptyMcpDraft()); setShowForm(false); setFeedback('') } }, copy.mcpBackToList)
                : el('button', { type: 'button', className: 'dtd-mcp-button is-primary', disabled: !writable,
                  onClick: beginAdd }, copy.mcpAddServer),
              el('button', { type: 'button', className: 'dtd-mcp-close', 'aria-label': copy.mcpClose,
                disabled: pending, onClick: props.onClose }, '×'))),
          showForm
            ? formReady ? formPane : el('p', { className: 'dtd-mcp-notice', role: 'alert' }, copy.mcpFormUnavailable)
            : el('div', { className: 'dtd-mcp-list-view' },
              !form ? el('p', { className: 'dtd-mcp-notice', role: 'alert' }, copy.mcpFormUnavailable)
                : formSnapshot.status === 'loading' ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpFormPending) : null,
              form && !manager ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpUnavailable) : null,
              managerError ? el('p', { className: 'dtd-mcp-error', role: 'alert' }, managerError) : null,
              formSnapshot.status === 'ready' && formSnapshot.writable === false
                ? el('p', { className: 'dtd-mcp-notice' }, copy.mcpReadOnly) : null,
              el('div', { className: 'dtd-mcp-list', 'aria-live': 'polite' },
                liveServers === undefined && manager?.watch ? el('p', { className: 'dtd-mcp-loading' }, copy.mcpRefreshing) : null,
                serverRows),
              feedback ? el('p', { className: 'dtd-mcp-feedback', role: 'status' }, feedback) : null))
      )
    }
    const ASSISTANT_TAB_ID = DELTA_DESKTOP_OWNER
    const ASSISTANT_TAB_KIND = 'delta-context-assistant'
    const ASSISTANT_PROTOCOL = 'dtdelta'
    const ASSISTANT_PRESET = 'delta-context'
    const assistantWorkflows = new Map<string, AssistantWorkflow>()
    let assistantServices: AssistantServices | undefined
    const savedAssistantKey = 'fongap.dsh-delta-desktop.assistant-sessions.v1'
    function assistantAddress(parentSessionId: string, assistantSessionId: string, purpose: 'discussion' | 'optimization'): string {
      const query = new URLSearchParams({ parent: parentSessionId, purpose })
      return `dsh-resource://${ASSISTANT_PROTOCOL}/session/${encodeURIComponent(assistantSessionId)}?${query}`
    }
    function parseAssistantAddress(address: string): Omit<AssistantResource, 'reference'> | undefined {
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
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        const saved = value[parentSessionId]
        return typeof saved === 'string' ? saved : undefined
      } catch { return undefined }
    }
    function rememberAssistantSession(parentSessionId: string, sessionId: string): void {
      try {
        const value = JSON.parse(localStorage.getItem(savedAssistantKey) ?? '{}') as Record<string, unknown>
        localStorage.setItem(savedAssistantKey, JSON.stringify({ ...value, [parentSessionId]: sessionId }))
      } catch { /* the current panel remains usable without a saved resume id */ }
    }
    function waitForSignal(signal: AbortSignal): Promise<void> {
      if (signal.aborted) return Promise.resolve()
      return new Promise(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
    }
    function registerAssistantSurface(scope: AssistantServices): () => void {
      assistantServices = scope
      scope.effect(() => scope.resources.register({
        protocol: ASSISTANT_PROTOCOL,
        async *open(address, { signal }) {
          const parsed = parseAssistantAddress(address)
          if (!parsed) throw new Error('Delta Assistant: invalid resource address')
          if (signal.aborted) return
          const reference = scope.sessions.retain(parsed.assistantSessionId, { source: 'sidebarChat', signal })
          try {
            await reference.ready
            yield { ok: true, value: { ...parsed, reference } }
            await waitForSignal(signal)
          } finally { reference.release() }
        },
      }), 'dsh-delta-desktop: independent assistant resources')
      scope.effect(() => scope.sidebarRightTabs.register({
        id: ASSISTANT_TAB_ID,
        kind: ASSISTANT_TAB_KIND,
        patterns: [`dsh-resource://${ASSISTANT_PROTOCOL}/session/**`],
        priority: 'extension',
        canOpen: address => parseAssistantAddress(address) !== undefined,
        title: address => parseAssistantAddress(address)?.purpose === 'optimization'
          ? (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.optimizeDraft
          : (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.discussTask,
      }), 'dsh-delta-desktop: independent assistant sidebar type')
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
      scope.slots.inject('conversation.input.model.label', () => scope.slots.register({
        name: 'conversation.input.model.label',
      }, ModelLabelExtension))
      return () => {
        if (assistantServices === scope) assistantServices = undefined
        assistantWorkflows.clear()
      }
    }
    async function openAssistantSession(
      parentSessionId: string,
      purpose: 'discussion' | 'optimization',
      initialPrompt: string,
      workflow?: AssistantWorkflow,
    ): Promise<string> {
      const services = assistantServices
      if (!services) throw new Error('Harness assistant capabilities are unavailable')
      let assistantSessionId = purpose === 'discussion' ? savedAssistantSession(parentSessionId) : undefined
      let isCreated = false
      if (assistantSessionId && services.sessions.list.getSnapshot().byId?.[assistantSessionId] === undefined) {
        assistantSessionId = undefined
      }
      if (!assistantSessionId) {
        const parent = services.sessions.list.getSnapshot().byId?.[parentSessionId]
        assistantSessionId = await services.sessions.create({
          agentPreset: ASSISTANT_PRESET,
          ...(parent?.workspaceId ? { workspaceId: parent.workspaceId } : {}),
        })
        isCreated = true
        if (purpose === 'discussion') rememberAssistantSession(parentSessionId, assistantSessionId)
      }
      const reference = services.sessions.retain(assistantSessionId, { source: 'sidebarChat' })
      try {
        await reference.ready
        if (isCreated) {
          const result = await reference.binding.session.prompt([{ type: 'text', text: initialPrompt }], 'queue')
          if (!result.ok) throw new Error(result.error?.message || 'Assistant prompt was rejected')
        }
      } finally { reference.release() }
      if (workflow) assistantWorkflows.set(assistantSessionId, workflow)
      await Promise.resolve(services.sidebarRight.openResource(assistantAddress(parentSessionId, assistantSessionId, purpose)))
      return assistantSessionId
    }
    async function queueMainCorrection(parentSessionId: string, correction: string): Promise<boolean> {
      const services = assistantServices
      if (!services || !correction.trim()) return false
      const reference = services.sessions.retain(parentSessionId, { source: 'sidebarChat' })
      try {
        await reference.ready
        const result = await reference.binding.session.prompt([{
          type: 'text', text: `User correction from the Delta side conversation. Treat this as the user's queued instruction for the main task:\n\n${correction.trim()}`,
        }], 'queue')
        return result.ok
      } finally { reference.release() }
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
        el(PrivacyVisionSettings, {}))
    }
    interface PrivacyVisionDraft {
      deepSeekModelsEnabled: boolean; redactionEnabled: boolean; visionEnabled: boolean; visionSource: 'existing' | 'custom';
      visionProvider: string; visionModel: string; visionProtocol: 'openai' | 'anthropic' | 'ollama';
      visionBaseURL: string; visionCustomModel: string; visionCredentialRef: string;
    }
    const PRIVACY_VISION_DEFAULTS: PrivacyVisionDraft = {
      deepSeekModelsEnabled: true, redactionEnabled: true, visionEnabled: true, visionSource: 'existing',
      visionProvider: '', visionModel: '', visionProtocol: 'openai', visionBaseURL: '',
      visionCustomModel: '', visionCredentialRef: 'DELTA_VISION_API_KEY',
    }
    function PrivacyVisionSettings(): unknown {
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const version = useDeltaSettingsVersion(React)
      const form = deltaSettingsForm
      const snapshot = form?.getSnapshot()
      const stored = snapshot?.value && typeof snapshot.value === 'object'
        ? snapshot.value as Record<string, unknown> : {}
      const [draft, setDraft] = React.useState<PrivacyVisionDraft>({
        deepSeekModelsEnabled: stored.deepSeekModelsEnabled !== false,
        redactionEnabled: stored.redactionEnabled !== false,
        visionEnabled: stored.visionEnabled !== false,
        visionSource: stored.visionSource === 'custom' ? 'custom' : 'existing',
        visionProvider: typeof stored.visionProvider === 'string' ? stored.visionProvider : '',
        visionModel: typeof stored.visionModel === 'string' ? stored.visionModel : '',
        visionProtocol: stored.visionProtocol === 'anthropic' || stored.visionProtocol === 'ollama'
          ? stored.visionProtocol : 'openai',
        visionBaseURL: typeof stored.visionBaseURL === 'string' ? stored.visionBaseURL : '',
        visionCustomModel: typeof stored.visionCustomModel === 'string' ? stored.visionCustomModel : '',
        visionCredentialRef: typeof stored.visionCredentialRef === 'string' ? stored.visionCredentialRef : 'DELTA_VISION_API_KEY',
      })
      const [dirty, setDirty] = React.useState(false)
      const [keyDraft, setKeyDraft] = React.useState('')
      const [status, setStatus] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => {
        if (dirty) return
        const value = form?.getSnapshot().value
        const values = value && typeof value === 'object' ? value as Record<string, unknown> : {}
        setDraft({
          deepSeekModelsEnabled: values.deepSeekModelsEnabled !== false,
          redactionEnabled: values.redactionEnabled !== false,
          visionEnabled: values.visionEnabled !== false,
          visionSource: values.visionSource === 'custom' ? 'custom' : 'existing',
          visionProvider: typeof values.visionProvider === 'string' ? values.visionProvider : '',
          visionModel: typeof values.visionModel === 'string' ? values.visionModel : '',
          visionProtocol: values.visionProtocol === 'anthropic' || values.visionProtocol === 'ollama'
            ? values.visionProtocol : 'openai',
          visionBaseURL: typeof values.visionBaseURL === 'string' ? values.visionBaseURL : '',
          visionCustomModel: typeof values.visionCustomModel === 'string' ? values.visionCustomModel : '',
          visionCredentialRef: typeof values.visionCredentialRef === 'string' ? values.visionCredentialRef : 'DELTA_VISION_API_KEY',
        })
      }, [version, dirty])

      const change = <K extends keyof PrivacyVisionDraft>(key: K, value: PrivacyVisionDraft[K]): void => {
        setDraft(current => ({ ...current, [key]: value }))
        setDirty(true)
      }
      const save = async (): Promise<void> => {
        if (!form || snapshot?.writable === false || busy) return
        if (draft.visionSource === 'custom') {
          try {
            const endpoint = new URL(draft.visionBaseURL)
            if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
              throw new Error('invalid URL')
            }
          } catch { setStatus(copy.ui.visionFailed); return }
          if (!draft.visionCustomModel.trim() || (draft.visionCredentialRef.trim() &&
              !/^[A-Za-z_][A-Za-z0-9_]*$/.test(draft.visionCredentialRef.trim()))) {
            setStatus(copy.ui.visionFailed); return
          }
        }
        setBusy(true); setStatus('')
        try {
          const operations = Object.entries(draft).map(([path, value]) => ({ op: 'set' as const, path: [path], value }))
          const result = await form.mutate(operations, snapshot?.revision)
          if (result === false || (result && typeof result === 'object' && (result as any).ok === false)) {
            setStatus(copy.ui.visionFailed); return
          }
          if (keyDraft) {
            const ref = draft.visionCredentialRef.trim()
            const remote = deltaCredentialRemote
            if (!ref || !remote?.set) { setStatus(copy.ui.visionMissingForm); return }
            const credentialResult = await remote.set({ ref, value: keyDraft })
            if (credentialResult && typeof credentialResult === 'object' && (credentialResult as any).ok === false) {
              setStatus(copy.ui.visionFailed); return
            }
            setKeyDraft('')
            setStatus(copy.ui.visionKeySaved)
          } else setStatus(copy.ui.visionSaved)
          setDirty(false)
        } catch { setStatus(copy.ui.visionFailed) }
        finally { setBusy(false) }
      }
      const restore = async (): Promise<void> => {
        if (!form || !snapshot || snapshot.writable === false || busy) return
        setBusy(true); setStatus('')
        try {
          const fields = Object.keys(PRIVACY_VISION_DEFAULTS)
          const result = await form.mutate(fields.map(path => ({ op: 'unset' as const, path: [path] })), snapshot.revision)
          if (result === false || (result && typeof result === 'object' && (result as any).ok === false)) throw new Error('rejected')
          setDirty(false); setStatus(copy.ui.visionSaved)
        } catch { setStatus(copy.ui.visionFailed) }
        finally { setBusy(false) }
      }
      const clearCredential = async (): Promise<void> => {
        const ref = draft.visionCredentialRef.trim()
        if (!ref || !deltaCredentialRemote?.unset || busy) { setStatus(copy.ui.visionMissingForm); return }
        setBusy(true); setStatus('')
        try {
          const result = await deltaCredentialRemote.unset({ ref })
          if (result && typeof result === 'object' && (result as any).ok === false) throw new Error('rejected')
          setStatus(copy.ui.visionSaved)
        } catch { setStatus(copy.ui.visionFailed) }
        finally { setBusy(false) }
      }
      const textField = (label: string, key: 'visionProvider' | 'visionModel' | 'visionBaseURL' | 'visionCustomModel' | 'visionCredentialRef', type = 'text'): unknown =>
        el('label', { className: 'dtd-privacy-field' }, label,
          el('input', { type, value: draft[key], spellCheck: false, onChange: (event: any) => change(key, event.target.value) }))
      if (!form) return el('section', { className: 'dtd-privacy-settings', 'aria-label': copy.ui.privacyVisionTitle },
        el('h4', null, copy.ui.privacyVisionTitle), el('p', null, copy.ui.visionMissingForm))
      return el('section', { className: 'dtd-privacy-settings', 'aria-label': copy.ui.privacyVisionTitle },
        el('h4', null, copy.ui.privacyVisionTitle),
        el('h4', null, copy.ui.modelRoutesTitle),
        preferenceRow(copy.ui.deepSeekModelsEnabled, copy.ui.deepSeekModelsEnabledDescription, draft.deepSeekModelsEnabled,
          value => change('deepSeekModelsEnabled', value)),
        preferenceRow(copy.ui.redactionEnabled, copy.ui.redactionDescription, draft.redactionEnabled,
          value => change('redactionEnabled', value)),
        preferenceRow(copy.ui.visionEnabled, copy.ui.visionEnabledDescription, draft.visionEnabled,
          value => change('visionEnabled', value)),
        el('label', { className: 'dtd-privacy-field' }, copy.ui.visionSource,
          el('select', { value: draft.visionSource, onChange: (event: any) => change('visionSource', event.target.value) },
            el('option', { value: 'existing' }, copy.ui.visionExisting),
            el('option', { value: 'custom' }, copy.ui.visionCustom))),
        draft.visionSource === 'existing' ? el('div', { className: 'dtd-privacy-grid' },
          textField(copy.ui.visionProvider, 'visionProvider'), textField(copy.ui.visionModel, 'visionModel'))
          : el('div', null,
            el('label', { className: 'dtd-privacy-field' }, copy.ui.visionProtocol,
              el('select', { value: draft.visionProtocol, onChange: (event: any) => change('visionProtocol', event.target.value) },
                el('option', { value: 'openai' }, 'OpenAI-compatible'),
                el('option', { value: 'anthropic' }, 'Anthropic Messages'),
                el('option', { value: 'ollama' }, 'Ollama'))),
            el('div', { className: 'dtd-privacy-grid' },
              textField(copy.ui.visionBaseURL, 'visionBaseURL', 'url'),
              textField(copy.ui.visionCustomModel, 'visionCustomModel')),
            textField(copy.ui.visionCredentialRef, 'visionCredentialRef'),
            el('label', { className: 'dtd-privacy-field' }, copy.ui.visionCredentialPlaceholder,
              el('input', { type: 'password', autoComplete: 'new-password', value: keyDraft,
                onChange: (event: any) => setKeyDraft(event.target.value) })),
            el('p', { className: 'dtd-privacy-note' }, copy.ui.visionCredentialHint),
            el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busy,
              onClick: () => void clearCredential() }, copy.ui.visionClearCredential)),
        el('p', { className: 'dtd-privacy-note' }, copy.ui.visionAdmissionHint),
        el('div', { className: 'dtd-privacy-actions' },
          el('button', { type: 'button', className: 'dtd-mcp-button is-primary', disabled: busy || snapshot?.writable === false,
            onClick: () => void save() }, copy.ui.visionSave),
          el('button', { type: 'button', className: 'dtd-mcp-button', disabled: busy || snapshot?.writable === false,
            onClick: () => void restore() }, copy.ui.visionRestore)),
        status ? el('p', { role: 'status', className: 'dtd-privacy-status' }, status) : null,
        snapshot?.writable === false ? el('p', { className: 'dtd-privacy-note' }, copy.ui.visionMissingForm) : null)
    }
    function ModelLabelExtension(props: AssistantSlotProps & {
      provider?: { id?: string; name?: string }; model?: { name?: string }; placement?: string
    }): unknown {
      const prefs = useFeaturePreferences(React)
      const showModel = prefs.showModelInfo && typeof props.model?.name === 'string'
      const showAccount = prefs.showDeepSeekAccountInfo && props.provider?.id === 'deepseek-account' &&
        typeof props.provider.name === 'string' && props.placement !== 'option'
      if (!showModel && !showAccount) return null
      return el('span', { className: 'dtd-model-label', 'data-placement': props.placement || '' },
        showAccount ? el('span', { className: 'dtd-model-account' }, props.provider?.name) : null,
        showModel ? el('span', { className: 'dtd-model-name' }, props.model?.name) : null)
    }
    function AssistantInputControls(props: AssistantSlotProps): unknown {
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
      const openDiscussion = async (): Promise<void> => {
        const context = conversationContext(chat)
        const status = session.running ? 'running' : session.awaitingFirstTurn ? 'waiting for first turn' : 'idle'
        const prompt = `You are an independent discussion assistant for the user's main task. Discuss ideas, clarify requirements, and help plan corrections. This is a separate session: do not claim to have changed or interrupted the main task.\n\nMain task session: ${props.sessionId}\nMain task status: ${status}\n\nRecent loaded conversation context (may be incomplete):\n${context || '(no conversation excerpt available)'}`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'discussion', prompt)
          setMessage(copy.ui.assistantReady)
        } catch (error) { setMessage(error instanceof Error ? error.message : copy.ui.assistantUnavailable) }
      }
      const optimize = async (): Promise<void> => {
        if (!prefs.inputOptimization) { setMessage(copy.ui.optimizationDisabled); return }
        if (!draft.trim()) return
        const original = draft
        const context = conversationContext(chat, 1800)
        const prompt = `Optimize the user's draft while preserving its exact intent, facts, tone, and constraints. Do not add unsupported facts, requirements, or commitments. Return only the revised text, with no preface or explanation.\n\nMain task context (use only to resolve references; do not add facts):\n${context || '(none)'}\n\n<original-user-input>\n${original}\n</original-user-input>`
        try {
          setMessage(copy.ui.assistantStarting)
          await openAssistantSession(props.sessionId, 'optimization', prompt, {
            purpose: 'optimization', parentSessionId: props.sessionId, originalDraft: original,
            getCurrentDraft: () => sessionRef.current === props.sessionId ? draftRef.current : '',
            inputActions: props.inputActions,
          })
          setMessage(copy.ui.assistantReady)
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
      const workflow = assistantWorkflows.get(props.sessionId)
      const chat = props.useChat(state => state)
      const [open, setOpen] = React.useState(false)
      const [edited, setEdited] = React.useState('')
      const [message, setMessage] = React.useState('')
      if (!workflow || workflow.purpose !== 'optimization' || !props.messageId) return null
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
        el('button', { type: 'button', className: 'dtd-context-action', onClick: () => { setEdited(generated); setOpen(true); setMessage('') } }, copy.ui.previewOptimization),
        open ? el('div', { className: 'dtd-optimizer-preview', role: 'dialog', 'aria-label': copy.ui.previewOptimization },
          el('label', null, copy.ui.previewOptimization),
          el('textarea', { value: edited, rows: 7, onChange: (event: { currentTarget: { value: string } }) => setEdited(event.currentTarget.value) }),
          message ? el('p', { role: 'alert' }, message) : null,
          el('div', { className: 'dtd-context-actions' },
            el('button', { type: 'button', onClick: () => {
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
              const write = navigator.clipboard?.writeText(edited)
              if (write) void write.then(() => setMessage(copy.ui.copied), () => setMessage(copy.ui.copyFailed))
              else setMessage(copy.ui.copyFailed)
            } }, copy.ui.copyText),
            el('button', { type: 'button', onClick: () => setOpen(false) }, copy.ui.cancel))) : null)
    }
    function CompactionActivityAction(props: AssistantSlotProps): unknown {
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const chat = props.useChat(state => state)
      const status = props.useProjection<{ seq?: number; phase?: 'idle' | 'running' | 'completed' | 'failed'; failed?: boolean }>(
        'deltaContextCompactionStatus')
      if (!props.messageId || props.messageId !== latestAssistantMessageId(chat) || !status || (status.seq ?? -1) < 0) return null
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
      const session = props.useSession(state => state)
      const conversation = props.useConversation?.((value: any) => value)
      const active = !!conversation && (conversation.activeTargets?.size > 0 || !session.blank || session.running)
      const phase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank'
      const FixedChatView = (viewProps: { renderSlot(name: string, input: Record<string, unknown>): unknown }): unknown =>
        viewProps.renderSlot('conversation.session', { view: 'chat' })
      return props.renderFactorySlot?.('conversation.content',
        { variant: 'embedded', phase, hero: phase === 'blank' }, { slots: { views: FixedChatView } }) ?? null
    }
    function AssistantTabBody(props: AssistantSlotProps): unknown {
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
      const usage = readContextUsage(mainPressure)
      const turns = mainChat.timeline?.turnOrder?.length ?? 0
      const contextExcerpt = conversationContext(mainChat, 3000)
      const parentId = resource?.value?.parentSessionId || mainState.sessionId
      const mainStatus = mainState.running ? copy.ui.sessionRunning
        : mainState.awaitingFirstTurn ? copy.ui.assistantStarting : copy.ui.sessionIdle
      const checkpoint = latestCheckpoint(mainChat)
      const send = async (): Promise<void> => {
        if (!confirm || !correction.trim() || queuePending) return
        setQueuePending(true)
        try {
          const ok = await queueMainCorrection(parentId, correction.trim())
          setFeedback(ok ? copy.ui.correctionQueued : copy.ui.correctionFailed)
          if (ok) { setCorrection(''); setConfirm(false); setCorrectionOpen(false) }
        } catch { setFeedback(copy.ui.correctionFailed) }
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
              onClick: () => { setCorrectionOpen(true); setConfirm(false); setFeedback('') } }, copy.ui.queueCorrection) : null,
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
    function SessionHoverDetail({ sessionId }: SessionHoverProps, liveState: string): unknown {
      const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const label = copy.ui.sessionId
      // A missing/not-ready Host snapshot renders only the safe session ID.
      const [running, timestamp] = liveState.split(':')
      const millis = Number(timestamp)
      const updated = timestamp && Number.isFinite(millis) && millis > 0
        ? new Date(millis) : undefined
      const updatedText = updated && Number.isFinite(updated.getTime())
        ? updated.toLocaleString(language() === 'zh' ? 'zh-CN' : 'en-US') : undefined
      return el('div', { className: 'dtd-session-meta' },
        running === '1'
          ? el('span', { className: 'dtd-session-meta-status', role: 'status' }, copy.ui.sessionRunning) : null,
        updatedText ? el('span', { className: 'dtd-session-meta-time' },
          copy.ui.sessionUpdated + ': ' + updatedText) : null,
        el('span', { className: 'dtd-session-meta-label' }, label),
        el('span', { className: 'dtd-session-meta-id', title: sessionId }, shortId),
        el('button', {
          type: 'button', className: 'dtd-session-meta-copy',
          'aria-label': copy.ui.copySessionId,
          onClick: () => {
            const labels = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
            const request = navigator.clipboard?.writeText(sessionId)
            if (!request) { showDeltaToast(labels.copyFailed); return }
            void request.then(() => showDeltaToast(labels.copied), () => showDeltaToast(labels.copyFailed))
          },
        }, copy.ui.copy))
    }
    function SessionHoverExtension(props: SessionHoverProps, controller: DeltaController): unknown {
      // Keep the hook unconditional across appearance switches.
      const state = React.useSyncExternalStore(subscribeHoverSessions,
        () => readHoverState(props.sessionId))
      return controller.getSnapshot().mode === 'delta' ? SessionHoverDetail(props, state) : null
    }
    function PersonalizationSection({ controller }: DeltaProps): unknown {
      deltaFeatures.ensureLoaded()
      const { state, copy } = useCopy(controller)
      const fSnap = React.useSyncExternalStore(deltaFeatures.subscribe, deltaFeatures.getSnapshot)
      const [draftHttp, setDraftHttp] = React.useState<string | null>(null)
      const [draftHttps, setDraftHttps] = React.useState<string | null>(null)
      const [draftNo, setDraftNo] = React.useState<string | null>(null)
      const [manualModeActive, setManualModeActive] = React.useState<ClientProxyMode | null>(null)

      const activeMode = manualModeActive ?? fSnap.proxy.mode
      const httpVal = draftHttp ?? fSnap.proxy.httpProxy
      const httpsVal = draftHttps ?? fSnap.proxy.httpsProxy
      const noVal = draftNo ?? fSnap.proxy.noProxy

      const eff = fSnap.effectiveProxy
      const effUrl = eff?.httpsProxy || eff?.httpProxy || ''
      const effText = !eff || eff.source === 'direct'
        ? copy.networkProxy.statusDirect
        : eff.source === 'manual'
          ? copy.networkProxy.statusManual.replace('{proxy}', effUrl)
          : eff.source === 'system-env'
            ? copy.networkProxy.statusSystemEnv.replace('{proxy}', effUrl)
            : copy.networkProxy.statusSystemReg.replace('{proxy}', effUrl)

      const selectProxyMode = (mode: ClientProxyMode): void => {
        setManualModeActive(mode)
        if (mode !== 'manual') {
          void deltaFeatures.saveProxy({ mode, httpProxy: httpVal, httpsProxy: httpsVal, noProxy: noVal }).then(ok => {
            if (ok) setManualModeActive(null)
          })
        }
      }

      const privacyItems = [
        copy.privacy.sessionLogBlocked,
        copy.privacy.telemetryBlocked,
        copy.privacy.geolocationOff,
        copy.privacy.redactionActive,
      ]
      return el('section', { className: 'dtd-page', 'data-delta-personalization': '',
        'aria-label': copy.ui.personalization },
        el('h2', { className: 'dtd-page-title' }, copy.meta.title),
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

        el('div', { className: 'dtd-form-stack', 'data-delta-proxy-card': '' },
          el('div', { className: 'dtd-preference-row', style: { padding: 0, border: 'none', background: 'transparent' } },
            el('div', { className: 'dtd-preference-copy' },
              el('strong', null, copy.networkProxy.title),
              el('p', null, copy.networkProxy.description)),
            el('div', { className: 'dtd-segment', role: 'group', 'aria-label': copy.networkProxy.modeLabel },
              (['system', 'direct', 'manual'] as const).map(pm =>
                el('button', {
                  key: pm,
                  type: 'button',
                  'aria-pressed': activeMode === pm,
                  className: activeMode === pm ? 'dtd-active' : '',
                  disabled: fSnap.proxyBusy,
                  onClick: () => selectProxyMode(pm),
                }, pm === 'system' ? copy.networkProxy.modeSystem : pm === 'direct' ? copy.networkProxy.modeDirect : copy.networkProxy.modeManual)))),
          activeMode === 'manual' ? el('div', { className: 'dtd-form-field' },
            el('label', null, copy.networkProxy.httpProxyLabel),
            el('input', {
              type: 'text',
              className: 'dtd-form-input',
              placeholder: copy.networkProxy.httpProxyPlaceholder,
              value: httpVal,
              onChange: (e: any) => setDraftHttp(String(e?.target?.value ?? '')),
            }),
            el('label', null, copy.networkProxy.httpsProxyLabel),
            el('input', {
              type: 'text',
              className: 'dtd-form-input',
              placeholder: copy.networkProxy.httpsProxyPlaceholder,
              value: httpsVal,
              onChange: (e: any) => setDraftHttps(String(e?.target?.value ?? '')),
            }),
            el('label', null, copy.networkProxy.noProxyLabel),
            el('input', {
              type: 'text',
              className: 'dtd-form-input',
              placeholder: copy.networkProxy.noProxyPlaceholder,
              value: noVal,
              onChange: (e: any) => setDraftNo(String(e?.target?.value ?? '')),
            }),
            fSnap.proxyError ? el('p', { role: 'alert', className: 'dtd-error' }, fSnap.proxyError) : null,
            el('div', { className: 'dtd-dialog-actions' },
              el('button', {
                type: 'button',
                className: 'dtd-btn-primary',
                disabled: fSnap.proxyBusy,
                onClick: () => {
                  void deltaFeatures.saveProxy({
                    mode: 'manual',
                    httpProxy: httpVal,
                    httpsProxy: httpsVal,
                    noProxy: noVal,
                  }).then(ok => {
                    if (ok) {
                      setDraftHttp(null); setDraftHttps(null); setDraftNo(null); setManualModeActive(null)
                    }
                  })
                },
              }, copy.networkProxy.save))) : null,
          el('p', { className: 'dtd-current', role: 'status' }, `${copy.networkProxy.statusLabel}: ${effText}`),
          el('p', { className: 'dtd-current' }, copy.networkProxy.note)),

        el('div', { className: 'dtd-privacy-card', 'data-delta-privacy-card': '' },
          el('div', { className: 'dtd-privacy-header' },
            el('strong', null, copy.privacy.title),
            el('span', { className: 'dtd-privacy-badge' }, copy.privacy.statusEnforced)),
          el('p', null, copy.privacy.description),
          el('ul', { className: 'dtd-privacy-list' },
            privacyItems.map((itemText, idx) =>
              el('li', { key: idx, className: 'dtd-privacy-item' },
                el('span', { className: 'dtd-privacy-dot', 'aria-hidden': true }),
                el('span', null, itemText)))),
          el('div', { className: 'dtd-pin-manage-row' },
            el('span', null, `${copy.sessionMenu.pinSettingsTitle}: ${fSnap.hasPin ? copy.sessionMenu.pinSetStatus : copy.sessionMenu.pinUnsetStatus}`),
            fSnap.hasPin ? el('button', {
              type: 'button',
              className: 'dtd-btn-secondary',
              onClick: () => deltaFeatures.openClearPinDialog(),
            }, copy.sessionMenu.clearPin) : null)),
        el('p', { className: 'dtd-current', role: 'status' },
          copy.ui.status + ': ' + (state.mode === 'delta' ? copy.ui.delta : copy.ui.official)),
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, state.themeReady ? copy.ui.unavailable : copy.ui.themeWaiting) : null,
        state.mode === 'delta' ? el('details', {
          className: 'dtd-integration',
          'data-delta-contract-version': '1',
          'data-delta-integration': 'incomplete',
        },
        el('summary', null, copy.ui.integrationTitle),
        el('p', null, copy.ui.integrationSummary),
        el('ul', null,
          el('li', null, copy.ui.integrationSidebar),
          el('li', null, copy.ui.integrationCollapse),
          el('li', null, copy.ui.integrationDeletion),
          el('li', null, copy.ui.integrationRunning))) : null,
        el('details', { className: 'dtd-advanced-features' },
          el('summary', null, copy.ui.contextFeatures),
          el(FeaturePreferencesSection, {})))
    }
    return {
      inject: [],
      apply(ctx) {
        try {
          ctx.inject(['slots'], (scope) => {
            try {
              const controller = createController() as DeltaController & {
                syncLanguage(): void
                bindTheme(theme: ThemeApi | undefined): void
                bindLayout(layout: LayoutApi | undefined): void
                bindSidebarRight(sidebarRight: SidebarRightApi | undefined): void
              }
              scope.effect(() => {
                const tag = document.createElement('style')
                tag.dataset.plugin = DELTA_DESKTOP_OWNER
                tag.textContent = OWNED_CSS
                document.head.appendChild(tag)
                const observer = typeof MutationObserver !== 'undefined'
                  ? new MutationObserver(() => controller.syncLanguage()) : undefined
                observer?.observe(document.documentElement, {
                  attributes: true, attributeFilter: ['lang'],
                })

                const syncAppearance = (): void => {
                  if (controller.getSnapshot().mode === 'delta') {
                    document.documentElement.setAttribute('data-delta-ui', 'delta')
                    document.body?.setAttribute?.('data-delta-ui', 'delta')
                  } else {
                    document.documentElement.removeAttribute('data-delta-ui')
                    document.body?.removeAttribute?.('data-delta-ui')
                  }
                }
                syncAppearance()
                deltaFeatures.ensureLoaded()
                const stopAppearance = controller.subscribe(syncAppearance)
                const stopPrivacyGuards = installClientPrivacyGuards()
                
                // Adapt runtime chat status: "\u6df1\u5ea6\u6c42\u7d22\u4e2d" -> "\u4efb\u52a1\u6267\u884c\u4e2d"
                let isEffectDisposed = false
                const slotRestorers: Array<() => void> = []
                let stopLocaleSync: (() => void) | undefined
                let restoreLocaleOnDispose: (() => void) | undefined
                try {
                  const slotsObj = scope.slots as any
                  const filterSlotEntries = (slotName: string, list: any): any => {
                    if (isEffectDisposed || !Array.isArray(list)) return list
                    if (slotName === 'settings.general.item') {
                      return list.filter((item: any) => item?.options?.id !== 'session-log-deepseek' && item?.options?.id !== 'current-version')
                    }
                    if (slotName === 'conversation.chat.assistant-actions') {
                      return list.filter((item: any) => item?.options?.id !== 'feedback')
                    }
                    if (slotName === 'conversation.input.overlay') {
                      return list.filter((item: any) => item?.options?.id !== 'feedback-dialog')
                    }
                    if (controller.getSnapshot().mode === 'delta' && slotName === 'settings.section') {
                      return list.map((item: any) => item?.options?.id === 'agent-presets'
                        ? { ...item, options: { ...item.options, order: 9999 } }
                        : item)
                    }
                    return list
                  }
                  const wrapSlotMethod = (target: any, methodName: string): void => {
                    if (!target || typeof target[methodName] !== 'function') return
                    const flag = '__deltaWrapped_' + methodName
                    if (target[flag]) return
                    target[flag] = true
                    const origFn = target[methodName]
                    target[methodName] = function(this: any, slotName: string) {
                      return filterSlotEntries(slotName, origFn.apply(this, arguments))
                    }
                    slotRestorers.push(() => {
                      if (target[methodName] !== origFn) target[methodName] = origFn
                      delete target[flag]
                    })
                  }
                  try {
                    wrapSlotMethod(slotsObj, 'entries')
                    wrapSlotMethod(slotsObj, 'entriesOfSlot')
                    wrapSlotMethod(slotsObj?._core, 'entries')
                    wrapSlotMethod(slotsObj?._core, 'entriesOfSlot')
                    wrapSlotMethod(slotsObj?._host, 'entriesOf')
                    wrapSlotMethod(slotsObj?._host, 'entriesOfSlot')
                    slotsObj?.ctx?.emit?.('slots/changed', 'settings.general.item')
                  } catch { /* Slots entries wrapper is optional */ }
                  const origDictValues = new Map<Record<string, string>, Record<string, string | undefined>>()
                  const setDictEntry = (dict: Record<string, string>, key: string, nextValue: string, isActive: boolean): boolean => {
                    let origMap = origDictValues.get(dict)
                    if (!origMap) {
                      origMap = {}
                      origDictValues.set(dict, origMap)
                    }
                    if (!(key in origMap)) origMap[key] = dict[key]
                    if (isActive) {
                      if (dict[key] !== nextValue) {
                        dict[key] = nextValue
                        return true
                      }
                      return false
                    } else if (origMap[key] !== undefined) {
                      if (dict[key] !== origMap[key]) {
                        dict[key] = origMap[key]
                        return true
                      }
                      return false
                    } else if (key in dict) {
                      delete dict[key]
                      return true
                    }
                    return false
                  }
                  const patchZhEntryMap = (ns: string, dict: Record<string, string>, isActiveMode: boolean): boolean => {
                    let hasChanges = false
                    const lowerNs = ns.toLowerCase()
                    if (lowerNs === 'chat') {
                      if (setDictEntry(dict, 'chat.deepDiving', '\u4efb\u52a1\u6267\u884c\u4e2d', isActiveMode)) hasChanges = true
                      if (setDictEntry(dict, 'chat.deepDivingFor', '\u4efb\u52a1\u6267\u884c\u4e2d，\u7528\u65f6 {duration} ···', isActiveMode)) hasChanges = true
                    }
                    const isSettingsNs = lowerNs.includes('setting') || lowerNs.includes('account') || lowerNs.includes('model')
                    const isScheduleNs = lowerNs.includes('schedule')
                    const isPluginManagerNs = lowerNs === 'pluginmanager' || lowerNs.includes('plugin')
                    const origMap = origDictValues.get(dict)
                    for (const k of Object.keys(dict)) {
                      const baseline = origMap && k in origMap ? origMap[k] : dict[k]
                      if (baseline === '\u8d26\u53f7\u4e0e\u4f59\u989d' && (isSettingsNs || k === 'nav' || k.endsWith('.nav'))) {
                        if (setDictEntry(dict, k, '\u8d26\u6237\u8be6\u60c5', isActiveMode)) hasChanges = true
                      } else if (baseline === '\u6a21\u578b' && (isSettingsNs || k === 'nav' || k === 'title' || k.endsWith('.nav') || k.endsWith('.title'))) {
                        if (setDictEntry(dict, k, '\u6a21\u578b\u914d\u7f6e', isActiveMode)) hasChanges = true
                      } else if (baseline === '\u81ea\u52a8\u5316\u4efb\u52a1' && (isScheduleNs || k === 'panel' || k === 'title' || k === 'trigger.label')) {
                        if (setDictEntry(dict, k, '\u5b9a\u65f6\u4efb\u52a1', isActiveMode)) hasChanges = true
                      } else if (baseline === '\u63d2\u4ef6' && (isPluginManagerNs && (k === 'panel' || k === 'title' || k === 'crumbRoot') || k === 'panel' || k === 'title')) {
                        if (setDictEntry(dict, k, '\u63d2\u4ef6\u7ba1\u7406', isActiveMode)) hasChanges = true
                      }
                    }
                    return hasChanges
                  }
                  const attachLocalePatch = (localeInput: any): void => {
                    const localeRuntime = unwrapCordisOriginal(localeInput)
                    if (!localeRuntime || localeRuntime.__deltaLocaleAttached) return
                    localeRuntime.__deltaLocaleAttached = true
                    const syncLocaleDict = (shouldNotify: boolean): void => {
                      const activeMode = !isEffectDisposed && controller.getSnapshot().mode === 'delta'
                      let hasAnyChanges = false
                      const chatLocales = localeRuntime.dicts?.get?.('chat')
                      if (chatLocales && typeof chatLocales.entries === 'function') {
                        for (const [locKey, zhDict] of chatLocales.entries()) {
                          if (typeof locKey !== 'string' || !locKey.toLowerCase().startsWith('zh') || !zhDict || typeof zhDict !== 'object') continue
                          if (setDictEntry(zhDict, 'chat.deepDiving', '\u4efb\u52a1\u6267\u884c\u4e2d', activeMode)) hasAnyChanges = true
                          if (setDictEntry(zhDict, 'chat.deepDivingFor', '\u4efb\u52a1\u6267\u884c\u4e2d，\u7528\u65f6 {duration} ···', activeMode)) hasAnyChanges = true
                        }
                      }
                      if (typeof localeRuntime.dicts?.forEach === 'function') {
                        localeRuntime.dicts.forEach((nsMap: any, ns: string) => {
                          if (typeof ns !== 'string' || typeof nsMap?.entries !== 'function') return
                          for (const [locKey, zh] of nsMap.entries()) {
                            if (typeof locKey !== 'string' || !locKey.toLowerCase().startsWith('zh') || !zh || typeof zh !== 'object') continue
                            if (patchZhEntryMap(ns, zh, activeMode)) hasAnyChanges = true
                          }
                        })
                      }
                      if (shouldNotify || hasAnyChanges) {
                        try {
                          const active = localeRuntime.snapshot?.active
                          if (active && typeof localeRuntime.publish === 'function') {
                            localeRuntime.publish(active, false)
                          }
                        } catch {}
                      }
                    }
                    syncLocaleDict(false)
                    restoreLocaleOnDispose = () => syncLocaleDict(true)
                    let lastMode = controller.getSnapshot().mode
                    stopLocaleSync = controller.subscribe(() => {
                      const nextMode = controller.getSnapshot().mode
                      if (nextMode === lastMode) return
                      lastMode = nextMode
                      syncLocaleDict(true)
                    })
                    if (typeof localeRuntime.register === 'function' && !localeRuntime.__deltaPatched) {
                      localeRuntime.__deltaPatched = true
                      const origRegister = localeRuntime.register
                      localeRuntime.register = function(this: any, ns: string, localeOrDicts: any, dict?: any) {
                        const activeMode = !isEffectDisposed && controller.getSnapshot().mode === 'delta'
                        if (typeof ns === 'string') {
                          try {
                            if (typeof localeOrDicts === 'string' && localeOrDicts.toLowerCase().startsWith('zh') && dict && typeof dict === 'object') {
                              patchZhEntryMap(ns, dict, activeMode)
                            } else if (localeOrDicts && typeof localeOrDicts === 'object' && localeOrDicts.zh && typeof localeOrDicts.zh === 'object') {
                              patchZhEntryMap(ns, localeOrDicts.zh, activeMode)
                            }
                          } catch {}
                        }
                        const res = origRegister.apply(this, arguments)
                        try { syncLocaleDict(false) } catch {}
                        return res
                      }
                    }
                    if (typeof localeRuntime.translate === 'function' && !localeRuntime.__deltaTranslatePatched) {
                      localeRuntime.__deltaTranslatePatched = true
                      const origTranslate = localeRuntime.translate
                      localeRuntime.translate = function(this: any, ns: string, key: string, params: any) {
                        const activeMode = !isEffectDisposed && controller.getSnapshot().mode === 'delta'
                        if (activeMode && (ns === 'chat' || ns === 'common')) {
                          if (key === 'chat.deepDiving') return '\u4efb\u52a1\u6267\u884c\u4e2d'
                          if (key === 'chat.deepDivingFor') {
                            const template = '\u4efb\u52a1\u6267\u884c\u4e2d，\u7528\u65f6 {duration} ···'
                            if (!params) return template
                            return template.replace(/\{(\w+)\}/g, (match: string, name: string) => name in params ? String(params[name]) : match)
                          }
                        }
                        const res = origTranslate.apply(this, arguments)
                        if (activeMode && typeof res === 'string') {
                          const lowerNs = typeof ns === 'string' ? ns.toLowerCase() : ''
                          const lowerKey = typeof key === 'string' ? key.toLowerCase() : ''
                          const isNavOrSettings = lowerNs.includes('setting') || lowerNs.includes('account') || lowerNs.includes('model')
                            || lowerKey === 'nav' || lowerKey.endsWith('.nav') || lowerKey === 'title' || lowerKey.endsWith('.title')
                          if (isNavOrSettings) {
                            if (res === '\u8d26\u53f7\u4e0e\u4f59\u989d') return '\u8d26\u6237\u8be6\u60c5'
                            if (res === '\u6a21\u578b') return '\u6a21\u578b\u914d\u7f6e'
                          }
                          if (res === '\u81ea\u52a8\u5316\u4efb\u52a1' && (lowerNs.includes('schedule') || lowerKey === 'panel' || lowerKey === 'title')) {
                            return '\u5b9a\u65f6\u4efb\u52a1'
                          }
                          if (res === '\u63d2\u4ef6' && ((lowerNs.includes('plugin') && (lowerKey === 'panel' || lowerKey === 'title' || lowerKey === 'crumbroot')) || lowerKey === 'panel' || lowerKey === 'title')) {
                            return '\u63d2\u4ef6\u7ba1\u7406'
                          }
                        }
                        return res
                      }
                    }
                  }
                  const findLocaleRuntime = (obj: any): any => {
                    const target = unwrapCordisOriginal(obj)
                    if (!target || typeof target !== 'object') return undefined
                    const directLocale = unwrapCordisOriginal(target._locale)
                    if (directLocale && typeof directLocale === 'object' && typeof directLocale.translate === 'function') {
                      return directLocale
                    }
                    try {
                      for (const val of Object.values(target)) {
                        const rawVal = unwrapCordisOriginal(val)
                        if (rawVal && typeof rawVal === 'object' && (rawVal as any).dicts instanceof Map && typeof (rawVal as any).translate === 'function') {
                          return rawVal
                        }
                      }
                    } catch {}
                    return undefined
                  }
                  const rawSlots = unwrapCordisOriginal(slotsObj)
                  const discovered = findLocaleRuntime(rawSlots)
                  if (discovered) {
                    attachLocalePatch(discovered)
                  }
                  if (rawSlots && typeof rawSlots.installLocale === 'function' && !rawSlots.__deltaLocaleHooked) {
                    try {
                      rawSlots.__deltaLocaleHooked = true
                      const origInstallLocale = rawSlots.installLocale
                      rawSlots.installLocale = function(this: any, face: any) {
                        const res = origInstallLocale.apply(this, arguments)
                        try { attachLocalePatch(face) } catch {}
                        return res
                      }
                    } catch {}
                  }
                  try {
                    scope.inject(['locale'], localeScope => {
                      const loc = unwrapCordisOriginal((localeScope as { locale?: any })?.locale ?? localeScope?.get?.('locale'))
                      if (loc) attachLocalePatch(loc)
                    })
                  } catch { /* Locale service is optional */ }
                } catch { /* Locale runtime is optional and gracefully degraded */ }

                return () => {
                  isEffectDisposed = true
                  for (const restore of slotRestorers) { try { restore() } catch {} }
                  observer?.disconnect()
                  stopLocaleSync?.()
                  restoreLocaleOnDispose?.()
                  stopAppearance()
                  stopPrivacyGuards()
                  clearDeltaToasts()
                  document.documentElement.removeAttribute('data-delta-ui')
                  document.body?.removeAttribute?.('data-delta-ui')
                  syncModalChromeOverlay()
                  tag.parentNode?.removeChild(tag)
                  controller.dispose()
                }
              }, 'dsh-delta-desktop: personalization resource ownership')

              scope.effect(() => () => closeMcpManagement(),
                'dsh-delta-desktop: MCP management dialog ownership')
              // MCP settings are optional public Host services. Writes go through
              // ConfigForms; runtime status and recovery go through the MCP Manager.
              try { scope.inject(['configForms', 'remote'], mcpScope => {
                const candidate = mcpScope as ClientContext
                mcpScope.effect(() => {
                  const form = candidate.configForms?.get('dsh-delta-desktop')
                  const credentialRemote = candidate.remote?.credentials
                  deltaSettingsForm = form
                  deltaCredentialRemote = credentialRemote
                  const unsubscribe = form?.subscribe(publishDeltaSettings)
                  publishDeltaSettings()
                  return () => {
                    unsubscribe?.()
                    if (deltaSettingsForm === form) deltaSettingsForm = undefined
                    if (deltaCredentialRemote === credentialRemote) deltaCredentialRemote = undefined
                    publishDeltaSettings()
                  }
                }, 'dsh-delta-desktop: privacy and vision settings form')
                mcpScope.effect(() => {
                  const current: McpServices = {
                    // The current Desktop Profile names the official manager
                    // entry `mcp-manager`; some custom Profiles use `mcp`.
                    form: candidate.configForms?.get('mcp-manager') ?? candidate.configForms?.get('mcp'),
                    manager: candidate.remote?.mcpManager,
                  }
                  mcpServices = current
                  renderMcpManagement()
                  return () => {
                    if (mcpServices === current) {
                      mcpServices = undefined
                      renderMcpManagement()
                    }
                  }
                }, 'dsh-delta-desktop: optional MCP management services')
              }) } catch { /* Optional MCP services may be unavailable. */ }
              if (MenuItemButton && ReactRoot) {
                scope.slots.inject('plugins.add.actions', () => scope.slots.register<AddPluginActionProps>({
                  name: 'plugins.add.actions',
                  id: 'delta.mcp.add-server',
                  // The official Agent Creator contribution uses the slot default
                  // order (0); this puts MCP directly after the built-in install row.
                  order: -100,
                }, props => el(MenuItemButton!, {
                  icon: el('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none',
                    stroke: 'currentColor', strokeWidth: 1.35, 'aria-hidden': true },
                  el('rect', { x: 2.5, y: 2.5, width: 11, height: 4, rx: 1 }),
                  el('rect', { x: 2.5, y: 9.5, width: 11, height: 4, rx: 1 }),
                  el('circle', { cx: 4.5, cy: 4.5, r: .45, fill: 'currentColor', stroke: 'none' }),
                  el('circle', { cx: 4.5, cy: 11.5, r: .45, fill: 'currentColor', stroke: 'none' })),
                  onSelect: () => {
                  props.onDismiss?.()
                  openMcpManagement()
                } }, el('span', { className: 'dtd-mcp-menu-copy' },
                  el('span', null, (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.mcpAddAction),
                  el('span', { className: 'dtd-mcp-menu-description' },
                    (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.mcpAddDescription)))))
              }
              const settingsModules: ReadonlyArray<{
                id: string
                order: number
                labelKey: keyof DeltaCopy['ui']
                content: (props: DeltaProps) => unknown
                icon: (props: DeltaProps) => unknown
              }> = [
                {
                  id: 'delta.personalization',
                  order: 18,
                  labelKey: 'personalization',
                  content: PersonalizationSection,
                  icon: SettingsSectionIcon,
                },
              ]
              for (const feature of settingsModules) {
                scope.slots.inject('settings.section', () => scope.slots.register({
                  name: 'settings.section',
                  id: feature.id,
                  order: feature.order,
                  label: () => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui[feature.labelKey],
                  inject: () => ({ controller }),
                }, feature.content))
                scope.slots.inject('settings.section.icon', () => scope.slots.register({
                  name: 'settings.section.icon',
                  id: feature.id,
                  order: feature.order,
                }, feature.icon))
              }

              // Context assistance is an optional public Host integration. The
              // parent remains live if an older Host omits any service.
              try { scope.inject(['sessions', 'resources', 'sidebarRightTabs', 'sidebarRight'], assistantScope => {
                const candidate = assistantScope as ClientContext & AssistantServices
                if (!candidate.sessions || !candidate.resources || !candidate.sidebarRightTabs ||
                    !candidate.sidebarRight || !candidate.slots) return
                assistantScope.effect(() => registerAssistantSurface(candidate),
                  'dsh-delta-desktop: Host context and assistant capabilities')
              }) } catch { /* Assistant Host capabilities are optional. */ }
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
                        console.warn('[dsh-delta-desktop] Brand slot registration skipped:', error)
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
              registerBrand('sidebar.brand.mark', 'delta.brand.mark', DeltaBrandMark)
              registerBrand('sidebar.brand.name', 'delta.brand.name', DeltaBrandName)

              scope.slots.inject('sidebar.session.row.hover', () => scope.slots.register<SessionHoverProps>({
                name: 'sidebar.session.row.hover',
                id: 'delta.session.identity',
                order: 500,
              }, props => SessionHoverExtension(props, controller)))
              // The published Workspace Controller is optional for name-only search.
              // It never grants control of workspace deletion or the private expansion store.
              let workspaceService: WorkspacesApi | undefined
              let refreshWorkspaceResults: (() => void) | undefined
              scope.inject(['workspaces'], workspaceScope => {
                const candidate = workspaceScope.workspaces
                if (!candidate || typeof candidate.list?.getSnapshot !== 'function') return
                workspaceScope.effect(() => {
                  workspaceService = candidate
                  const unsubscribe = typeof candidate.list.subscribe === 'function'
                    ? candidate.list.subscribe(() => refreshWorkspaceResults?.()) : undefined
                  refreshWorkspaceResults?.()
                  return () => {
                    unsubscribe?.()
                    if (workspaceService === candidate) workspaceService = undefined
                    refreshWorkspaceResults?.()
                  }
                }, 'dsh-delta-desktop: optional workspace search source')
              })
              // Sidebar presentation is owned by Delta even when optional Host
              // search/navigation services have not started. This makes enable
              // visibly effective without inventing an unsafe fallback action.
              let sessionService: SearchSessionsApi | undefined
              let navigationService: SearchNavigationApi | undefined
              scope.effect(() => {
                // Some supported Host environments activate plugins before the
                // browser document is available. Skip only DOM-less activation.
                if (typeof document.querySelector !== 'function') return
                return installHostSearch(
                  controller, () => sessionService, () => navigationService,
                  () => workspaceService, refresh => { refreshWorkspaceResults = refresh },
                )
              }, 'dsh-delta-desktop: reversible sidebar presentation')
              // Rebind the live services without remounting or dropping the
              // user's sidebar search field. A missing service shows a waiting
              // state; a later Host injection activates real search/navigation.
              scope.inject(['sessions', 'uiWorkspace'], searchScope => {
                if (!searchScope.sessions || !searchScope.uiWorkspace ||
                    typeof searchScope.sessions.search !== 'function' ||
                    typeof searchScope.sessions.list?.getSnapshot !== 'function' ||
                    typeof searchScope.uiWorkspace.openSession !== 'function' ||
                    typeof searchScope.uiWorkspace.startSession !== 'function') return
                searchScope.effect(() => {
                  const sessions = searchScope.sessions!
                  const navigation = searchScope.uiWorkspace!
                  sessionService = sessions
                  navigationService = navigation
                  hoverSessionSource = sessions
                  const unsubscribe = sessions.list.subscribe?.(() => refreshWorkspaceResults?.())
                  refreshWorkspaceResults?.()
                  return () => {
                    unsubscribe?.()
                    if (sessionService === sessions) sessionService = undefined
                    if (navigationService === navigation) navigationService = undefined
                    if (hoverSessionSource === sessions) hoverSessionSource = undefined
                    refreshWorkspaceResults?.()
                  }
                }, 'dsh-delta-desktop: optional Host search and navigation')
              })
              // Match the native New Session permission gate without reading any
              // private access state: whenAccess handles future grant/revoke updates.
              scope.inject(['remoteAccess'], accessScope => {
                if (typeof accessScope.remoteAccess?.whenAccess !== 'function') return
                accessScope.effect(() => {
                  const release = accessScope.remoteAccess!.whenAccess('session/create', () => {
                    controller.setCreateAllowed(true)
                    return () => controller.setCreateAllowed(false)
                  })
                  return () => {
                    release()
                    controller.setCreateAllowed(false)
                  }
                }, 'dsh-delta-desktop: native session-create authorization')
              })
              // Theme is optional: delayed service readiness never blocks Settings.
              scope.inject(['theme'], themeScope => {
                controller.bindTheme(themeScope.theme)
                themeScope.effect(() => () => controller.bindTheme(undefined),
                  'dsh-delta-desktop: theme service lifetime')
              })
              scope.inject(['layout'], layoutScope => {
                controller.bindLayout(layoutScope.layout)
                layoutScope.effect(() => () => controller.bindLayout(undefined),
                  'dsh-delta-desktop: layout service lifetime')
              })
              try {
                scope.inject(['sidebarRight'], rightScope => {
                  controller.bindSidebarRight(rightScope.sidebarRight)
                  rightScope.effect(() => () => controller.bindSidebarRight(undefined),
                    'dsh-delta-desktop: right sidebar service lifetime')
                })
              } catch { /* sidebarRight service is optional */ }
            } catch (error) {
              console.error('[dsh-delta-desktop] Settings mount failed; native UI preserved:', error)
            }
          })
        } catch (error) {
          console.error('[dsh-delta-desktop] deferred Settings registration failed; native UI preserved:', error)
        }
      },
    }
  },
})

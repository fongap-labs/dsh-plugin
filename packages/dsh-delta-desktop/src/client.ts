/**
 * Delta Desktop browser module. It only registers its lazy factory while loading.
 * Layout/session ownership always remains with the official UI plugins.
 */
interface DeltaCopy {
  meta: { title: string; description: string }
  ui: {
    preference: string; theme: string; official: string; delta: string;
    open: string; close: string; conversation: string; sidebar: string;
    status: string; unavailable: string; recovery: string; shortcut: string;
    personalization: string; personalizationDescription: string; enabled: string;
    appearance: string; appearanceDescription: string; hostOwned: string;
    sessionId: string; copySessionId: string; copy: string;
    searchSessions: string; searchDialogPrompt: string; newConversation: string; pluginManagement: string; scheduledTasks: string; searching: string; noResults: string;
    searchReady: string; searchWaitingServices: string; searchWaitingSidebar: string; searchDisabled: string;
    workspaceResult: string; archivedSession: string; sessionStateUnknown: string;
    sessionRunning: string; sessionArchived: string; sessionUpdated: string;
    integrationTitle: string; integrationSummary: string; integrationSidebar: string;
    integrationCollapse: string; integrationDeletion: string; integrationRunning: string;
    themeWaiting: string;
    copied: string; copyFailed: string;
    contextFeatures: string; contextFeaturesDescription: string;
    showDeepSeekAccountInfo: string; showDeepSeekAccountInfoDescription: string;
    showModelInfo: string; showModelInfoDescription: string;
    deepSeekModelsEnabled: string; deepSeekModelsEnabledDescription: string;
    modelRoutesTitle: string;
    inputOptimization: string; inputOptimizationDescription: string;
    privacyVisionTitle: string; redactionEnabled: string; redactionDescription: string;
    visionEnabled: string; visionEnabledDescription: string; visionSource: string;
    visionExisting: string; visionCustom: string; visionProvider: string; visionModel: string;
    visionProtocol: string; visionBaseURL: string; visionCustomModel: string;
    visionCredentialRef: string; visionCredentialPlaceholder: string; visionCredentialHint: string;
    visionSave: string; visionRestore: string; visionMissingForm: string; visionAdmissionHint: string;
    visionSaved: string; visionFailed: string; visionClearCredential: string; visionKeySaved: string;
    discussTask: string; optimizeDraft: string; optimizationDisabled: string;
    assistantUnavailable: string; assistantStarting: string; assistantReady: string; sessionIdle: string;
    assistantContext: string; mainTaskStatus: string; contextUsage: string;
    contextBreakdown: string; loadedTurns: string; mainContext: string;
    checkpoint: string; noCheckpoint: string;
    automaticCompactionFailed: string;
    correctionPlaceholder: string; queueCorrection: string; reviewCorrection: string; confirmQueue: string;
    queueOnly: string; correctionQueued: string; correctionFailed: string;
    directionChange: string; previewOptimization: string; applyOptimization: string;
    restoreOriginal: string; cancel: string; copyText: string; draftChanged: string;
    compacting: string;
    compactionCompleted: string; compactionInterrupted: string; viewCheckpoint: string;
    mcpAddAction: string; mcpAddDescription: string; mcpTitle: string; mcpSubtitle: string;
    mcpAddTitle: string; mcpBackToList: string; mcpBasics: string; mcpConnection: string;
    mcpAuthentication: string; mcpSecurityNotice: string;
    mcpClose: string; mcpUnavailable: string; mcpNotConfigured: string; mcpReadOnly: string;
    mcpRefreshing: string; mcpAddServer: string; mcpEditServer: string; mcpSaveServer: string;
    mcpCancel: string; mcpName: string; mcpNameHint: string; mcpTransport: string;
    mcpStdio: string; mcpHttp: string; mcpCommand: string; mcpArgs: string; mcpArgsHint: string;
    mcpEnv: string; mcpEnvHint: string; mcpCwd: string; mcpUrl: string; mcpHeaders: string;
    mcpHeadersHint: string; mcpEnabled: string; mcpNoServers: string; mcpConfigured: string;
    mcpRegistered: string; mcpProbe: string; mcpRestart: string; mcpWorking: string;
    mcpStatus: string; mcpConnecting: string; mcpConnected: string; mcpDisabled: string;
    mcpFailed: string; mcpWaitingCredentials: string; mcpUnknown: string; mcpRemove: string;
    mcpRestore: string; mcpConfirmRemove: string; mcpCancelRemove: string; mcpInvalidName: string;
    mcpDuplicateName: string; mcpMissingCommand: string; mcpInvalidUrl: string; mcpInvalidPairs: string;
    mcpSaveFailed: string; mcpSaveSuccess: string; mcpRemoveFailed: string; mcpRemoveSuccess: string;
    mcpOperationFailed: string; mcpStdioNotice: string; mcpCredentialsNotice: string;
    mcpFormPending: string; mcpFormUnavailable: string; mcpEnabledState: string;
    mcpProbeComplete: string; mcpRestartComplete: string;
  }
}
type Language = 'zh' | 'en'
type Mode = 'delta' | 'official'
type SearchStatus = 'waiting-services' | 'waiting-sidebar' | 'active' | 'disabled'
type DeltaState = Readonly<{
  mode: Mode; language: Language; error: boolean; searchStatus: SearchStatus;
  createAllowed: boolean; themeReady: boolean; revision: number
}>
interface DeltaController {
  getSnapshot(): DeltaState
  subscribe(listener: () => void): () => void
  setMode(mode: Mode): void
  toggleSidebar(): void
  openConversation(): void
  openPanel(panelId: 'plugins' | 'schedules'): boolean
  setSearchStatus(status: SearchStatus): void
  setCreateAllowed(allowed: boolean): void
  dispose(): void
}
interface DeltaProps { controller: DeltaController }
interface SessionHoverProps { sessionId: string }
interface AddPluginActionProps { onDismiss?(): void }
interface ReactApi {
  createElement(type: string | ((props: any) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T | ((state: T) => T)) => void]
  useRef<T>(initial: T): { current: T }
  useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T
}
interface ReactRootApi {
  createRoot(container: Element): { render(children: unknown): void; unmount(): void }
}
interface MenuItemButtonApi {
  MenuItemButton(props: { icon?: unknown; disabled?: boolean; onSelect?: () => void; children?: unknown }): unknown
}
interface ThemeApi {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}
interface LayoutApi { toggleSidebar(): void; selectPanel(id: string | null): void }
interface SlotsApi {
  inject(name: string, register: () => unknown): void
  register<P = DeltaProps>(options: { name: string; id?: string; key?: string; order?: number; label?: () => string;
    inject?: () => DeltaProps; children?: Record<string, unknown> }, component: (props: P) => unknown): unknown
}
interface WorkspacesApi {
  list: {
    getSnapshot(): {
      items: readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
      /** Native WorkspaceBrowser prevents opening archived Sessions. */
      archivedSessionIds?: readonly string[]
      phase?: string
      state?: 'idle' | 'loading' | 'error'
    }
    subscribe?(listener: () => void): () => void
  }
  delete(workspaceId: string): Promise<unknown>
}

/** Existing Harness 0.2.2-rc.1 public Client services. All data and navigation remain Host-owned. */
interface SearchSessionsApi {
  list: {
    getSnapshot(): {
      byId: Record<string, { id: string; title?: string; blank?: boolean; running?: boolean; updatedAt?: number }>
      phase?: string
    }
    subscribe?(listener: () => void): () => void
  }
  search(query: string, signal: AbortSignal): Promise<{
    ok: boolean
    value?: { items: { sessionId: string; snippet: string }[]; hasMore: boolean }
    error?: { message?: string }
  }>
}
interface SearchNavigationApi {
  openSession(sessionId: string): void
  startSession(): void
  /** Public Harness navigation, retaining Host create/access checks. Optional on older builds. */
  openWorkspace?(workspaceId: string): Promise<void>
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
interface SidebarRightApi {
  openResource(address: string): unknown
  closeRightbar?(): void
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
interface ClientContext {
  remoteAccess?: AccessApi
  theme?: ThemeApi
  layout?: LayoutApi
  workspaces?: WorkspacesApi
  sessions?: SearchSessionsApi
  configForms?: ConfigFormsApi
  remote?: { mcpManager?: McpManagerApi; credentials?: CredentialRemoteApi }
  uiWorkspace?: SearchNavigationApi
  slots: SlotsApi
  /** Cordis child injection waits for optional UI capabilities without blocking the parent. */
  inject(services: string[], callback: (scope: ClientContext) => void): void
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { subscribe?: (listener: () => void) => (() => void) }
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

// The release builder replaces both markers with data from locale/*.json and src/theme.css.
const DICTIONARIES = '__DELTA_DESKTOP_LOCALES__' as unknown as Record<Language, DeltaCopy>
const OWNED_CSS = '__DELTA_DESKTOP_STYLE__'
const OWNER = '@fongap-labs/dsh-delta-desktop'
const STORAGE_KEY = 'fongap.dsh-delta-desktop.v1'
const TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-brand-primary': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-fill': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-hover': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-link': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-bg-base': { light: '#F5F6F7', dark: '#131417' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1C1E22' },
  '--dsw-alias-border-l1': { light: '#E5E9EB', dark: '#31363B' },
  '--dsw-specific-sidebar-fill': { light: '#F5F6F7', dark: '#171A1D' },
  // v2 visual refinements through the public Host token override API.
  '--dsw-alias-brand-primary-invert': { light: '#70B1BA', dark: '#286F78' },
  '--dsw-alias-brand-text': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-info-fill': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-info-hover': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-alias-button-ghost-active-fill': { light: '#EAF3F4', dark: '#1C3B40' },
  '--dsw-alias-button-ghost-active-border': { light: '#9AC9CE', dark: '#357079' },
  '--dsw-alias-label-primary-bluish': { light: '#10373C', dark: '#E4F4F6' },
  '--dsw-alias-label-deep-diving': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-label-deep-diving-shimmer': { light: '#5CA1AA', dark: '#8EE0EA' },
  '--dsw-alias-state-business-primary': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-state-business-tertiary': { light: '#EAF3F4', dark: '#1C3B40' },
  '--dsw-alias-bg-overlay': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-alias-bg-document-selection': { light: 'rgba(40, 111, 120, 0.22)', dark: 'rgba(96, 180, 191, 0.28)' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#DCEBEC', dark: '#1C3B40' },
  '--dsw-specific-bubble': { light: '#F4F8F8', dark: '#132225' },
  '--dsw-specific-bubble-highlight': { light: '#C2DFE2', dark: '#244E55' },
  '--dsw-focus-ring-color': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-focus-stroke': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-border-focus': { light: '#286F78', dark: '#60B4BF' },
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
  let snapshot: DeltaState = Object.freeze({ mode: initialMode, language: language(), error: false,
    searchStatus: initialMode === 'official' ? 'disabled' : 'waiting-services',
    createAllowed: false, themeReady: false, revision: 0 })
  let ownedLayer: (() => void) | undefined
  let activeTheme: ThemeApi | undefined
  let activeLayout: LayoutApi | undefined
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
      ownedLayer = activeTheme.overrideTokens(OWNER, TOKENS)
      return typeof ownedLayer === 'function'
    } catch { return false }
  }
  const safeLayout = (command: (layout: LayoutApi) => void): boolean => {
    if (isDisposed) return false
    try {
      // Missing services must not silently report an action as successful.
      if (!activeLayout) throw new Error('Host layout capability is unavailable')
      command(activeLayout)
      publish({ error: false })
      return true
    } catch {
      publish({ error: true })
      return false
    }
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
      if (!success) { publish({ error: true, themeReady: false }); return }
      writeMode(mode)
      publish({ mode, error: false, themeReady: mode === 'delta',
        searchStatus: mode === 'official' ? 'disabled' : 'waiting-services' })
    },
    toggleSidebar: () => { safeLayout(layout => layout.toggleSidebar()) },
    openConversation: () => { safeLayout(layout => layout.selectPanel(null)) },
    openPanel: (panelId) => safeLayout(layout => layout.selectPanel(panelId)),
    setSearchStatus: (status) => {
      if (!isDisposed && snapshot.searchStatus !== status) publish({ searchStatus: status })
    },
    setCreateAllowed: (allowed) => {
      if (!isDisposed && snapshot.createAllowed !== allowed) publish({ createAllowed: allowed })
    },
    dispose: () => {
      if (isDisposed) return
      isDisposed = true
      ownedLayer?.()
      ownedLayer = undefined
      activeLayout = undefined
      listeners.clear()
    },
    // Used by the owning activation to sync a host language switch.
    syncLanguage: () => { publish({ language: language() }) },
    activate: () => { if (!applyPalette(snapshot.mode)) publish({ error: true }) },
    bindTheme: (theme: ThemeApi | undefined) => {
      if (isDisposed) return
      activeTheme = theme
      const hasPalette = applyPalette(snapshot.mode)
      publish({ error: !hasPalette, themeReady: snapshot.mode === 'delta' && hasPalette })
    },
    bindLayout: (layout: LayoutApi | undefined) => {
      if (!isDisposed) activeLayout = layout
    },
  } as DeltaController & { syncLanguage(): void; activate(): void }
}



/**
 * A plugin-owned search control inside the published sidebar scrollport.
 * It calls Harness Session Controller and UiWorkspace services directly:
 * no synthetic React events, no moving Host nodes, and no Host method replacement.
 * Markers are checked before each insertion; loss of the Host surface safely unmounts.
 * Workspace names come only from the public Workspace snapshot; never render paths.
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
  id: OWNER,
  factory(require) {
    // Shared React instance supplied by the host module table, never bundled.
    // Import errors must not make this optional plugin fail the entire web boot.
    let React: ReactApi
    let MenuItemButton: MenuItemButtonApi['MenuItemButton'] | undefined
    let ReactRoot: ReactRootApi | undefined
    try {
      React = require('react') as ReactApi
      if (typeof React?.createElement !== 'function' ||
          typeof React?.useState !== 'function' || typeof React?.useRef !== 'function' ||
          typeof React?.useEffect !== 'function' ||
          typeof React?.useSyncExternalStore !== 'function') {
        throw new Error('Host React platform module is incomplete')
      }
    } catch (error) {
      console.error('[dsh-delta-desktop] React unavailable; native UI remains active:', error)
      return { inject: [], apply() {} }
    }
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives') as MenuItemButtonApi
      const reactDom = require('react-dom/client') as ReactRootApi
      if (typeof primitives?.MenuItemButton === 'function' && typeof reactDom?.createRoot === 'function') {
        MenuItemButton = primitives.MenuItemButton
        ReactRoot = reactDom
      }
    } catch (error) {
      // MCP management remains optional on older Hosts without the public menu
      // primitive or React root module; the rest of Delta still loads normally.
      console.error('[dsh-delta-desktop] MCP menu modules unavailable:', error)
    }
    const el = React.createElement
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
    const toastEntries = new Set<{ node: HTMLElement; timer: number }>()
    const showDeltaToast = (message: string): void => {
      try {
        if (!document.body) return
        const node = document.createElement('div')
        node.className = 'dtd-toast'
        node.setAttribute('role', 'status')
        node.textContent = message
        document.body.appendChild(node)
        const entry = { node, timer: 0 }
        entry.timer = window.setTimeout(() => {
          node.remove()
          toastEntries.delete(entry)
        }, 3000)
        toastEntries.add(entry)
      } catch { /* Toasts must never prevent native interaction. */ }
    }
    const clearDeltaToasts = (): void => {
      for (const entry of toastEntries) {
        window.clearTimeout(entry.timer)
        entry.node.remove()
      }
      toastEntries.clear()
    }
    function useCopy(controller: DeltaController): { state: DeltaState; copy: DeltaCopy } {
      const state = React.useSyncExternalStore(
        callback => controller.subscribe(callback), () => controller.getSnapshot())
      return { state, copy: DICTIONARIES[state.language] ?? DICTIONARIES.en }
    }
    const ASSISTANT_TAB_ID = OWNER
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
    function SettingsSectionIcon(): unknown {
      return el('svg', { viewBox: '0 0 24 24', width: 17, height: 17,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true },
        el('line', { x1: 4, y1: 7, x2: 20, y2: 7 }),
        el('circle', { cx: 9, cy: 7, r: 2, fill: 'currentColor' }),
        el('line', { x1: 4, y1: 17, x2: 20, y2: 17 }),
        el('circle', { cx: 15, cy: 17, r: 2, fill: 'currentColor' }))
    }
    // Supported brand slots replace Harness artwork without DOM manipulation.
    // The official sidebar retains ownership of the surrounding navigation.
    function DeltaBrandMark(): unknown {
      return el('span', { 'aria-hidden': true, className: 'dtd-brand-mark' }, 'Δ')
    }
    function DeltaBrandName(): unknown {
      return el('span', { className: 'dtd-brand-name' }, (DICTIONARIES[language()] ?? DICTIONARIES.en).meta.title)
    }
    // This extension uses an existing native row-hover seat. All values come
    // from the public catalog; the Host retains its actions and session lifecycle.
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
      const { state, copy } = useCopy(controller)
      return el('section', { className: 'dtd-page', 'data-delta-personalization': '',
        'aria-label': copy.ui.personalization },
        el('header', { className: 'dtd-page-head' },
          el('div', { className: 'dtd-heading-group' },
            el('span', { className: 'dtd-mark', 'aria-hidden': true }, 'Δ'),
            el('div', null,
              el('h2', null, copy.meta.title),
              el('p', null, copy.ui.personalizationDescription))),
          el('span', { className: 'dtd-enabled', role: 'status' },
          state.mode === 'official' ? copy.ui.official
            : state.themeReady ? copy.ui.enabled : copy.ui.themeWaiting)),
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
        el(FeaturePreferencesSection, {}),
        el('p', { className: 'dtd-current', role: 'status' },
          copy.ui.status + ': ' + (state.mode === 'delta' ? copy.ui.delta : copy.ui.official)),
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, copy.ui.unavailable) : null,
        el('p', { className: 'dtd-recovery' }, copy.ui.recovery),
        el('p', { className: 'dtd-capability' }, copy.ui.hostOwned),
        el('p', { className: 'dtd-capability', role: 'status',
          'data-delta-search-status': state.searchStatus },
          state.searchStatus === 'active' ? copy.ui.searchReady
            : state.searchStatus === 'waiting-sidebar' ? copy.ui.searchWaitingSidebar
              : state.searchStatus === 'disabled' ? copy.ui.searchDisabled
                : copy.ui.searchWaitingServices),
        state.mode === 'delta' ? el('section', {
          className: 'dtd-integration',
          'aria-label': copy.ui.integrationTitle,
          'data-delta-contract-version': '1',
          'data-delta-integration': 'incomplete',
        },
        el('h3', null, copy.ui.integrationTitle),
        el('p', null, copy.ui.integrationSummary),
        el('ul', null,
          el('li', null, copy.ui.integrationSidebar),
          el('li', null, copy.ui.integrationCollapse),
          el('li', null, copy.ui.integrationDeletion),
          el('li', null, copy.ui.integrationRunning))) : null)
    }
    return {
      // The parent plugin remains active even if UI services or a theme API are unavailable.
      inject: [],
      apply(ctx) {
        try {
          // Personalization must still appear if the Theme provider is absent.
          ctx.inject(['slots'], (scope) => {
            try {
              const controller = createController() as DeltaController & {
                syncLanguage(): void
                bindTheme(theme: ThemeApi | undefined): void
                bindLayout(layout: LayoutApi | undefined): void
              }
              scope.effect(() => {
                const tag = document.createElement('style')
                tag.dataset.plugin = OWNER
                tag.textContent = OWNED_CSS
                document.head.appendChild(tag)
                const observer = typeof MutationObserver !== 'undefined'
                  ? new MutationObserver(() => controller.syncLanguage()) : undefined
                observer?.observe(document.documentElement, {
                  attributes: true, attributeFilter: ['lang'],
                })
                // A root theme marker scopes native shell spacing. This changes
                // appearance only; Host navigation and actions are never moved.
                const syncAppearance = (): void => {
                  if (controller.getSnapshot().mode === 'delta') {
                    document.documentElement.setAttribute?.('data-delta-ui', 'delta')
                  } else {
                    document.documentElement.removeAttribute?.('data-delta-ui')
                  }
                }
                syncAppearance()
                const stopAppearance = controller.subscribe(syncAppearance)
                // Language changes are tracked through the document lang observer.
                // Do not read ctx.locale without an explicit Cordis injection.
                return () => {
                  observer?.disconnect()
                  stopAppearance()
                  clearDeltaToasts()
                  document.documentElement.removeAttribute?.('data-delta-ui')
                  tag.parentNode?.removeChild(tag)
                  controller.dispose()
                }
              }, 'dsh-delta-desktop: personalization resource ownership')
              scope.effect(() => () => closeMcpManagement(),
                'dsh-delta-desktop: MCP management dialog ownership')
              // MCP settings are optional public Host services. Writes go through
              // ConfigForms; runtime status and recovery go through the MCP Manager.
              scope.inject(['configForms', 'remote'], mcpScope => {
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
              })
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
              // Only live features contribute settings; no inactive placeholder switches.
              // New Desktop features can add their own localized settings sections here.
              const settingsModules: ReadonlyArray<{
                id: string
                order: number
                labelKey: keyof DeltaCopy['ui']
                content: (props: DeltaProps) => unknown
                icon: (props: DeltaProps) => unknown
              }> = [
                {
                  id: 'delta.personalization',
                  order: 90,
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
                }, feature.icon))
              }
              // Context assistance is an optional public Host integration. The
              // parent remains live if an older Host omits any service.
              scope.inject(['sessions', 'resources', 'sidebarRightTabs', 'sidebarRight'], assistantScope => {
                const candidate = assistantScope as ClientContext & AssistantServices
                if (!candidate.sessions || !candidate.resources || !candidate.sidebarRightTabs ||
                    !candidate.sidebarRight || !candidate.slots) return
                assistantScope.effect(() => registerAssistantSurface(candidate),
                  'dsh-delta-desktop: Host context and assistant capabilities')
              })
              // Brand slot entries must disappear in official mode. A null component
              // still shadows the native fallback in a single-occupant slot.
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
                      const result = scope.slots.register({ name, id }, component)
                      release = typeof result === 'function' ? (result as () => void) : () => {}
                    } else if (!shouldShow && release) {
                      release()
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
              // Extend the official session hover card without binding sessions or
              // exposing workspace paths. The native time/status lines remain intact.
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

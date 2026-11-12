/** Client-only ambient type contracts. No browser runtime code lives here. */
interface DeltaCopy {
  meta: { title: string; description: string }
  ui: {
    [key: string]: string
    preference: string; theme: string; official: string; delta: string;
    open: string; close: string; conversation: string; sidebar: string;
    status: string; unavailable: string; recovery: string; shortcut: string;
    personalization: string; personalizationDescription: string; enabled: string;
    appearance: string; appearanceDescription: string; hostOwned: string;
    sessionId: string; copySessionId: string; copy: string;
    searchSessions: string; newConversation: string; searching: string; noResults: string;
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
type DeltaState = Readonly<{ mode: Mode; language: Language; error: boolean; revision: number }>
interface DeltaController {
  getSnapshot(): DeltaState
  subscribe(listener: () => void): () => void
  setMode(mode: Mode): void
  toggleSidebar(): void
  openConversation(): void
  dispose(): void
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
  register<P = DeltaProps>(options: { name: string; id?: string; key?: string; order?: number; label?: () => string; inject?: () => DeltaProps; children?: Record<string, {kind:string;scope?:string}> | readonly string[] }, component: (props: P) => unknown): unknown
}
interface WorkspaceSnapshot {
  items: readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[]
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
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
  archived?: boolean
}
interface SearchSessionsApi {
  list: {
    getSnapshot(): { byId: Record<string, SearchSessionRecord>; ids?: readonly string[] }
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
}

interface ClientContext {
  get?(name: string): unknown
  theme?: ThemeApi
  layout?: LayoutApi
  sidebarRight?: SidebarRightApi
  workspaces?: WorkspacesApi
  sessions?: SearchSessionsApi
  uiWorkspace?: SearchNavigationApi
  resources?: ResourceProviderApi
  sidebarRightTabs?: SidebarRightTabsApi
  configForms?: ConfigFormsApi
  remote?: { mcpManager?: McpManagerApi; credentials?: CredentialRemoteApi }
  slots: SlotsApi
  /** Cordis child injection waits for optional UI capabilities without blocking the parent. */
  inject(services: string[], callback: (scope: ClientContext) => void): void
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { subscribe?: (listener: () => void) => (() => void) }
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

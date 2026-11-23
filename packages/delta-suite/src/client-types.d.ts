/** Client-only ambient type contracts. No browser runtime code lives here. */
interface DeltaCopy {
  meta: { title: string; description: string }
  ui: {
    [key: string]: string
     theme: string; official: string; delta: string;
    open: string; close: string; conversation: string; sidebar: string;
    status: string; unavailable: string;  shortcut: string;
    personalization: string;  enabled: string;
    appearance: string; appearanceDescription: string; 
    integrationTitle: string; integrationSummary: string;
    integrationSidebar: string; integrationCollapse: string;
    integrationDeletion: string; integrationRunning: string;
    integrationNative: string; integrationReasoning: string; integrationGuidance: string;
    sessionId: string; copySessionId: string; copy: string; sessionLastUpdated: string;
    modelReasoningLevels: string;
    searchSessions: string;  searching: string; noResults: string;
    copied: string; copyFailed: string; 
      
     
     
     
    
    cancel: string; confirm: string; delete: string;
  }
  privacy: {
    title: string; description: string; 
     
     
  }
  sessionMenu: {
    moveSession: string; lockSession: string; unlockSession: string; deleteSession: string;
    moveTitle: string; moveDescription: string; moveEmpty: string; movedToast: string;
    deleteTitle: string; deleteDescription: string; deletedToast: string;
    deleteUngrouped: string; deleteUngroupedTitle: string; deleteUngroupedDescription: string;
    deleteUngroupedLockedWarning: string; deletedUngroupedToast: string;
    unlockFirst: string;
    setPinTitle: string; setPinDescription: string;  pinConfirmLabel: string;
    pinPlaceholder: string; pinTooShort: string; pinMismatch: string; wrongPin: string;
    lockedShieldTitle: string; lockedShieldDesc: string; unlockViewOnce: string; unlockPermanent: string;
    lockedToast: string; unlockedToast: string;
    pinSettingsTitle: string; pinSetStatus: string; pinUnsetStatus: string;
    clearPin: string; clearPinTitle: string; clearPinDesc: string; pinClearedToast: string;
    copySecret: string; totpLoading: string; totpInitFailed: string;
  }
  workspaceMenu: {
    lockWorkspace: string;
    unlockWorkspace: string;
    lockedToast: string;
    unlockedToast: string;
    unlockFirst: string;
    lockedShieldTitle: string;
    lockedShieldDesc: string;
    unlockPermanent: string;
    setPinTitle?: string;
    setPinDescription?: string;
  }
  searchPalette: {
     sidebarPlaceholder: string; placeholder: string;
    clear: string; close: string; searchingContent: string;
    noResults: string; noResultsHint: string; turnLabel: string;
    roleUser: string; roleAssistant: string;
    tabAll: string; tabSession: string; tabWorkspace: string;
    tabPlugin: string; tabSkill: string; tabShortcut: string; tabAction: string;
    kindSession: string; kindContent: string; kindWorkspace: string;
     kindSkill: string; kindCommand: string;
    kindShortcut: string; kindAction: string;
    actionNewConversation: string; 
     
    actionToggleSidebar: string; actionToggleRightbar: string;
    footerNav: string; footerOpen: string; footerTab: string; footerEsc: string;
    commandCopyLabel: string; commandCopyHint: string; commandCopied: string; commandCopyFailed: string;
    commandPickerLabel: string; commandInsertLabel: string; commandInsertHint: string; commandInserted: string; commandInsertFailed: string;
    globalCommandSearch: string; workspaceFiles: string; builtInBrowser: string; archivedBadge: string;
    builtinPlan: string; builtinGoal: string; builtinCompact: string; builtinSchedule: string;
    builtinBrowser: string; builtinBoost: string;
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
  retainedBy?: { readonly mainView?: number }
}
interface SearchSessionsApi {
  /** Public Host-authoritative catalog refresh; optional on older hosts. */
  refresh?(): Promise<void>
  binding?(sessionId: string): {
    ctx: unknown
    session: { getSnapshot(): { sessionId: string; removed: boolean; subagent: unknown; openState: string } }
  } | undefined
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
  slots: SlotsApi
  /** Cordis child injection waits for optional UI capabilities without blocking the parent. */
  inject(services: string[], callback: (scope: ClientContext) => void): void
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { getSnapshot(): { active: string }; subscribe(listener: () => void): () => void }
}

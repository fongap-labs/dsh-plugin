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
  createElement(type: string | ((props: DeltaProps) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T | ((state: T) => T)) => void]
  useSyncExternalStore<T = DeltaState>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T
}
interface ThemeApi {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}
interface LayoutApi { toggleSidebar(): void; selectPanel(id: string | null): void }
interface SidebarRightApi { toggleExpanded?(): void }
interface SlotsApi {
  inject(name: string, register: () => unknown): void
  register<P = DeltaProps>(options: { name: string; id: string; key?: string; order?: number; label?: () => string; inject?: () => DeltaProps }, component: (props: P) => unknown): unknown
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
  slots: SlotsApi
  /** Cordis child injection waits for optional UI capabilities without blocking the parent. */
  inject(services: string[], callback: (scope: ClientContext) => void): void
  effect(callback: () => void | (() => void), label?: string): void
  locale?: { subscribe?: (listener: () => void) => (() => void) }
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
  let snapshot: DeltaState = Object.freeze({ mode: readMode(), language: language(), error: false, revision: 0 })
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
      publish({ mode, error: false })
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
    activate: () => { if (!applyPalette(snapshot.mode)) publish({ error: true }) },
    bindTheme: (theme: ThemeApi | undefined) => {
      if (isDisposed) return
      activeTheme = theme
      publish({ error: !applyPalette(snapshot.mode) })
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
function installSidebarCompatibility(controller: DeltaController): () => void {
  const root = document.documentElement
  const mounted = new Map<string, HTMLElement>()
  const initialized = new Set<string>()
  const mutatedNavButtons = new Map<HTMLElement, { origText: string; origAria: string | null }>()
  const mutatedPageHeadings = new Map<HTMLElement, string>()
  const hiddenMoreElements = new Map<HTMLElement, string | null>()
  const getUiCopy = (): DeltaCopy['ui'] => (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
  const boundTriggers = new WeakSet<Element>()
  const boundTooltips = new WeakSet<Element>()
  const failedAvatarUrls = new Set<string>()
  let tooltipEl: HTMLElement | undefined
  let tooltipAnchor: HTMLElement | undefined
  let tooltipTimer: number | undefined
  let tooltipIdCounter = 0

  const hideTooltip = (): void => {
    if (tooltipTimer !== undefined) {
      cancelTimer(tooltipTimer)
      tooltipTimer = undefined
    }
    if (tooltipAnchor) {
      tooltipAnchor.removeAttribute?.('aria-describedby')
      tooltipAnchor = undefined
    }
    if (tooltipEl) {
      tooltipEl.hidden = true
      tooltipEl.setAttribute('hidden', '')
      tooltipEl.style?.setProperty?.('visibility', 'hidden')
    }
  }
  const ensureTooltipEl = (): HTMLElement => {
    if (tooltipEl && tooltipEl.isConnected) return tooltipEl
    const tip = document.createElement('div')
    tip.className = 'dtd-tooltip'
    tip.setAttribute('role', 'tooltip')
    tip.id = `dtd-tooltip-${++tooltipIdCounter}`
    tip.hidden = true
    tip.setAttribute('hidden', '')
    tip.style?.setProperty?.('position', 'fixed', 'important')
    tip.style?.setProperty?.('pointer-events', 'none', 'important')
    tip.style?.setProperty?.('visibility', 'hidden')
    ;(document.body ?? root)?.appendChild?.(tip)
    tooltipEl = tip
    return tip
  }
  const positionTooltip = (tip: HTMLElement, anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect?.()
    if (!rect || typeof window === 'undefined') return
    const vw = window.innerWidth || 1200
    const vh = window.innerHeight || 800
    const tipRect = tip.getBoundingClientRect?.() ?? { width: 80, height: 28 }
    const side = anchor.getAttribute?.('data-dtd-tooltip-side') || 'top'
    let left = rect.left + rect.width / 2 - tipRect.width / 2
    let top = rect.top - tipRect.height - 6
    if (side === 'right') {
      left = rect.right + 8
      top = rect.top + rect.height / 2 - tipRect.height / 2
    } else if (side === 'left') {
      left = rect.left - tipRect.width - 8
      top = rect.top + rect.height / 2 - tipRect.height / 2
    } else if (top < 8) {
      top = rect.bottom + 6
    }
    left = Math.max(8, Math.min(left, vw - tipRect.width - 8))
    top = Math.max(8, Math.min(top, vh - tipRect.height - 8))
    tip.style?.setProperty?.('left', `${Math.round(left)}px`, 'important')
    tip.style?.setProperty?.('top', `${Math.round(top)}px`, 'important')
  }
  const showTooltipNow = (anchor: HTMLElement): void => {
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    const text = anchor.getAttribute?.('data-dtd-tooltip')?.trim()
    if (!text) return
    const tip = ensureTooltipEl()
    tooltipAnchor = anchor
    if (tip.textContent !== text) tip.textContent = text
    tip.hidden = false
    tip.removeAttribute?.('hidden')
    if (tip.id) anchor.setAttribute?.('aria-describedby', tip.id)
    positionTooltip(tip, anchor)
    tip.style?.setProperty?.('visibility', 'visible')
  }
  const setDeltaTooltip = (el: HTMLElement, label: string, side: 'top' | 'left' | 'right' = 'top'): void => {
    if (el.hasAttribute?.('title')) el.removeAttribute('title')
    if (el.getAttribute?.('data-dtd-tooltip') !== label) el.setAttribute('data-dtd-tooltip', label)
    if (el.getAttribute?.('aria-label') !== label) el.setAttribute('aria-label', label)
    if (el.getAttribute?.('data-dtd-tooltip-side') !== side) el.setAttribute('data-dtd-tooltip-side', side)
    if (tooltipAnchor === el && tooltipEl && !tooltipEl.hidden) {
      tooltipEl.textContent = label
      positionTooltip(tooltipEl, el)
    }
  }
  const attachTooltipEvents = (el: HTMLElement): void => {
    if (boundTooltips.has(el) || typeof el.addEventListener !== 'function') return
    boundTooltips.add(el)
    el.addEventListener('mouseenter', () => {
      if (tooltipTimer !== undefined) cancelTimer(tooltipTimer)
      tooltipTimer = scheduleTimer(() => {
        tooltipTimer = undefined
        showTooltipNow(el)
      }, 220)
    })
    el.addEventListener('focus', () => {
      if (tooltipTimer !== undefined) {
        cancelTimer(tooltipTimer)
        tooltipTimer = undefined
      }
      showTooltipNow(el)
    })
    el.addEventListener('mouseleave', () => {
      if (tooltipAnchor === el || tooltipTimer !== undefined) hideTooltip()
    })
    el.addEventListener('blur', () => {
      if (tooltipAnchor === el) hideTooltip()
    })
    el.addEventListener('pointerdown', () => hideTooltip())
  }
  let isDisposed = false
  let isSyncing = false
  let canOpenMenuSilently = false
  let silentMenuTimer: number | undefined
  let isUpdateBusy = false
  let desktopUpdatePhase: string | undefined
  let stopDesktopUpdates: (() => void) | undefined
  let observer: MutationObserver | undefined
  const frameScheduler = createFrameScheduler(() => sync())
  const scheduleSync = (): void => {
    if (!isDisposed) frameScheduler.schedule()
  }
  const setButtonLabel = (btn: HTMLElement, from: string, to: string): void => {
    if (typeof document?.createTreeWalker === 'function') {
      const walker = document.createTreeWalker(btn, 4 /* NodeFilter.SHOW_TEXT */)
      let current = walker.nextNode()
      while (current) {
        if (current.nodeValue?.trim() === from) {
          current.nodeValue = to
          return
        }
        current = walker.nextNode()
      }
    }
    if (btn.childNodes) {
      for (const node of btn.childNodes) {
        if (node.nodeType === 3 && node.textContent?.trim() === from) {
          node.textContent = to
          return
        }
      }
    }
    if (typeof btn.querySelectorAll === 'function') {
      const leaf = Array.from(btn.querySelectorAll('*')).find(
        el => el.textContent?.trim() === from && (!el.children || el.children.length === 0)
      )
      if (leaf) {
        if (leaf.firstChild && leaf.firstChild.nodeType === 3) leaf.firstChild.nodeValue = to
        else leaf.textContent = to
        return
      }
    }
    const childCount = (btn as unknown as { children?: { length?: number } }).children?.length ?? 0
    if (childCount === 0 && btn.textContent?.trim() === from) {
      btn.textContent = to
    }
  }
  const readStoredPaneWidth = (key: string): number | undefined => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return undefined
      const parsed = Number(raw)
      return Number.isFinite(parsed) && parsed >= 150 ? Math.round(parsed) : undefined
    } catch { return undefined }
  }
  const writeStoredPaneWidth = (key: string, width: number): void => {
    try { localStorage.setItem(key, String(Math.round(width))) } catch {}
  }
  let customSidebarWidth = readStoredPaneWidth('dsh-delta-desktop:sidebar-width')
  let customRightbarWidth = readStoredPaneWidth('dsh-delta-desktop:rightbar-width')
  let frameResizeObserver: ResizeObserver | undefined
  let observedFrameEl: HTMLElement | undefined
  const modifiedHandles = new Set<HTMLElement>()
  let activeDragCleanup: (() => void) | undefined

  const splitGridTracks = (tpl: string): string[] => {
    const tracks: string[] = []
    let depth = 0
    let current = ''
    for (let i = 0; i < tpl.length; i++) {
      const ch = tpl[i]
      if (ch === '(') depth++
      else if (ch === ')') depth = Math.max(0, depth - 1)
      if (depth === 0 && /\s/.test(ch)) {
        if (current) {
          tracks.push(current)
          current = ''
        }
      } else {
        current += ch
      }
    }
    if (current) tracks.push(current)
    return tracks
  }

  const isZeroGridTrack = (track?: string): boolean => {
    if (!track) return true
    const t = track.trim()
    if (!t || /^0(?:px)?$/i.test(t)) return true
    const minmaxMatch = /^minmax\(([^,]+),([^)]+)\)$/i.exec(t)
    if (minmaxMatch) {
      const maxVal = parseFloat(minmaxMatch[2].trim())
      return Number.isFinite(maxVal) && maxVal <= 0
    }
    const n = parseFloat(t)
    return Number.isFinite(n) && n <= 0
  }

  const parseTrackMaxPx = (track: string | undefined, fallback: number): number => {
    if (!track) return fallback
    const t = track.trim()
    const minmaxMatch = /^minmax\(([^,]+),([^)]+)\)$/i.exec(t)
    const raw = minmaxMatch ? minmaxMatch[2].trim() : t
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback
  }

  const resetElasticLayout = (): void => {
    activeDragCleanup?.()
    activeDragCleanup = undefined
    frameResizeObserver?.disconnect()
    frameResizeObserver = undefined
    observedFrameEl = undefined
    for (const handle of modifiedHandles) {
      try {
        handle.removeAttribute?.('data-dragging')
        if (handle.dataset?.dtdOrigLeft !== undefined) {
          if (handle.dataset.dtdOrigLeft) handle.style.left = handle.dataset.dtdOrigLeft
          else handle.style.removeProperty('left')
          delete handle.dataset.dtdOrigLeft
        }
        if (handle.dataset?.dtdOrigRight !== undefined) {
          if (handle.dataset.dtdOrigRight) handle.style.right = handle.dataset.dtdOrigRight
          else handle.style.removeProperty('right')
          delete handle.dataset.dtdOrigRight
        }
      } catch {}
    }
    modifiedHandles.clear()
    if (typeof document?.querySelector === 'function') {
      try {
        const frame = document.querySelector<HTMLElement>('[class*="mP3x-q_frame"]')
        if (frame) {
          frame.removeAttribute('data-dtd-elastic')
          frame.removeAttribute('data-dtd-sidebar-open')
          frame.removeAttribute('data-dtd-rightbar-open')
          frame.removeAttribute('data-dragging')
          frame.style?.removeProperty?.('--dtd-sidebar-col')
          frame.style?.removeProperty?.('--dtd-rightbar-col')
        }
      } catch {}
    }
  }

  /** Identify whether a host splitter handle belongs to the left sidebar or right panel. */
  const resolveHandleSide = (
    handle: HTMLElement,
    index: number,
    isHostSidebarOpen: boolean,
    isHostRightbarOpen: boolean,
    frameRect?: DOMRect,
    currentSidebar = 264,
  ): 'sidebar' | 'rightbar' => {
    const explicitSide = handle.dataset?.side || handle.getAttribute?.('data-side')
    if (explicitSide === 'sidebar' || explicitSide === 'rightbar') return explicitSide
    if (handle.closest?.('[data-sidebar-col], [class*="sidebarCol"]')) return 'sidebar'
    if (handle.closest?.('[data-rightbar-col], [class*="rightbarCol"]')) return 'rightbar'
    if (!isHostSidebarOpen && isHostRightbarOpen) return 'rightbar'
    if (isHostSidebarOpen && !isHostRightbarOpen) return 'sidebar'
    const handleRect = handle.getBoundingClientRect?.()
    if (frameRect && handleRect) {
      return Math.abs((handleRect.left - frameRect.left) - currentSidebar) <= 28 ? 'sidebar' : 'rightbar'
    }
    return index === 0 ? 'sidebar' : 'rightbar'
  }

  const syncElasticLayout = (): void => {
    if (typeof document?.querySelector !== 'function') return
    const frame = document.querySelector<HTMLElement>('[class*="mP3x-q_frame"]')
    if (!frame || !frame.style) return
    const tracks = splitGridTracks(frame.style.gridTemplateColumns ?? '')
    const sidebarCol = frame.querySelector?.<HTMLElement>('[data-sidebar-col], [class*="sidebarCol"]') ?? null
    const rightbarCol = frame.querySelector?.<HTMLElement>('[data-rightbar-col], [class*="rightbarCol"]') ?? null
    const hasTracks = tracks.length >= 2
    const isHostSidebarOpen = hasTracks
      ? !isZeroGridTrack(tracks[0])
      : Boolean(sidebarCol && (sidebarCol.offsetWidth ?? 1) > 0)
    const rightbarHasContent = rightbarCol
      ? ((rightbarCol.childElementCount ?? (rightbarCol as unknown as { children?: { length: number } }).children?.length ?? 0) > 0)
      : true
    const isHostRightbarOpen = hasTracks
      ? (tracks.length >= 3 && !isZeroGridTrack(tracks[2]) && rightbarHasContent)
      : Boolean(rightbarCol && rightbarHasContent && (rightbarCol.offsetWidth ?? 1) > 0)

    const frameWidth = Math.round(
      frame.getBoundingClientRect?.().width
      || frame.clientWidth
      || (typeof window !== 'undefined' ? window.innerWidth : 0)
      || 1200
    )

    const hostSidebarPx = hasTracks ? parseTrackMaxPx(tracks[0], 264) : 264
    const hostRightbarPx = hasTracks && tracks.length >= 3 ? parseTrackMaxPx(tracks[2], 360) : 360

    let targetRightbar = isHostRightbarOpen ? (customRightbarWidth ?? hostRightbarPx) : 0
    let targetSidebar = isHostSidebarOpen ? (customSidebarWidth ?? hostSidebarPx) : 0

    if (isHostSidebarOpen) {
      const reserve = 150 + (isHostRightbarOpen ? 150 : 0)
      const maxSidebar = Math.max(150, frameWidth - reserve)
      targetSidebar = Math.max(150, Math.min(targetSidebar, maxSidebar))
    }
    if (isHostRightbarOpen) {
      const reserve = 150 + (isHostSidebarOpen ? targetSidebar : 0)
      const maxRightbar = Math.max(150, frameWidth - reserve)
      targetRightbar = Math.max(150, Math.min(targetRightbar, maxRightbar))
    }

    const nextSidebarAttr = isHostSidebarOpen ? '1' : '0'
    const nextRightbarAttr = isHostRightbarOpen ? '1' : '0'
    const nextSidebarCss = isHostSidebarOpen ? `${targetSidebar}px` : '0px'
    const nextRightbarCss = isHostRightbarOpen ? `${targetRightbar}px` : '0px'

    if (frame.getAttribute('data-dtd-elastic') !== '1') frame.setAttribute('data-dtd-elastic', '1')
    if (frame.getAttribute('data-dtd-sidebar-open') !== nextSidebarAttr) frame.setAttribute('data-dtd-sidebar-open', nextSidebarAttr)
    if (frame.getAttribute('data-dtd-rightbar-open') !== nextRightbarAttr) frame.setAttribute('data-dtd-rightbar-open', nextRightbarAttr)
    if (frame.style.getPropertyValue('--dtd-sidebar-col') !== nextSidebarCss) {
      frame.style.setProperty('--dtd-sidebar-col', nextSidebarCss)
    }
    if (frame.style.getPropertyValue('--dtd-rightbar-col') !== nextRightbarCss) {
      frame.style.setProperty('--dtd-rightbar-col', nextRightbarCss)
    }
    if (isHostSidebarOpen) {
      frame.style.setProperty('--dsh-windows-sidebar-width', nextSidebarCss)
    }

    const toggleLeft = (): void => {
      const ctrl = controller as DeltaController & { toggleSidebarSafe?(): boolean }
      if (!ctrl.toggleSidebarSafe?.()) {
        const targetBtn = document.querySelector?.<HTMLElement>('[data-sidebar-toggle]')
          ?? document.querySelector?.<HTMLElement>('[data-sidebar-opener]')
        targetBtn?.click()
      }
      scheduleSync()
    }
    const toggleRight = (btn: HTMLButtonElement): void => {
      const ctrl = controller as DeltaController & { toggleRightbarSafe?(): boolean }
      if (!ctrl.toggleRightbarSafe?.()) {
        const isOpenNow = btn.getAttribute('data-open') === '1'
        const targetBtn = isOpenNow
          ? (document.querySelector?.<HTMLElement>('[data-sidebar-right-toggle]')
            ?? document.querySelector?.<HTMLElement>('[data-sidebar-right-expand]'))
          : (document.querySelector?.<HTMLElement>('[data-sidebar-right-expand]')
            ?? document.querySelector?.<HTMLElement>('[data-sidebar-right-toggle]'))
        targetBtn?.click()
      }
      scheduleSync()
    }
    const syncEdgeToggle = (side: 'left' | 'right', isOpen: boolean, isVisible: boolean): void => {
      const key = `edge_${side}`
      let btn = mounted.get(key) as HTMLButtonElement | undefined
      if (!btn || !btn.isConnected) {
        btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `dtd-edge-toggle dtd-edge-toggle-${side}`
        btn.setAttribute('data-dtd-edge-toggle', side)
        btn.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation?.()
          hideTooltip()
        })
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation?.()
          if (side === 'left') toggleLeft()
          else toggleRight(btn!)
        })
        attachTooltipEvents(btn)
        frame.appendChild?.(btn)
        mounted.set(key, btn)
      } else if (btn.parentElement !== frame) {
        frame.appendChild?.(btn)
      }
      if (!isVisible) {
        if (tooltipAnchor === btn) hideTooltip()
        btn.hidden = true
        btn.setAttribute('hidden', '')
        return
      }
      btn.hidden = false
      btn.removeAttribute?.('hidden')
      btn.setAttribute('data-open', isOpen ? '1' : '0')
      const uiCopy = getUiCopy()
      const label = side === 'left'
        ? (isOpen ? uiCopy.collapseLeftSidebar : uiCopy.expandLeftSidebar)
        : (isOpen ? uiCopy.collapseRightSidebar : uiCopy.expandRightSidebar)
      setDeltaTooltip(btn, label, side === 'left' ? 'right' : 'left')
      const dir = side === 'left' ? (isOpen ? 'left' : 'right') : (isOpen ? 'right' : 'left')
      if (btn.getAttribute?.('data-dtd-chevron') !== dir) {
        btn.setAttribute('data-dtd-chevron', dir)
        clearNodeChildren(btn)
        const svg = createSvgEl('svg', {
          viewBox: '0 0 24 24',
          width: 12,
          height: 12,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 2.2,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        })
        svg.appendChild(createSvgEl('polyline', {
          points: dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6',
        }))
        btn.appendChild(svg)
      }
    }
    const hasRightbarTarget = isHostRightbarOpen || Boolean(
      typeof document?.querySelector === 'function' &&
      document.querySelector('[class*="acoR2W_panel"], [data-sidebar-right-toggle], [data-sidebar-right-expand]')
    )
    syncEdgeToggle('left', isHostSidebarOpen, true)
    syncEdgeToggle('right', isHostRightbarOpen, hasRightbarTarget)

    if (typeof ResizeObserver !== 'undefined' && observedFrameEl !== frame) {
      frameResizeObserver?.disconnect()
      observedFrameEl = frame
      frameResizeObserver = new ResizeObserver(() => scheduleSync())
      frameResizeObserver.observe(frame)
    }

    if (typeof frame.querySelectorAll === 'function') {
      const handles = Array.from(frame.querySelectorAll<HTMLElement>('[class*="mP3x-q_handle"]'))
      const frameRect = frame.getBoundingClientRect?.()
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i]
        const side = resolveHandleSide(h, i, isHostSidebarOpen, isHostRightbarOpen, frameRect, targetSidebar)
        if (side === 'sidebar') {
          if (h.style.left) {
            if (h.dataset && h.dataset.dtdOrigLeft === undefined) h.dataset.dtdOrigLeft = h.style.left
            modifiedHandles.add(h)
            if (h.style.left !== nextSidebarCss) h.style.setProperty('left', nextSidebarCss, 'important')
          }
        } else if (isHostRightbarOpen) {
          if (h.style.right) {
            if (h.dataset && h.dataset.dtdOrigRight === undefined) h.dataset.dtdOrigRight = h.style.right
            modifiedHandles.add(h)
            if (h.style.right !== nextRightbarCss) h.style.setProperty('right', nextRightbarCss, 'important')
          } else if (h.style.left) {
            if (h.dataset && h.dataset.dtdOrigLeft === undefined) h.dataset.dtdOrigLeft = h.style.left
            modifiedHandles.add(h)
            const targetLeft = `${Math.max(150, frameWidth - targetRightbar)}px`
            if (h.style.left !== targetLeft) h.style.setProperty('left', targetLeft, 'important')
          }
        }
      }
    }
  }

  const onSplitterPointerDown = (e: Event): void => {
    const pe = e as PointerEvent
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    if (pe.button !== undefined && pe.button !== 0) return
    const target = pe.target as HTMLElement | null
    if (target?.closest?.('.dtd-edge-toggle')) return
    const handle = target?.closest?.<HTMLElement>('[class*="mP3x-q_handle"]')
    if (!handle) return
    const frame = handle.closest?.<HTMLElement>('[class*="mP3x-q_frame"]') ?? document.querySelector<HTMLElement>('[class*="mP3x-q_frame"]')
    if (!frame) return
    const tracks = splitGridTracks(frame.style.gridTemplateColumns ?? '')
    const handles = Array.from(frame.querySelectorAll<HTMLElement>('[class*="mP3x-q_handle"]'))
    const rightbarCol = frame.querySelector<HTMLElement>('[data-rightbar-col], [class*="rightbarCol"]')
    const isHostSidebarOpen = tracks.length >= 2 ? !isZeroGridTrack(tracks[0]) : true
    const isHostRightbarOpen = tracks.length >= 3
      ? !isZeroGridTrack(tracks[2])
      : Boolean(rightbarCol && ((rightbarCol.childElementCount ?? (rightbarCol as unknown as { children?: { length: number } }).children?.length ?? 0) > 0))
    const idx = Math.max(0, handles.indexOf(handle))
    const frameRect = frame.getBoundingClientRect?.()
    const currentSidebar = parseFloat(frame.style.getPropertyValue('--dtd-sidebar-col')) || parseTrackMaxPx(tracks[0], 264)
    const currentRightbar = parseFloat(frame.style.getPropertyValue('--dtd-rightbar-col')) || parseTrackMaxPx(tracks[2], 360)
    const isSidebarHandle = resolveHandleSide(handle, idx, isHostSidebarOpen, isHostRightbarOpen, frameRect, currentSidebar) === 'sidebar'

    if ((isSidebarHandle && !isHostSidebarOpen) || (!isSidebarHandle && !isHostRightbarOpen)) return

    pe.preventDefault()
    pe.stopPropagation()
    activeDragCleanup?.()

    try {
      if (typeof handle.setPointerCapture === 'function' && pe.pointerId !== undefined) {
        handle.setPointerCapture(pe.pointerId)
      }
    } catch {}
    modifiedHandles.add(handle)
    frame.setAttribute?.('data-dragging', '1')
    handle.setAttribute?.('data-dragging', '1')

    const startX = pe.clientX
    const startWidth = isSidebarHandle ? currentSidebar : currentRightbar
    const frameWidth = Math.round(frameRect?.width || frame.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1200)

    const onMove = (moveEv: PointerEvent): void => {
      const dx = moveEv.clientX - startX
      if (isSidebarHandle) {
        const maxSidebar = Math.max(150, frameWidth - 150 - (isHostRightbarOpen ? (customRightbarWidth ?? currentRightbar) : 0))
        customSidebarWidth = Math.max(150, Math.min(Math.round(startWidth + dx), maxSidebar))
      } else {
        const maxRightbar = Math.max(150, frameWidth - 150 - (isHostSidebarOpen ? (customSidebarWidth ?? currentSidebar) : 0))
        customRightbarWidth = Math.max(150, Math.min(Math.round(startWidth - dx), maxRightbar))
      }
      syncElasticLayout()
    }
    const onEnd = (): void => {
      if (isSidebarHandle && customSidebarWidth !== undefined) {
        writeStoredPaneWidth('dsh-delta-desktop:sidebar-width', customSidebarWidth)
      } else if (!isSidebarHandle && customRightbarWidth !== undefined) {
        writeStoredPaneWidth('dsh-delta-desktop:rightbar-width', customRightbarWidth)
      }
      try {
        if (typeof handle.releasePointerCapture === 'function' && pe.pointerId !== undefined && handle.hasPointerCapture?.(pe.pointerId)) {
          handle.releasePointerCapture(pe.pointerId)
        }
      } catch {}
      frame.removeAttribute?.('data-dragging')
      handle.removeAttribute?.('data-dragging')
      activeDragCleanup?.()
      activeDragCleanup = undefined
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', onMove, { capture: true })
      window.addEventListener('pointerup', onEnd, { capture: true })
      window.addEventListener('pointercancel', onEnd, { capture: true })
      activeDragCleanup = () => {
        frame.removeAttribute?.('data-dragging')
        handle.removeAttribute?.('data-dragging')
        window.removeEventListener('pointermove', onMove, { capture: true })
        window.removeEventListener('pointerup', onEnd, { capture: true })
        window.removeEventListener('pointercancel', onEnd, { capture: true })
      }
    }
  }

  const modifiedMenuNodes = new Set<HTMLElement>()
  const hiddenFeedbackNodes = new Set<HTMLElement>()
  const hiddenSessionLogNodes = new Set<HTMLElement>()
  const hiddenPrivacyCmdNodes = new Set<HTMLElement>()
  const hiddenSettingsRows = new Set<HTMLElement>()
  const hiddenSoleWorkspaceNodes = new Set<HTMLElement>()
  const hiddenDeletedRows = new Set<HTMLElement>()
  const hiddenEmptyUngroupedNodes = new Set<HTMLElement>()
  const collapsibleErrorHandlers = new Map<HTMLElement, (e: Event) => void>()
  const modifiedTailNavCells = new Set<HTMLElement>()
  let lastMenuSessionId: string | undefined
  let ungroupedMenuEl: HTMLElement | undefined
  const closeUngroupedMenu = (): void => {
    ungroupedMenuEl?.remove?.()
    ungroupedMenuEl = undefined
  }
  let trackedModalPanel: HTMLElement | undefined
  let modalOffsetX = 0
  let modalOffsetY = 0
  let activeModalDragCleanup: (() => void) | undefined

  const applyModalOffset = (panel: HTMLElement, x: number, y: number): void => {
    modalOffsetX = Math.round(x)
    modalOffsetY = Math.round(y)
    panel.style?.setProperty?.('--dtd-modal-x', `${modalOffsetX}px`)
    panel.style?.setProperty?.('--dtd-modal-y', `${modalOffsetY}px`)
  }

  const resetModalState = (): void => {
    activeModalDragCleanup?.()
    activeModalDragCleanup = undefined
    const panels = new Set<HTMLElement>()
    if (trackedModalPanel) panels.add(trackedModalPanel)
    if (typeof document?.querySelectorAll === 'function') {
      try {
        for (const p of document.querySelectorAll<HTMLElement>('[class*="AnXs9G_panel"]')) {
          panels.add(p)
        }
      } catch {}
    }
    for (const p of panels) {
      try {
        p.removeAttribute?.('data-dtd-dragging')
        p.style?.removeProperty?.('--dtd-modal-x')
        p.style?.removeProperty?.('--dtd-modal-y')
      } catch {}
    }
    trackedModalPanel = undefined
    modalOffsetX = 0
    modalOffsetY = 0
  }

  const syncModalPanel = (): void => {
    if (typeof document?.querySelector !== 'function') return
    const current = document.querySelector<HTMLElement>('[class*="AnXs9G_panel"]') ?? undefined
    if (current !== trackedModalPanel) {
      activeModalDragCleanup?.()
      activeModalDragCleanup = undefined
      if (trackedModalPanel) {
        try {
          trackedModalPanel.removeAttribute?.('data-dtd-dragging')
          trackedModalPanel.style?.removeProperty?.('--dtd-modal-x')
          trackedModalPanel.style?.removeProperty?.('--dtd-modal-y')
        } catch {}
      }
      trackedModalPanel = current
      modalOffsetX = 0
      modalOffsetY = 0
    }
  }

  const onModalPointerDown = (e: Event): void => {
    const pe = e as PointerEvent
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    if (pe.button !== undefined && pe.button !== 0) return
    const target = pe.target as HTMLElement | null
    const headerHandle = target?.closest?.<HTMLElement>('[class*="AnXs9G_navTitle"], [class*="AnXs9G_header"]')
    if (!headerHandle) return
    if (target?.closest?.('button, a, input, select, textarea, [role="button"], [tabindex="0"]')) return
    const panel = headerHandle.closest?.<HTMLElement>('[class*="AnXs9G_panel"]')
    if (!panel) return
    const panelRect = panel.getBoundingClientRect?.()
    if (!panelRect) return
    const vw = (typeof window !== 'undefined' ? window.innerWidth : 0) || 1200
    const vh = (typeof window !== 'undefined' ? window.innerHeight : 0) || 800
    if (panelRect.width >= vw - 16 && panelRect.height >= vh - 16) return

    pe.preventDefault()
    activeModalDragCleanup?.()
    if (trackedModalPanel !== panel) {
      trackedModalPanel = panel
      modalOffsetX = 0
      modalOffsetY = 0
    }
    const startMouseX = pe.clientX
    const startMouseY = pe.clientY
    const startOffX = modalOffsetX
    const startOffY = modalOffsetY
    const baseLeft = panelRect.left - startOffX
    const baseRight = panelRect.right - startOffX
    const baseTop = panelRect.top - startOffY
    const baseBottom = panelRect.bottom - startOffY
    const minX = -baseLeft + 8
    const maxX = vw - baseRight - 8
    const minY = -baseTop + 8
    const maxY = vh - baseBottom - 8
    panel.setAttribute?.('data-dtd-dragging', '1')

    const onMove = (moveEv: PointerEvent): void => {
      const rawX = startOffX + (moveEv.clientX - startMouseX)
      const rawY = startOffY + (moveEv.clientY - startMouseY)
      const clampedX = minX <= maxX ? Math.max(minX, Math.min(rawX, maxX)) : 0
      const clampedY = minY <= maxY ? Math.max(minY, Math.min(rawY, maxY)) : 0
      applyModalOffset(panel, clampedX, clampedY)
    }
    const onEnd = (): void => {
      panel.removeAttribute?.('data-dtd-dragging')
      activeModalDragCleanup?.()
      activeModalDragCleanup = undefined
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', onMove, { capture: true })
      window.addEventListener('pointerup', onEnd, { capture: true })
      window.addEventListener('pointercancel', onEnd, { capture: true })
      activeModalDragCleanup = () => {
        window.removeEventListener('pointermove', onMove, { capture: true })
        window.removeEventListener('pointerup', onEnd, { capture: true })
        window.removeEventListener('pointercancel', onEnd, { capture: true })
      }
    }
  }

  const onModalDblClick = (e: Event): void => {
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    const target = e.target as HTMLElement | null
    const headerHandle = target?.closest?.<HTMLElement>('[class*="AnXs9G_navTitle"], [class*="AnXs9G_header"]')
    if (!headerHandle || target?.closest?.('button, a, input, select, textarea, [role="button"]')) return
    const panel = headerHandle.closest?.<HTMLElement>('[class*="AnXs9G_panel"]')
    if (panel) applyModalOffset(panel, 0, 0)
  }

  const restoreHiddenNodes = (attrName: string, store: Set<HTMLElement>): void => {
    for (const node of store) {
      try {
        node.removeAttribute?.(attrName)
        node.removeAttribute?.('aria-hidden')
        node.hidden = false
      } catch {}
    }
    store.clear()
  }

  const hidePrivacyNode = (node: HTMLElement, attrName: string, store: Set<HTMLElement>): void => {
    if (node.getAttribute?.(attrName) !== '1') node.setAttribute?.(attrName, '1')
    node.setAttribute?.('aria-hidden', 'true')
    node.hidden = true
    store.add(node)
  }

  const reset = (): void => {
    closeUngroupedMenu()
    hideTooltip()
    try { tooltipEl?.remove?.() } catch {}
    tooltipEl = undefined
    resetElasticLayout()
    resetModalState()
    for (const node of modifiedMenuNodes) {
      try {
        node.removeAttribute?.('data-dtd-menu-order')
        node.style?.removeProperty?.('order')
      } catch {}
    }
    modifiedMenuNodes.clear()
    restoreHiddenNodes('data-dtd-hidden-feedback', hiddenFeedbackNodes)
    restoreHiddenNodes('data-dtd-hidden-empty-ungrouped', hiddenEmptyUngroupedNodes)
    for (const navBtn of modifiedTailNavCells) {
      try { navBtn.removeAttribute?.('data-dtd-nav-tail') } catch {}
    }
    modifiedTailNavCells.clear()
    if (silentMenuTimer !== undefined) {
      cancelTimer(silentMenuTimer)
      silentMenuTimer = undefined
    }
    canOpenMenuSilently = false
    isUpdateBusy = false
    try { document?.body?.removeAttribute?.('data-dtd-silent-menu') } catch {}
    for (const [btn, orig] of mutatedNavButtons) {
      try {
        if (orig.origAria !== null) btn.setAttribute?.('aria-label', orig.origAria)
        const current = btn.textContent?.trim() ?? ''
        if (orig.origText && current && current !== orig.origText) {
          setButtonLabel(btn, current, orig.origText)
        }
      } catch {}
    }
    mutatedNavButtons.clear()
    for (const [heading, origText] of mutatedPageHeadings) {
      try {
        const current = heading.textContent?.trim() ?? ''
        if (origText && current && current !== origText) {
          setButtonLabel(heading, current, origText)
        }
      } catch {}
    }
    mutatedPageHeadings.clear()
    for (const [el, prevDisplay] of hiddenMoreElements) {
      try {
        if (el.style) {
          if (prevDisplay) el.style.setProperty('display', prevDisplay)
          else el.style.removeProperty?.('display')
        }
      } catch {}
    }
    hiddenMoreElements.clear()
    for (const node of mounted.values()) node.remove()
    mounted.clear()
    if (typeof document?.querySelector === 'function') {
      try {
        const footArea = document.querySelector<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')
        if (footArea && typeof footArea.querySelector === 'function') {
          footArea.querySelector('.dtd-footer-avatar-box')?.remove()
          footArea.querySelector('.dtd-footer-actions')?.remove()
        }
      } catch {}
    }
    root?.removeAttribute?.('data-delta-compat')
    root?.removeAttribute?.('data-delta-compat-status')
  }
  const persistedExpansion = (): Record<string, boolean> => {
    try {
      const stored = JSON.parse(localStorage.getItem('dsh.workspace.view.v5') ?? '{}') as {
        groupExpansion?: Record<string, boolean>
      }
      return stored.groupExpansion ?? {}
    } catch { return {} }
  }
  const replaceButtonText = (btn: HTMLElement, from: string, to: string): void => {
    const rawText = btn.textContent?.trim() ?? ''
    const aria = btn.getAttribute?.('aria-label')?.trim() ?? ''
    if (rawText !== from && aria !== from) return
    if (!mutatedNavButtons.has(btn)) {
      mutatedNavButtons.set(btn, { origText: rawText, origAria: btn.getAttribute?.('aria-label') ?? null })
    }
    if (aria === from) btn.setAttribute('aria-label', to)
    if (rawText === from) setButtonLabel(btn, from, to)
  }

  const SESSION_MENU_ORDERS: Record<string, string> = {
    '\u91cd\u547d\u540d': '10', 'Rename': '10',
    '\u7f6e\u9876\u4f1a\u8bdd': '20', '\u53d6\u6d88\u7f6e\u9876': '20', 'Pin': '20', 'Unpin': '20',
    '\u5206\u53c9\u4f1a\u8bdd': '30', 'Fork': '30', 'Fork session': '30',
    '\u5728\u6587\u4ef6\u5939\u663e\u793a': '50', '\u5728 Finder \u663e\u793a': '50', 'Show in folder': '50', 'Show in Finder': '50',
    '\u590d\u5236 Session ID': '60', 'Copy Session ID': '60',
    '\u9501\u5b9a\u4f1a\u8bdd': '76', '\u89e3\u9501\u4f1a\u8bdd': '76', 'Lock session': '76', 'Unlock session': '76', 'Lock conversation': '76', 'Unlock conversation': '76',
    '\u79fb\u52a8\u4f1a\u8bdd': '78', 'Move session': '78', 'Move conversation': '78',
    '\u5f52\u6863\u4f1a\u8bdd': '80', '\u53d6\u6d88\u5f52\u6863': '80', 'Archive': '80', 'Unarchive': '80',
    '\u5220\u9664\u4f1a\u8bdd': '90', 'Delete session': '90', 'Delete conversation': '90',
  }
  const VIEW_OPTIONS_ORDERS: Record<string, string> = {
    '\u5206\u7ec4\u65b9\u5f0f': '10', 'Group by': '10',
    '\u5355\u5217\u8868': '15', 'In one list': '15',
    '\u6309\u5de5\u4f5c\u533a': '20', 'WorkSpace': '20',
    '\u6309\u5de5\u4f5c\u533a\u6811': '30', 'Workspace Tree': '30',
    '\u6392\u5e8f\u65b9\u5f0f': '40', 'Order by': '40',
    '\u624b\u52a8\u6392\u5e8f': '45', 'Manual': '45',
    '\u6700\u8fd1\u66f4\u65b0': '50', 'Last updated': '50',
    '\u7b5b\u9009\u4f1a\u8bdd': '60', 'Filter sessions': '60',
    '\u9690\u85cf\u5df2\u5f52\u6863': '65', 'Hide archived': '65',
    '\u4ec5\u663e\u793a\u5df2\u5f52\u6863': '70', 'Archived only': '70',
    '\u5168\u90e8\u5bf9\u8bdd（\u663e\u793a\u5df2\u5f52\u6863）': '80', 'All conversations (show archived)': '80',
  }

  const FEEDBACK_MENU_LABELS = new Set([
    '\u53cd\u9988',
    'Feedback',
    'フィードバック',
    'Comentarios',
    'Commentaires',
    'Rückmeldung',
    'Обратная связь',
    'Comentários',
  ])

  const BLOCKED_COMMAND_RE = /^\/(?:export|feedback)(?:\s|$)/i
  const SETTINGS_HIDDEN_TEXT_RE = /^(?:\u5f53\u524d\u7248\u672c|Current version)\s*[:：]|\u4e0a\u4f20\s*Session\s*Log|Upload\s+session\s+log|\u5e2e\u52a9\u6539\u8fdb\s*DeepSeek/i
  const LOCKED_UNARCHIVE_LABELS = new Set(['\u53d6\u6d88\u5f52\u6863', 'Unarchive', 'Unarchive session'])
  const LOCKED_MUTATION_LABELS = new Set([
    '\u91cd\u547d\u540d', 'Rename', '\u5206\u53c9\u4f1a\u8bdd', 'Fork', 'Fork session',
    '\u79fb\u52a8\u4f1a\u8bdd', 'Move session', 'Move conversation',
    '\u5f52\u6863\u4f1a\u8bdd', 'Archive', 'Archive session',
    '\u5220\u9664\u4f1a\u8bdd', 'Delete session', 'Delete conversation',
  ])
  const WORKSPACE_DELETE_LABELS = new Set(['\u5220\u9664\u5de5\u4f5c\u533a', 'Delete workspace'])
  const WORKSPACE_RENAME_LABELS = new Set(['\u91cd\u547d\u540d', '\u91cd\u547d\u540d\u5de5\u4f5c\u533a', 'Rename', 'Rename workspace'])

  const rewrittenRunningTexts = new Map<Node, string>()

  const cleanupCollapsibleErrors = (): void => {
    for (const [node, orig] of rewrittenRunningTexts) {
      try {
        if ((node as Node).nodeValue !== undefined && node.nodeValue !== orig) {
          node.nodeValue = orig
        }
      } catch {}
    }
    rewrittenRunningTexts.clear()
    for (const [row, handler] of collapsibleErrorHandlers) {
      try {
        row.removeAttribute?.('data-dtd-collapsible')
        row.removeAttribute?.('data-dtd-expanded')
        row.removeAttribute?.('aria-expanded')
        row.removeEventListener?.('click', handler)
        row.removeEventListener?.('keydown', handler)
      } catch {}
    }
    collapsibleErrorHandlers.clear()
  }

  const normalizeRunningDomText = (isDelta: boolean): void => {
    for (const stale of rewrittenRunningTexts.keys()) {
      if (!(stale as { isConnected?: boolean }).isConnected) rewrittenRunningTexts.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return
    if (!isDelta) {
      for (const [node, orig] of rewrittenRunningTexts) {
        try {
          if (node.nodeValue !== orig) node.nodeValue = orig
        } catch {}
      }
      rewrittenRunningTexts.clear()
      return
    }
    normalizeRunningStatusNodesInDoc((cur, val) => {
      if (!rewrittenRunningTexts.has(cur)) rewrittenRunningTexts.set(cur, val)
    })
  }

  const setMenuNodeOrder = (node: HTMLElement, order: string): void => {
    if (node.getAttribute('data-dtd-menu-order') !== order) node.setAttribute('data-dtd-menu-order', order)
    if (node.style?.getPropertyValue?.('order') !== order) node.style?.setProperty?.('order', order, 'important')
    modifiedMenuNodes.add(node)
  }

  const getMenuLabel = (el: HTMLElement): string => {
    const labelEl = el.querySelector?.<HTMLElement>('[class*="_itemLabel_"]')
    if (labelEl?.textContent) return labelEl.textContent.trim()
    if (el.getAttribute?.('role') === 'menuitem') return (el.textContent ?? '').trim()
    const itemEl = el.querySelector?.<HTMLElement>('[role="menuitem"]')
    return (itemEl?.textContent ?? el.textContent ?? '').trim()
  }

  const syncPrivacyDom = (): void => {
    deltaFeatures.ensureLoaded()
    normalizeRunningDomText(controller.getSnapshot().mode === 'delta')
    syncModalChromeOverlay()
    for (const stale of hiddenSessionLogNodes) {
      if (!stale.isConnected) hiddenSessionLogNodes.delete(stale)
    }
    for (const stale of hiddenPrivacyCmdNodes) {
      if (!stale.isConnected) hiddenPrivacyCmdNodes.delete(stale)
    }
    for (const stale of hiddenSettingsRows) {
      if (!stale.isConnected) hiddenSettingsRows.delete(stale)
    }
    for (const stale of hiddenSoleWorkspaceNodes) {
      if (!stale.isConnected) hiddenSoleWorkspaceNodes.delete(stale)
    }
    for (const stale of hiddenDeletedRows) {
      if (!stale.isConnected) hiddenDeletedRows.delete(stale)
    }
    for (const stale of hiddenEmptyUngroupedNodes) {
      if (!stale.isConnected) hiddenEmptyUngroupedNodes.delete(stale)
    }
    for (const [row, handler] of collapsibleErrorHandlers) {
      if (!row.isConnected) {
        row.removeEventListener?.('click', handler)
        row.removeEventListener?.('keydown', handler)
        collapsibleErrorHandlers.delete(row)
      }
    }
    if (typeof document?.querySelectorAll !== 'function') return

    // 1. Hide "\u4e0a\u4f20 Session Log" & "\u5f53\u524d\u7248\u672c" rows inside Settings dialog
    const settingRows = document.querySelectorAll<HTMLElement>(
      '[class*="_0NG6bG_row"], [data-slot="settings.general.item"] > *, [class*="RmVo8q_section"] [class*="_row"], [role="dialog"] [data-setting-id="session-log-deepseek"], [role="dialog"] [data-setting-id="current-version"]'
    )
    for (const row of settingRows) {
      if (row.getAttribute?.('data-slot') || row.querySelector?.('[data-slot], [data-delta-personalization]')) continue
      const cls = typeof row.className === 'string' ? row.className : ''
      const txt = (row.textContent ?? '').trim()
      if (cls.includes('_0NG6bG_row') || (txt.length > 0 && txt.length < 240 && SETTINGS_HIDDEN_TEXT_RE.test(txt))) {
        hidePrivacyNode(row, 'data-dtd-hidden-settings-row', hiddenSettingsRows)
      }
    }

    // 2. Sync locked session badges, deleted rows, and active session lock shield
    const sessionRows = document.querySelectorAll<HTMLElement>('[data-row-key^="session:"]')
    let selectedSid: string | undefined
    for (const row of sessionRows) {
      const key = row.getAttribute?.('data-row-key') ?? ''
      const sid = key.startsWith('session:') ? key.slice(8) : ''
      if (!sid) continue
      if (deltaFeatures.isDeleted(sid)) {
        hidePrivacyNode(row, 'data-dtd-hidden-deleted', hiddenDeletedRows)
        continue
      } else if (row.getAttribute?.('data-dtd-hidden-deleted') === '1') {
        row.removeAttribute?.('data-dtd-hidden-deleted')
        row.removeAttribute?.('aria-hidden')
        row.hidden = false
        hiddenDeletedRows.delete(row)
      }

      const rowCls = typeof row.className === 'string' ? row.className : ''
      if (
        row.getAttribute?.('aria-current') === 'page' ||
        row.getAttribute?.('aria-selected') === 'true' ||
        row.getAttribute?.('data-selected') === 'true' ||
        row.getAttribute?.('data-active') === 'true' ||
        rowCls.includes('selected') ||
        /\bactive\b|_active_/.test(rowCls)
      ) {
        selectedSid = sid
      }

      const locked = deltaFeatures.isLocked(sid)
      const existingBadge = (row.querySelector?.('.dtd-session-lock-badge') as HTMLElement | null) ?? null
      if (locked) {
        if (row.getAttribute?.('data-dtd-session-locked') !== '1') row.setAttribute?.('data-dtd-session-locked', '1')
        if (!existingBadge) {
          const badge = document.createElement('span')
          badge.className = 'dtd-session-lock-badge'
          badge.setAttribute('aria-hidden', 'true')
          badge.appendChild(createLockSvg(12, false))
          row.appendChild?.(badge)
        }
      } else {
        if (row.hasAttribute?.('data-dtd-session-locked')) row.removeAttribute?.('data-dtd-session-locked')
        existingBadge?.remove?.()
      }
    }
    if (selectedSid) deltaFeatures.setActiveSessionId(selectedSid)
    if (typeof document.querySelector === 'function') {
      const centerCol = document.querySelector<HTMLElement>('[class*="mP3x-q_centerCol"], [class*="an3WzG_body"], main, [data-chat-scrollport]')
      deltaFeatures.syncLockShieldOverlay(centerCol)
    }

    // 3. Default-collapse failed turn error rows to a single line with click toggle
    const errorRows = document.querySelectorAll<HTMLElement>('[class*="turnErrorRow"]')
    for (const errRow of errorRows) {
      if (errRow.getAttribute?.('data-dtd-collapsible') === '1') continue
      errRow.setAttribute?.('data-dtd-collapsible', '1')
      errRow.setAttribute?.('data-dtd-expanded', '0')
      errRow.setAttribute?.('aria-expanded', 'false')
      const toggle = (e: Event) => {
        if (e.type === 'keydown') {
          const ke = e as KeyboardEvent
          if (ke.key !== 'Enter' && ke.key !== ' ') return
          ke.preventDefault?.()
        }
        const cur = errRow.getAttribute?.('data-dtd-expanded') === '1'
        const next = cur ? '0' : '1'
        errRow.setAttribute?.('data-dtd-expanded', next)
        errRow.setAttribute?.('aria-expanded', next === '1' ? 'true' : 'false')
      }
      errRow.addEventListener?.('click', toggle)
      errRow.addEventListener?.('keydown', toggle)
      collapsibleErrorHandlers.set(errRow, toggle)
    }

    // 4. Hide blocked commands (/export, /feedback) and session-log download menu + sole-workspace delete menu
    const cmdContainers = document.querySelectorAll<HTMLElement>('[role="listbox"], [class*="command"]')
    for (const box of cmdContainers) {
      const cmdItems = typeof box.querySelectorAll === 'function'
        ? (box.querySelectorAll('[role="option"], [role="menuitem"]') as NodeListOf<HTMLElement>)
        : Array.from(box.children ?? []) as HTMLElement[]
      for (const cmd of cmdItems) {
        const text = (cmd.textContent ?? '').trim()
        if (BLOCKED_COMMAND_RE.test(text)) {
          hidePrivacyNode(cmd, 'data-dtd-hidden-privacy-cmd', hiddenPrivacyCmdNodes)
        }
      }
    }
    const soleWorkspace = deltaFeatures.getWorkspaceCount() === 1
    const containers = document.querySelectorAll<HTMLElement>('[class*="_viewport_1p5el"], [class*="_footer_1p5el"], [role="menu"]')
    for (const container of containers) {
      const items = Array.from(container.children ?? []) as HTMLElement[]
      const labels = items.map(getMenuLabel)
      const isWorkspaceMenu = soleWorkspace
        && labels.some(l => WORKSPACE_RENAME_LABELS.has(l))
        && labels.some(l => WORKSPACE_DELETE_LABELS.has(l))
      for (let i = 0; i < items.length; i++) {
        const el = items[i]
        const isMenuItemRow = el.getAttribute?.('role') === 'menuitem' || Boolean(el.querySelector?.('[role="menuitem"]'))
        if (!isMenuItemRow) continue
        if (isWorkspaceMenu && WORKSPACE_DELETE_LABELS.has(labels[i])) {
          hidePrivacyNode(el, 'data-dtd-hidden-sole-workspace', hiddenSoleWorkspaceNodes)
        }
      }
    }

    // 5. Auto-hide empty "\u672a\u5206\u7ec4" (Ungrouped) bucket when zero visible sessions belong to it
    const ungroupedRows = document.querySelectorAll<HTMLElement>('[data-row-key="workspace:"]')
    const hasSessApi = deltaFeatures.hasSessionsApi()
    const visibleUngroupedCount = hasSessApi ? deltaFeatures.getUngroupedSessionIds(false).length : -1
    for (const uRow of ungroupedRows) {
      const groupSection = (uRow.closest?.('[class*="groupSection"]') as HTMLElement | null) ?? uRow.parentElement
      const targetBox = groupSection && groupSection !== document.body && groupSection !== document.documentElement ? groupSection : uRow
      const domSessionRows = (targetBox.querySelectorAll?.('[data-row-key^="session:"]') as NodeListOf<HTMLElement> | undefined) ?? []
      let hasVisibleDomSession = false
      for (const sr of domSessionRows) {
        const k = sr.getAttribute?.('data-row-key') ?? ''
        const sid = k.startsWith('session:') ? k.slice(8) : ''
        if (sid && !deltaFeatures.isDeleted(sid) && !sr.hidden && sr.getAttribute?.('data-dtd-hidden-deleted') !== '1') {
          hasVisibleDomSession = true
          break
        }
      }
      const isExpanded = uRow.getAttribute?.('aria-expanded') === 'true'
      const shouldHide = hasSessApi
        ? (visibleUngroupedCount === 0 && !hasVisibleDomSession)
        : (isExpanded && !hasVisibleDomSession)
      if (shouldHide && controller.getSnapshot().mode === 'delta') {
        hidePrivacyNode(targetBox, 'data-dtd-hidden-empty-ungrouped', hiddenEmptyUngroupedNodes)
      } else if (targetBox.getAttribute?.('data-dtd-hidden-empty-ungrouped') === '1') {
        targetBox.removeAttribute?.('data-dtd-hidden-empty-ungrouped')
        targetBox.removeAttribute?.('aria-hidden')
        targetBox.hidden = false
        hiddenEmptyUngroupedNodes.delete(targetBox)
      }
    }
  }

  const syncMenus = (): void => {
    syncPrivacyDom()
    for (const stale of modifiedMenuNodes) {
      if (!stale.isConnected) modifiedMenuNodes.delete(stale)
    }
    for (const stale of hiddenFeedbackNodes) {
      if (!stale.isConnected) hiddenFeedbackNodes.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return
    const containers = document.querySelectorAll<HTMLElement>('[class*="_viewport_1p5el"], [class*="_footer_1p5el"], [role="menu"]')
    for (const container of containers) {
      const items = Array.from(container.children ?? []) as HTMLElement[]
      if (items.length === 0) continue
      const labels = items.map(getMenuLabel)
      for (let i = 0; i < items.length; i++) {
        const el = items[i]
        const isMenuItemRow = el.getAttribute?.('role') === 'menuitem' || Boolean(el.querySelector?.('[role="menuitem"]'))
        if (!isMenuItemRow) continue
        if (FEEDBACK_MENU_LABELS.has(labels[i])) {
          hidePrivacyNode(el, 'data-dtd-hidden-feedback', hiddenFeedbackNodes)
        }
      }
      if (items.length < 2) continue
      const isFooterContainer = typeof container.className === 'string' && container.className.includes('_footer_1p5el')
      const isSessionFooter = labels.some(t => t === '\u5f52\u6863\u4f1a\u8bdd' || t === '\u53d6\u6d88\u5f52\u6863' || t === 'Archive' || t === 'Unarchive')
        && labels.some(t => t === '\u9501\u5b9a\u4f1a\u8bdd' || t === '\u89e3\u9501\u4f1a\u8bdd' || t === 'Lock session' || t === 'Unlock session'
          || t === '\u79fb\u52a8\u4f1a\u8bdd' || t === 'Move session' || t === 'Move conversation'
          || t === '\u5220\u9664\u4f1a\u8bdd' || t === 'Delete session' || t === 'Delete conversation')
      const isSessionMenu = labels.some(t => t === '\u7f6e\u9876\u4f1a\u8bdd' || t === '\u53d6\u6d88\u7f6e\u9876' || t === 'Pin' || t === 'Unpin')
        || (labels.some(t => t === '\u91cd\u547d\u540d' || t === 'Rename') && (
          labels.some(t => t === '\u5206\u53c9\u4f1a\u8bdd' || t === 'Fork' || t === 'Fork session')
          || labels.some(t => t === '\u590d\u5236 Session ID' || t === 'Copy Session ID')
          || labels.some(t => t === '\u5728\u6587\u4ef6\u5939\u663e\u793a' || t === '\u5728 Finder \u663e\u793a' || t === 'Show in folder' || t === 'Show in Finder')
        ))
        || (labels.some(t => t === '\u590d\u5236 Session ID' || t === 'Copy Session ID') && labels.some(t => t === '\u5728\u6587\u4ef6\u5939\u663e\u793a' || t === '\u5728 Finder \u663e\u793a' || t === 'Show in folder' || t === 'Show in Finder'))
        || isSessionFooter
      const isViewMenu = labels.some(t => t === '\u5355\u5217\u8868' || t === 'In one list')
        && (labels.some(t => t === '\u6309\u5de5\u4f5c\u533a' || t === 'WorkSpace') || labels.some(t => t === '\u4ec5\u663e\u793a\u5df2\u5f52\u6863' || t === 'Archived only'))
      if (!isSessionMenu && !isViewMenu) continue

      let seenSep = 0
      const table = isSessionMenu ? SESSION_MENU_ORDERS : VIEW_OPTIONS_ORDERS
      for (let i = 0; i < items.length; i++) {
        const el = items[i]
        const isSep = el.getAttribute?.('role') === 'separator' || (typeof el.className === 'string' && el.className.includes('_separator_'))
        if (isSep) {
          if (isFooterContainer || isSessionFooter) {
            hidePrivacyNode(el, 'data-dtd-hidden-session-log', hiddenSessionLogNodes)
            continue
          }
          seenSep++
          if (isSessionMenu) setMenuNodeOrder(el, seenSep === 1 ? '40' : '75')
          else setMenuNodeOrder(el, seenSep === 1 ? '35' : '55')
          continue
        }
        const label = labels[i]
        if (label in table) {
          setMenuNodeOrder(el, table[label])
        } else if (isSessionMenu) {
          setMenuNodeOrder(el, seenSep === 0 ? '35' : '70')
        }
      }
    }
  }

  const syncSettingsNav = (): void => {
    for (const stale of modifiedTailNavCells) {
      if (!stale.isConnected) modifiedTailNavCells.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return
    const settingsNavButtons = document.querySelectorAll<HTMLButtonElement>(
      '[class*="AnXs9G_navCell"], [class*="navCell"], [role="dialog"] nav button, [role="dialog"] [role="tab"]'
    )
    for (const btn of settingsNavButtons) {
      replaceButtonText(btn, '\u8d26\u53f7\u4e0e\u4f59\u989d', '\u8d26\u6237\u8be6\u60c5')
      replaceButtonText(btn, '\u6a21\u578b', '\u6a21\u578b\u914d\u7f6e')
      const labelText = (btn.querySelector?.('[class*="navLabel"]')?.textContent ?? btn.textContent ?? '').trim()
      if (labelText === 'Agent \u9884\u8bbe' || labelText === 'Agent Presets' || labelText === 'Agent presets') {
        if (btn.getAttribute('data-dtd-nav-tail') !== '1') {
          btn.setAttribute('data-dtd-nav-tail', '1')
          modifiedTailNavCells.add(btn)
        }
      } else if (btn.hasAttribute('data-dtd-nav-tail')) {
        btn.removeAttribute('data-dtd-nav-tail')
        modifiedTailNavCells.delete(btn)
      }
    }
  }
  const syncPageHeadings = (): void => {
    for (const stale of mutatedPageHeadings.keys()) {
      if (!stale.isConnected) mutatedPageHeadings.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return
    if (language() !== 'zh') {
      for (const [heading, origText] of mutatedPageHeadings) {
        const cur = heading.textContent?.trim() ?? ''
        const patched = origText === '\u63d2\u4ef6' ? '\u63d2\u4ef6\u7ba1\u7406' : (origText === '\u81ea\u52a8\u5316\u4efb\u52a1' ? '\u5b9a\u65f6\u4efb\u52a1' : origText)
        if (cur === patched) setButtonLabel(heading, patched, origText)
        mutatedPageHeadings.delete(heading)
      }
      return
    }
    const headings = document.querySelectorAll<HTMLElement>('h1')
    for (const heading of headings) {
      const parentCls = typeof heading.parentElement?.className === 'string' ? heading.parentElement.className : ''
      const isHostPageHeading = heading.getAttribute?.('data-plugin-header-part') === 'title'
        || /PluginManagerPage|TaskManagerPage|pageHeading/.test(parentCls)
        || Boolean(heading.closest?.('[class*="PluginManagerPage"], [class*="TaskManagerPage"], [class*="pageHeading"]'))
      if (!isHostPageHeading) continue
      const text = heading.textContent?.trim() ?? ''
      if (text === '\u63d2\u4ef6') {
        if (!mutatedPageHeadings.has(heading)) mutatedPageHeadings.set(heading, '\u63d2\u4ef6')
        setButtonLabel(heading, '\u63d2\u4ef6', '\u63d2\u4ef6\u7ba1\u7406')
      } else if (text === '\u81ea\u52a8\u5316\u4efb\u52a1') {
        if (!mutatedPageHeadings.has(heading)) mutatedPageHeadings.set(heading, '\u81ea\u52a8\u5316\u4efb\u52a1')
        setButtonLabel(heading, '\u81ea\u52a8\u5316\u4efb\u52a1', '\u5b9a\u65f6\u4efb\u52a1')
      }
    }
  }
  const processHoverCards = (): void => {
    if (typeof document === 'undefined' || !document.querySelectorAll) return
    const hoverCards = document.querySelectorAll<HTMLElement>('[class*="hoverContent"], [class*="SessionHoverContent"], .wnFoaW_hoverContent')
    for (let i = 0; i < hoverCards.length; i++) {
      const card = hoverCards[i]
      const outerCard = card.closest?.<HTMLElement>('[class*="_card_bgejw"], [class*="HoverCard"], [class*="card"]') ?? card.parentElement
      if (outerCard && outerCard.classList && !outerCard.classList.contains('dtd-session-hover-card')) {
        outerCard.classList.add('dtd-session-hover-card')
      }
    }
  }
  const sync = (): void => {
    if (isDisposed || isSyncing) return
    isSyncing = true
    try {
      deltaFeatures.ensureLoaded()
      syncPrivacyDom()
      if (controller.getSnapshot().mode !== 'delta') {
        if (mounted.size > 0 || root?.hasAttribute?.('data-delta-compat')) reset()
        else resetElasticLayout()
        return
      }
      if (typeof document?.querySelector !== 'function') return
      const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]') ??
        document.querySelector<HTMLElement>('[class*="wtg9ga_root"], [class*="SidebarRoot_root"]') ??
        document.querySelector<HTMLElement>('nav')?.parentElement ?? null
      const navigation = viewport?.querySelector<HTMLElement>(':scope > nav') ??
        viewport?.querySelector<HTMLElement>('nav') ??
        document.querySelector<HTMLElement>('nav')
      const header = viewport?.querySelector<HTMLElement>('[data-sidebar-workspace-header]') ??
        viewport?.querySelector<HTMLElement>('[class*="sectionHeader"], [class*="GAkraW_sectionHeader"]') ??
        document.querySelector<HTMLElement>('[data-sidebar-workspace-header]') ??
        document.querySelector<HTMLElement>('[class*="sectionHeader"], [class*="GAkraW_sectionHeader"]')
      const nativeInput = header?.querySelector<HTMLInputElement>('input[type="text"]') ??
        header?.querySelector<HTMLInputElement>('input[class*="searchInput"]') ??
        document.querySelector<HTMLInputElement>('[data-sidebar-workspace-header] input[type="text"]') ??
        document.querySelector<HTMLInputElement>('input[class*="searchInput"]') ?? null
      const nativeSearch = header?.querySelector<HTMLButtonElement>('button[aria-expanded]') ??
        header?.querySelector<HTMLButtonElement>('button[class*="searchButton"]') ??
        header?.querySelector<HTMLButtonElement>('button[aria-label*="search" i], button[aria-label*="\u641c\u7d22"]') ??
        document.querySelector<HTMLButtonElement>('[data-sidebar-workspace-header] button[aria-expanded]') ??
        document.querySelector<HTMLButtonElement>('button[class*="searchButton"]') ?? null
      if (!viewport || !navigation || !header || !nativeSearch) {
        if (mounted.size > 0 || root?.hasAttribute?.('data-delta-compat')) reset()
        syncElasticLayout()
        return
      }
      if (root.getAttribute('data-delta-compat') !== '1') root.setAttribute('data-delta-compat', '1')
      if (root.getAttribute('data-delta-compat-status') !== 'mounted') root.setAttribute('data-delta-compat-status', 'mounted')

      // If service-backed search is mounted, delegate search to it; otherwise mount proxy search.
      const hasServiceSearch = viewport.querySelector('[data-delta-search="sessions"]')
      if (hasServiceSearch) {
        mounted.get('search')?.remove()
        mounted.delete('search')
      } else {
        let search = mounted.get('search')
        if (!search || !search.isConnected) {
          search = document.createElement('div')
          search.className = 'dtd-native-search'
          search.setAttribute('data-delta-search', '')

          search.appendChild(createSearchIconSvg())

          const input = document.createElement('input')
          input.type = 'search'
          input.className = 'dtd-native-search-input'
          const initDict = DICTIONARIES[language()] ?? DICTIONARIES.en
          input.setAttribute('aria-label', initDict.ui.searchSessions)
          input.placeholder = initDict.searchPalette.sidebarPlaceholder
          input.maxLength = 500
          input.addEventListener('input', () => {
            const hostHeader = document.querySelector<HTMLElement>('[data-sidebar-workspace-header]') ??
              document.querySelector<HTMLElement>('[class*="sectionHeader"], [class*="GAkraW_sectionHeader"]')
            let hostInput = hostHeader?.querySelector<HTMLInputElement>('input[type="text"]') ??
              hostHeader?.querySelector<HTMLInputElement>('input[class*="searchInput"]') ??
              document.querySelector<HTMLInputElement>('[data-sidebar-workspace-header] input[type="text"]') ??
              document.querySelector<HTMLInputElement>('input[class*="searchInput"]')
            const hostButton = hostHeader?.querySelector<HTMLButtonElement>('button[aria-expanded]') ??
              hostHeader?.querySelector<HTMLButtonElement>('button[class*="searchButton"]') ??
              hostHeader?.querySelector<HTMLButtonElement>('button[aria-label*="search" i], button[aria-label*="\u641c\u7d22"]') ??
              document.querySelector<HTMLButtonElement>('[data-sidebar-workspace-header] button[aria-expanded]') ??
              document.querySelector<HTMLButtonElement>('button[class*="searchButton"]')
            if (hostButton && hostButton.getAttribute('aria-expanded') !== 'true') hostButton.click()
            if (!hostInput) hostInput = document.querySelector<HTMLInputElement>('[data-sidebar-workspace-header] input[type="text"]') ??
              document.querySelector<HTMLInputElement>('input[class*="searchInput"]')
            if (!hostInput) return
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            setter?.call(hostInput, input.value)
            hostInput.dispatchEvent(new Event('input', { bubbles: true }))
            input.focus()
          })
          input.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return
            input.value = ''
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.blur()
          })
          search.appendChild(input)
          mounted.set('search', search)
        }
        const navParent = navigation.parentElement ?? viewport
        if (search.parentElement !== navParent || search.nextElementSibling !== navigation) {
          navParent.insertBefore(search, navigation)
        }
        const proxy = search.querySelector<HTMLInputElement>('input')
        if (proxy && nativeInput && document.activeElement !== proxy && proxy.value !== nativeInput.value) {
          proxy.value = nativeInput.value
        }
      }

      const dict = DICTIONARIES[language()] ?? DICTIONARIES.en
      const searchPlaceholder = dict.searchPalette.sidebarPlaceholder
      const searchEl = mounted.get('search')
      const searchProxy = searchEl?.querySelector?.<HTMLInputElement>('input')
      if (searchProxy && searchProxy.placeholder !== searchPlaceholder) {
        searchProxy.placeholder = searchPlaceholder
        searchProxy.setAttribute?.('aria-label', dict.ui.searchSessions)
      }

      // Nav items normalization: "\u63d2\u4ef6" -> "\u63d2\u4ef6\u7ba1\u7406", "\u81ea\u52a8\u5316\u4efb\u52a1" -> "\u5b9a\u65f6\u4efb\u52a1", hide "\u66f4\u591a"
      if (navigation && typeof navigation.querySelectorAll === 'function') {
        const navButtons = navigation.querySelectorAll<HTMLButtonElement>('button')
        for (const btn of navButtons) {
          replaceButtonText(btn, '\u63d2\u4ef6', '\u63d2\u4ef6\u7ba1\u7406')
          replaceButtonText(btn, '\u81ea\u52a8\u5316\u4efb\u52a1', '\u5b9a\u65f6\u4efb\u52a1')
          const rawText = btn.textContent?.trim() ?? ''
          const aria = btn.getAttribute?.('aria-label')?.trim() ?? ''
          if (rawText === '\u66f4\u591a' || aria === '\u66f4\u591a' || rawText === 'More' || aria === 'More') {
            const parent = (btn.closest?.('li, [class*="moreAnchor"]') ?? btn.parentElement) as HTMLElement | null
            const target = (parent && parent !== navigation && parent.style) ? parent : (btn.style ? btn : null)
            if (target && target.style) {
              if (!hiddenMoreElements.has(target)) {
                hiddenMoreElements.set(target, target.style.getPropertyValue?.('display') || null)
              }
              target.style.setProperty('display', 'none', 'important')
            }
          }
        }
      }

      // 5. New session button: styled identically to nav items, native icon on left
      let newSession = mounted.get('newSession') as HTMLButtonElement | undefined
      const nativeNew = document.querySelector<HTMLButtonElement>('button[class*="newSession"]:not([data-delta-action]), [class*="wtg9ga_newSession"]:not([data-delta-action])')
      if (nativeNew && (!newSession || !newSession.isConnected)) {
        newSession = document.createElement('button')
        newSession.type = 'button'
        newSession.className = 'dtd-native-new-session'
        newSession.setAttribute('data-delta-action', 'new-session')

        const nativeSvg = nativeNew.querySelector?.('svg')
        if (nativeSvg && typeof nativeSvg.cloneNode === 'function') {
          const clone = nativeSvg.cloneNode(true) as Element
          const existingClass = clone.getAttribute?.('class') ?? ''
          clone.setAttribute?.('class', `${existingClass} dtd-new-session-icon`.trim())
          clone.setAttribute?.('width', '16')
          clone.setAttribute?.('height', '16')
          newSession.appendChild(clone)
        } else {
          const chatSvg = createSvgEl('svg', {
            viewBox: '0 0 24 24',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            class: 'dtd-new-session-icon',
          })
          chatSvg.appendChild(createSvgEl('path', {
            d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
          }))
          newSession.appendChild(chatSvg)
        }

        const labelSpan = document.createElement('span')
        labelSpan.textContent = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.newConversation
        newSession.appendChild(labelSpan)

        newSession.addEventListener('click', () => {
          document.querySelector<HTMLButtonElement>('button[class*="newSession"]:not([data-delta-action]), [class*="wtg9ga_newSession"]:not([data-delta-action])')?.click()
        })
        mounted.set('newSession', newSession)
      }
      if (newSession) {
        const expectedNewLabel = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.newConversation
        const labelSpan = newSession.querySelector?.('span') ?? ((newSession as unknown as { children?: HTMLElement[] }).children?.find?.(c => c.tagName?.toLowerCase?.() === 'span' || (c as unknown as { name?: string }).name === 'span') ?? null)
        if (labelSpan && labelSpan.textContent !== expectedNewLabel) {
          labelSpan.textContent = expectedNewLabel
        }
      }
      const navParent = navigation.parentElement ?? viewport
      if (newSession && (newSession.parentElement !== navParent || newSession.previousElementSibling !== navigation)) {
        navigation.insertAdjacentElement('afterend', newSession)
      }

      processHoverCards()

      // 8, 9, 10. Footer bar: Left Avatar/Logo, Right Action Icons (\u66f4\u65b0\u901a\u77e5, \u8bbe\u7f6e, \u767b\u5f55/\u767b\u51fa)
      const footArea = (viewport.querySelector?.<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]') ??
        document.querySelector<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')) as HTMLElement | null
      if (footArea) {
        const nativeSettingsArea = footArea.querySelector?.<HTMLElement>('[class*="settingsArea"], [class*="wtg9ga_settingsArea"]')
        const triggerRoot = nativeSettingsArea ?? footArea
        const nativeTrigger = (nativeSettingsArea
          ? nativeSettingsArea.querySelector?.<HTMLElement>('[class*="_5Qcc8a_trigger"], [data-signed-out], button[aria-haspopup="menu"], button[class*="user"], button[class*="profile"], button')
          : footArea.querySelector?.<HTMLElement>('[class*="_5Qcc8a_trigger"], [data-signed-out], button[aria-haspopup="menu"], button[class*="user"], button[class*="profile"]')) as HTMLElement | null

        if (nativeTrigger && !boundTriggers.has(nativeTrigger) && typeof nativeTrigger.addEventListener === 'function') {
          boundTriggers.add(nativeTrigger)
          nativeTrigger.classList?.add?.('dtd-native-profile-trigger')
          nativeTrigger.addEventListener('click', (e) => {
            if (isDisposed || canOpenMenuSilently || controller.getSnapshot().mode !== 'delta') return
            e.stopImmediatePropagation?.()
            e.preventDefault?.()
          }, true)
        }

        const signedOutAttr = nativeTrigger?.getAttribute?.('data-signed-out')
        const nativeAvatarSpan = triggerRoot.querySelector?.<HTMLElement>('[data-avatar-status]') ?? null
        const nativeImgs = typeof triggerRoot.querySelectorAll === 'function'
          ? Array.from(triggerRoot.querySelectorAll<HTMLImageElement>('img'))
          : []
        const nativeAvatarImg = nativeImgs.find(img => !img.classList?.contains('dtd-avatar-img') && Boolean(img.getAttribute?.('src') || img.src))
        const avatarSrc = nativeAvatarImg?.getAttribute?.('src') || nativeAvatarImg?.src || ''
        const isSignedIn = signedOutAttr === 'false'
          ? true
          : signedOutAttr === 'true'
            ? false
            : (Boolean(avatarSrc) || Boolean(nativeAvatarSpan))

        // Avatar / Logo box (Item 8) - NEVER reparent React-owned <img>; mirror src onto plugin-owned <img>
        let avatarBox = footArea.querySelector?.<HTMLElement>('.dtd-footer-avatar-box')
        if (!avatarBox) {
          avatarBox = document.createElement('div')
          avatarBox.className = 'dtd-footer-avatar-box'
          footArea.insertBefore(avatarBox, footArea.firstChild ?? null)
        }

        const canShowImg = isSignedIn && Boolean(avatarSrc) && !failedAvatarUrls.has(avatarSrc)
        const desiredAvatarMode = canShowImg ? `img:${avatarSrc}` : (isSignedIn ? 'user' : 'logo')
        if (avatarBox.getAttribute?.('data-avatar-mode') !== desiredAvatarMode) {
          avatarBox.setAttribute('data-avatar-mode', desiredAvatarMode)
          clearNodeChildren(avatarBox)
          if (canShowImg) {
            const img = document.createElement('img') as HTMLImageElement
            img.className = 'dtd-avatar-img'
            img.alt = ''
            img.setAttribute('referrerpolicy', 'no-referrer')
            img.setAttribute('src', avatarSrc)
            img.addEventListener?.('error', () => {
              failedAvatarUrls.add(avatarSrc)
              scheduleSync()
            })
            avatarBox.appendChild(img)
          } else if (isSignedIn) {
            const fallback = document.createElement('div')
            fallback.className = 'dtd-user-avatar-fallback'
            fallback.setAttribute('aria-label', getUiCopy().signedIn)
            const userSvg = createSvgEl('svg', {
              viewBox: '0 0 24 24',
              width: 18,
              height: 18,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            })
            userSvg.appendChild(createSvgEl('path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }))
            userSvg.appendChild(createSvgEl('circle', { cx: 12, cy: 7, r: 4 }))
            fallback.appendChild(userSvg)
            avatarBox.appendChild(fallback)
          } else {
            const harnessLogo = createSvgEl('svg', {
              viewBox: '0 0 24 24',
              width: 18,
              height: 18,
              fill: 'none',
              class: 'dtd-harness-logo',
              'aria-label': 'DeepSeek Harness',
            })
            const whaleGroup = createSvgEl('g', {
              transform: 'translate(12 12) scale(0.92) translate(-157.05 -20.04)',
            })
            whaleGroup.appendChild(createSvgEl('path', {
              d: 'M168.384 12.9517C168.138 12.8317 168.033 13.0607 167.889 13.1767C167.84 13.2142 167.799 13.2632 167.757 13.3082C167.399 13.6912 166.98 13.9427 166.433 13.9127C165.632 13.8677 164.949 14.1192 164.345 14.7312C164.217 13.9767 163.79 13.5262 163.141 13.2372C162.802 13.0872 162.458 12.9367 162.22 12.6102C162.054 12.3776 162.009 12.1186 161.926 11.8631C161.873 11.7091 161.82 11.5516 161.643 11.5251C161.45 11.4951 161.375 11.6566 161.299 11.7916C160.997 12.3436 160.88 12.9517 160.892 13.5677C160.918 14.9532 161.503 16.0568 162.666 16.8418C162.798 16.9318 162.832 17.0218 162.79 17.1533C162.711 17.4238 162.617 17.6863 162.534 17.9568C162.481 18.1293 162.402 18.1673 162.217 18.0918C161.579 17.8253 161.028 17.4308 160.541 16.9543C159.714 16.1548 158.967 15.2722 158.035 14.5812C157.816 14.4197 157.597 14.2697 157.37 14.1267C156.419 13.2032 157.495 12.4446 157.744 12.3546C158.004 12.2606 157.834 11.9376 156.993 11.9416C156.151 11.9451 155.381 12.2271 154.4 12.6027C154.256 12.6592 154.105 12.7002 153.951 12.7342C153.06 12.5652 152.135 12.5277 151.169 12.6367C149.35 12.8392 147.897 13.6992 146.829 15.1672C145.546 16.9318 145.244 18.9368 145.613 21.0279C146.002 23.232 147.127 25.0565 148.855 26.4831C150.648 27.9621 152.713 28.6871 155.068 28.5481C156.499 28.4656 158.091 28.2741 159.888 26.7536C160.341 26.9791 160.816 27.0691 161.605 27.1366C162.212 27.1931 162.797 27.1066 163.25 27.0126C163.96 26.8626 163.911 26.2056 163.654 26.0851C161.575 25.1165 162.031 25.5105 161.616 25.1915C162.673 23.9415 164.287 21.7194 164.785 18.6938C164.834 18.3598 164.896 17.8893 164.889 17.6188C164.885 17.4538 164.923 17.3898 165.111 17.3708C165.632 17.3108 166.138 17.1683 166.603 16.9128C167.95 16.1768 168.494 14.9677 168.622 13.5187C168.641 13.2972 168.618 13.0682 168.384 12.9517ZM156.642 25.9951C154.626 24.4105 153.649 23.889 153.245 23.9115C152.868 23.934 152.936 24.366 153.019 24.6475C153.106 24.9255 153.219 25.117 153.377 25.361C153.487 25.5225 153.562 25.7625 153.268 25.9431C152.619 26.3446 151.49 25.808 151.437 25.7815C150.124 25.008 149.025 23.987 148.251 22.5905C147.504 21.2464 147.07 19.8044 146.998 18.2653C146.979 17.8938 147.089 17.7623 147.459 17.6948C147.946 17.6048 148.448 17.5858 148.934 17.6573C150.992 17.9578 152.743 18.8773 154.211 20.3344C155.049 21.1639 155.683 22.1554 156.336 23.124C157.03 24.1525 157.777 25.1325 158.729 25.9361C159.065 26.2176 159.333 26.4316 159.589 26.5896C158.816 26.6761 157.525 26.6946 156.642 25.9961V25.9951ZM157.608 19.7814C157.608 19.6164 157.74 19.4849 157.906 19.4849C157.943 19.4849 157.977 19.4924 158.008 19.5034C158.049 19.5184 158.087 19.5409 158.117 19.5749C158.17 19.6274 158.2 19.7024 158.2 19.7814C158.2 19.9464 158.068 20.0779 157.902 20.0779C157.736 20.0779 157.608 19.9464 157.608 19.7814ZM160.608 21.3204C160.416 21.3994 160.223 21.4669 160.038 21.4744C159.751 21.4894 159.438 21.3729 159.268 21.2304C159.004 21.0089 158.815 20.8849 158.736 20.4984C158.702 20.3334 158.721 20.0779 158.751 19.9314C158.819 19.6159 158.744 19.4134 158.521 19.2294C158.34 19.0793 158.11 19.0378 157.857 19.0378C157.762 19.0378 157.676 18.9963 157.611 18.9628C157.506 18.9103 157.419 18.7788 157.502 18.6173C157.528 18.5648 157.657 18.4373 157.687 18.4148C158.03 18.2193 158.426 18.2833 158.793 18.4298C159.132 18.5688 159.389 18.8238 159.759 19.1844C160.136 19.6199 160.204 19.7399 160.419 20.0669C160.589 20.3224 160.744 20.5849 160.85 20.8854C160.914 21.0729 160.831 21.2264 160.608 21.3204Z',
              fill: 'currentColor',
            }))
            harnessLogo.appendChild(whaleGroup)
            avatarBox.appendChild(harnessLogo)
          }
        }
        if (desiredAvatarMode === 'user') {
          const fallback = avatarBox.querySelector?.<HTMLElement>('.dtd-user-avatar-fallback')
          const signedInLabel = getUiCopy().signedIn
          if (fallback && fallback.getAttribute?.('aria-label') !== signedInLabel) {
            fallback.setAttribute('aria-label', signedInLabel)
          }
        }

        const triggerNativeSettingsShortcut = (): void => {
          try {
            const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '')
            const ev = new KeyboardEvent('keydown', {
              key: ',',
              code: 'Comma',
              ctrlKey: !isMac,
              metaKey: isMac,
              bubbles: true,
              cancelable: true,
            })
            document.dispatchEvent?.(ev)
            window.dispatchEvent?.(ev)
          } catch {}
        }

        const updateAuthButton = (btn: HTMLButtonElement, isSignedIn: boolean): void => {
          const uiCopy = getUiCopy()
          const label = isSignedIn ? uiCopy.signOut : uiCopy.signIn
          attachTooltipEvents(btn)
          setDeltaTooltip(btn, label, 'top')
          const stateKey = isSignedIn ? '1' : '0'
          if (btn.getAttribute?.('data-signed-in') === stateKey) return
          btn.setAttribute('data-signed-in', stateKey)
          clearNodeChildren(btn)
          const authSvg = createSvgEl('svg', {
            viewBox: '0 0 24 24',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
          if (isSignedIn) {
            authSvg.appendChild(createSvgEl('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }))
            authSvg.appendChild(createSvgEl('polyline', { points: '16 17 21 12 16 7' }))
            authSvg.appendChild(createSvgEl('line', { x1: 21, y1: 12, x2: 9, y2: 12 }))
          } else {
            authSvg.appendChild(createSvgEl('path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' }))
            authSvg.appendChild(createSvgEl('polyline', { points: '10 17 15 12 10 7' }))
            authSvg.appendChild(createSvgEl('line', { x1: 15, y1: 12, x2: 3, y2: 12 }))
          }
          btn.appendChild(authSvg)
        }

        const triggerAccountMenuAction = (kind: 'settings' | 'auth'): void => {
          const liveFoot = document.querySelector?.<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')
          const liveTrigger = (liveFoot?.querySelector?.<HTMLElement>('[class*="_5Qcc8a_trigger"], [data-signed-out], .dtd-native-profile-trigger') ??
            document.querySelector?.<HTMLElement>('.dtd-native-profile-trigger')) as HTMLElement | null

          if (kind === 'settings') {
            const directSettings = document.querySelector?.<HTMLElement>('[data-action="settings"], button[aria-label*="\u8bbe\u7f6e"]:not(.dtd-footer-btn), button[aria-label*="Settings"]:not(.dtd-footer-btn)')
            if (directSettings && directSettings !== liveTrigger) {
              directSettings.click()
              return
            }
          } else {
            const directAuth = document.querySelector?.<HTMLElement>(
              '[data-action="logout"], [data-action="login"], button[aria-label*="\u9000\u51fa\u767b\u5f55"]:not(.dtd-footer-btn), button[aria-label*="\u767b\u5f55"]:not(.dtd-footer-btn), button[aria-label*="Sign " i]:not(.dtd-footer-btn), button[aria-label*="Log " i]:not(.dtd-footer-btn)'
            )
            if (directAuth && directAuth !== liveTrigger) {
              directAuth.click()
              return
            }
          }

          if (!liveTrigger) {
            if (kind === 'settings') {
              triggerNativeSettingsShortcut()
            } else {
              const signedInNow = actionsBox?.querySelector?.('.dtd-btn-auth')?.getAttribute?.('data-signed-in') === '1'
              const uiCopy = getUiCopy()
              showDeltaToast(signedInNow ? uiCopy.signedOut : uiCopy.signInRequired)
            }
            return
          }

          if (silentMenuTimer !== undefined) {
            cancelTimer(silentMenuTimer)
            silentMenuTimer = undefined
          }

          const preExisting = new Set<Element>(
            typeof document.querySelectorAll === 'function'
              ? Array.from(document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] button'))
              : []
          )
          document.body?.setAttribute?.('data-dtd-silent-menu', '1')

          if (liveTrigger.getAttribute?.('aria-expanded') !== 'true') {
            canOpenMenuSilently = true
            try {
              liveTrigger.click()
            } finally {
              canOpenMenuSilently = false
            }
          }

          const findTargetItem = (): HTMLElement | undefined => {
            if (typeof document.querySelectorAll !== 'function') return undefined
            const allItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"], [role="menu"] button'))
            const newItems = allItems.filter(el => !preExisting.has(el))
            const candidates = newItems.length > 0 ? newItems : allItems
            if (candidates.length === 0) return undefined
            if (kind === 'settings') {
              return candidates.find(el => /\u8bbe\u7f6e|Settings/i.test(el.textContent ?? ''))
                ?? candidates.find(el => !/\u53cd\u9988|Feedback|\u9000\u51fa|Sign|Log/i.test(el.textContent ?? ''))
                ?? candidates[0]
            }
            return candidates.find(el => /\u9000\u51fa\u767b\u5f55|\u767b\u5f55|Sign\s*(Out|In)|Log\s*(Out|In)/i.test(el.textContent ?? ''))
              ?? candidates[candidates.length - 1]
          }

          let attempts = 0
          const finishSilent = (): void => {
            silentMenuTimer = undefined
            document.body?.removeAttribute?.('data-dtd-silent-menu')
          }
          const trySelect = (): void => {
            if (isDisposed) {
              finishSilent()
              return
            }
            const item = findTargetItem()
            if (item) {
              item.click()
              finishSilent()
              return
            }
            attempts += 1
            if (attempts >= 24) {
              if (liveTrigger.getAttribute?.('aria-expanded') === 'true') {
                canOpenMenuSilently = true
                try { liveTrigger.click() } finally { canOpenMenuSilently = false }
              }
              finishSilent()
              if (kind === 'settings') {
                triggerNativeSettingsShortcut()
              } else {
                const signedInNow = liveTrigger.getAttribute?.('data-signed-out') === 'false'
                const uiCopy = getUiCopy()
                showDeltaToast(signedInNow ? uiCopy.signOutFromMenu : uiCopy.signInRequired)
              }
              return
            }
            silentMenuTimer = scheduleTimer(trySelect, 10)
          }
          trySelect()
        }

        const HAS_UPDATE_PHASES = new Set(['available', 'downloading', 'verifying', 'installing', 'ready', 'error'])
        const syncUpdateButtonState = (btn: HTMLButtonElement, container: HTMLElement): void => {
          const updateLabel = getUiCopy().updateNotification
          attachTooltipEvents(btn)
          setDeltaTooltip(btn, updateLabel, 'top')
          const nativeUpdateEl = container.querySelector?.<HTMLElement>(
            'button[class*="VUhOWa_indicator"], [class*="VUhOWa_indicator"] button, [class*="footerActions"] button'
          )
          const hasUpdate = (desktopUpdatePhase !== undefined && HAS_UPDATE_PHASES.has(desktopUpdatePhase)) ||
            Boolean(nativeUpdateEl)
          if (hasUpdate) {
            btn.hidden = false
            btn.removeAttribute?.('hidden')
            btn.setAttribute('data-has-update', '1')
          } else {
            if (tooltipAnchor === btn) hideTooltip()
            btn.hidden = true
            btn.setAttribute('hidden', '')
            btn.removeAttribute?.('data-has-update')
          }
        }

        // Right-side 3 action buttons (\u66f4\u65b0\u901a\u77e5 [\u4ec5\u5728\u6709\u66f4\u65b0\u65f6\u663e\u793a], \u8bbe\u7f6e, \u767b\u5f55/\u767b\u51fa)
        let actionsBox = footArea.querySelector?.<HTMLElement>('.dtd-footer-actions')
        if (!actionsBox) {
          actionsBox = document.createElement('div')
          actionsBox.className = 'dtd-footer-actions'

          // 1. \u66f4\u65b0\u901a\u77e5（\u6709\u66f4\u65b0\u65f6\u624d\u663e\u793a）
          const btnUpdate = document.createElement('button')
          btnUpdate.type = 'button'
          btnUpdate.className = 'dtd-footer-btn dtd-btn-update'
          const updateSvg = createSvgEl('svg', {
            viewBox: '0 0 24 24',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
          updateSvg.appendChild(createSvgEl('path', { d: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9' }))
          updateSvg.appendChild(createSvgEl('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' }))
          btnUpdate.appendChild(updateSvg)
          btnUpdate.addEventListener('click', () => {
            if (isUpdateBusy) return
            const dshDesktop = (window as unknown as { dshDesktop?: { updates?: { open?: () => unknown } } }).dshDesktop
            if (typeof dshDesktop?.updates?.open === 'function') {
              isUpdateBusy = true
              try {
                Promise.resolve(dshDesktop.updates.open()).catch(() => {
                  showDeltaToast(getUiCopy().latestVersion)
                }).finally(() => {
                  isUpdateBusy = false
                })
              } catch {
                isUpdateBusy = false
                showDeltaToast(getUiCopy().latestVersion)
              }
              return
            }
            const liveFoot = document.querySelector?.<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')
            const nativeUpdate = liveFoot?.querySelector?.<HTMLElement>('button[class*="VUhOWa_indicator"], [class*="VUhOWa_indicator"] button, button[aria-label*="\u66f4\u65b0"], button[aria-label*="Update" i], button[class*="update" i]')
            if (nativeUpdate && !nativeUpdate.classList?.contains('dtd-footer-btn')) {
              nativeUpdate.click()
            } else {
              showDeltaToast(getUiCopy().latestVersion)
            }
          })
          syncUpdateButtonState(btnUpdate, footArea)

          // 2. \u8bbe\u7f6e
          const btnSettings = document.createElement('button')
          btnSettings.type = 'button'
          btnSettings.className = 'dtd-footer-btn dtd-btn-settings'
          attachTooltipEvents(btnSettings)
          setDeltaTooltip(btnSettings, getUiCopy().settings, 'top')
          const gearSvg = createSvgEl('svg', {
            viewBox: '0 0 24 24',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          })
          gearSvg.appendChild(createSvgEl('path', {
            d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
          }))
          gearSvg.appendChild(createSvgEl('circle', { cx: 12, cy: 12, r: 3 }))
          btnSettings.appendChild(gearSvg)
          btnSettings.addEventListener('click', () => {
            triggerAccountMenuAction('settings')
          })

          // 3. \u767b\u5f55/\u767b\u51fa
          const btnAuth = document.createElement('button')
          btnAuth.type = 'button'
          btnAuth.className = 'dtd-footer-btn dtd-btn-auth'
          updateAuthButton(btnAuth, isSignedIn)
          btnAuth.addEventListener('click', () => {
            triggerAccountMenuAction('auth')
          })

          actionsBox.appendChild(btnUpdate)
          actionsBox.appendChild(btnSettings)
          actionsBox.appendChild(btnAuth)
          footArea.appendChild(actionsBox)
        } else {
          const btnUpdate = actionsBox.querySelector?.<HTMLButtonElement>('.dtd-btn-update')
          if (btnUpdate) syncUpdateButtonState(btnUpdate, footArea)
          const btnSettings = actionsBox.querySelector?.<HTMLButtonElement>('.dtd-btn-settings')
          if (btnSettings) {
            attachTooltipEvents(btnSettings)
            setDeltaTooltip(btnSettings, getUiCopy().settings, 'top')
          }
          const btnAuth = actionsBox.querySelector?.<HTMLButtonElement>('.dtd-btn-auth')
          if (btnAuth) updateAuthButton(btnAuth, isSignedIn)
        }
      }

      // Defense-in-depth: replace any rendered "\u6df1\u5ea6\u6c42\u7d22\u4e2d" with "\u4efb\u52a1\u6267\u884c\u4e2d" inside running status elements
      if (typeof document?.querySelectorAll === 'function') {
        normalizeRunningStatusNodesInDoc()
        syncSettingsNav()
        syncPageHeadings()
        syncMenus()
      }

      syncElasticLayout()
      syncModalPanel()

      const saved = persistedExpansion()
      for (const row of viewport.querySelectorAll<HTMLElement>('[data-row-key^="workspace:"][aria-expanded="true"], [class*="workspace"][aria-expanded="true"]')) {
        const key = row.getAttribute('data-row-key')?.slice('workspace:'.length) ?? ''
        if (!key || initialized.has(key) || saved[key] !== undefined) continue
        initialized.add(key)
        row.click()
      }
    } catch (error) {
      reset()
      console.error('[dsh-delta-desktop] Native compatibility disabled:', error)
    } finally {
      observer?.takeRecords?.()
      isSyncing = false
    }
  }

  observer = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => {
      if (!isDisposed && !isSyncing) {
        if (controller.getSnapshot().mode === 'delta') {
          normalizeRunningStatusNodesInDoc()
          syncMenus()
        } else {
          syncPrivacyDom()
        }
      }
      scheduleSync()
    })
    : undefined
  observer?.observe(document.body ?? root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style'],
  })

  const onMouseOver = (e: Event): void => {
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest?.('[class*="hoverContent"], [class*="SessionHoverContent"], [class*="_card_bgejw"], [data-row-key^="session:"]')) {
      processHoverCards()
    }
  }
  const openUngroupedContextMenu = (x: number, y: number): void => {
    closeUngroupedMenu()
    if (isDisposed || controller.getSnapshot().mode !== 'delta' || typeof document?.body?.appendChild !== 'function') return
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const menu = document.createElement('div')
    menu.className = 'dtd-context-menu'
    menu.setAttribute('role', 'menu')
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'dtd-context-menu-item'
    btn.setAttribute('role', 'menuitem')
    btn.setAttribute('data-danger', '1')
    const trash = createSvgEl('svg', {
      viewBox: '0 0 24 24',
      width: 15,
      height: 15,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    })
    trash.appendChild(createSvgEl('path', { d: 'M3 6h18' }))
    trash.appendChild(createSvgEl('path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }))
    trash.appendChild(createSvgEl('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }))
    const labelSpan = document.createElement('span')
    labelSpan.textContent = copy.sessionMenu.deleteUngrouped
    btn.append(trash, labelSpan)
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation?.()
      closeUngroupedMenu()
      deltaFeatures.openDeleteUngroupedDialog()
    })
    menu.appendChild(btn)
    const vw = typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : 1024
    const vh = typeof window !== 'undefined' && typeof window.innerHeight === 'number' ? window.innerHeight : 768
    const left = Math.max(8, Math.min(vw - 210, Math.round(x)))
    const top = Math.max(8, Math.min(vh - 60, Math.round(y)))
    menu.style?.setProperty?.('left', `${left}px`)
    menu.style?.setProperty?.('top', `${top}px`)
    document.body.appendChild(menu)
    ungroupedMenuEl = menu
  }

  const onPointerDownCapture = (e: Event): void => {
    const rawTarget = e.target as HTMLElement | null
    if (ungroupedMenuEl && (!rawTarget || !ungroupedMenuEl.contains?.(rawTarget))) {
      closeUngroupedMenu()
    }
    const uRow = rawTarget?.closest?.<HTMLElement>('[data-row-key="workspace:"]')
    if (e.type === 'contextmenu' && uRow && !isDisposed && controller.getSnapshot().mode === 'delta') {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      e.stopPropagation?.()
      const me = e as MouseEvent
      openUngroupedContextMenu(me.clientX ?? 24, me.clientY ?? 24)
      return
    }
    const rowEl = rawTarget?.closest?.<HTMLElement>('[data-row-key^="session:"]')
    if (rowEl) {
      const k = rowEl.getAttribute('data-row-key') ?? ''
      if (k.startsWith('session:')) lastMenuSessionId = k.slice(8)
    }
    onSplitterPointerDown(e)
    if (!(e as PointerEvent).defaultPrevented) {
      onModalPointerDown(e)
    }
  }
  const onMenuClickCapture = (e: Event): void => {
    const target = e.target as HTMLElement | null
    if (!target) return
    const menuItem = target.closest?.<HTMLElement>('[role="menuitem"]')
    if (!menuItem || !lastMenuSessionId || !deltaFeatures.isLocked(lastMenuSessionId)) return
    const label = getMenuLabel(menuItem)
    if (LOCKED_UNARCHIVE_LABELS.has(label)) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      e.stopPropagation?.()
      deltaFeatures.openUnlockPinDialog(lastMenuSessionId)
      return
    }
    if (LOCKED_MUTATION_LABELS.has(label)) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      e.stopPropagation?.()
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      showDeltaToast(copy.sessionMenu.unlockFirst)
    }
  }
  const onComposerGuardKeyDown = (e: Event): void => {
    const ke = e as KeyboardEvent
    if (ke.key === 'Escape' && ungroupedMenuEl) {
      closeUngroupedMenu()
    }
    const activeSid = deltaFeatures.getActiveSessionId()
    if (!activeSid || !deltaFeatures.isProtectedView(activeSid)) return
    const t = e.target as HTMLElement | null
    if (!t?.closest?.('[class*="mP3x-q_centerCol"]')) return
    if (ke.key === 'Enter' && !ke.shiftKey) {
      e.preventDefault?.()
      ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
    }
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('mouseover', onMouseOver, { capture: true, passive: true })
    document.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
    document.addEventListener('contextmenu', onPointerDownCapture, { capture: true })
    document.addEventListener('click', onMenuClickCapture, { capture: true })
    document.addEventListener('keydown', onComposerGuardKeyDown, { capture: true })
    document.addEventListener('dblclick', onModalDblClick, { capture: true })
  }

  try {
    const updates = (window as unknown as {
      dshDesktop?: {
        updates?: {
          status?: () => Promise<{ phase?: string } | undefined>
          subscribe?: (cb: (p?: { phase?: string }) => void) => () => void
        }
      }
    }).dshDesktop?.updates
    if (updates && typeof updates.subscribe === 'function') {
      stopDesktopUpdates = updates.subscribe((presentation) => {
        if (isDisposed) return
        desktopUpdatePhase = presentation?.phase
        scheduleSync()
      })
    }
    if (updates && typeof updates.status === 'function') {
      Promise.resolve(updates.status()).then((presentation) => {
        if (isDisposed || desktopUpdatePhase !== undefined) return
        desktopUpdatePhase = presentation?.phase
        scheduleSync()
      }, () => {})
    }
  } catch { /* dshDesktop.updates is optional */ }

  const stopFeaturesSync = deltaFeatures.subscribe(() => scheduleSync())
  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    isDisposed = true
    frameScheduler.cancel()
    stopDesktopUpdates?.()
    stopDesktopUpdates = undefined
    stopFeaturesSync()
    unsubscribe()
    observer?.disconnect()
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('mouseover', onMouseOver, { capture: true })
      document.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
      document.removeEventListener('contextmenu', onPointerDownCapture, { capture: true })
      document.removeEventListener('click', onMenuClickCapture, { capture: true })
      document.removeEventListener('keydown', onComposerGuardKeyDown, { capture: true })
      document.removeEventListener('dblclick', onModalDblClick, { capture: true })
    }
    reset()
    restoreHiddenNodes('data-dtd-hidden-session-log', hiddenSessionLogNodes)
    restoreHiddenNodes('data-dtd-hidden-privacy-cmd', hiddenPrivacyCmdNodes)
    restoreHiddenNodes('data-dtd-hidden-settings-row', hiddenSettingsRows)
    restoreHiddenNodes('data-dtd-hidden-sole-workspace', hiddenSoleWorkspaceNodes)
    restoreHiddenNodes('data-dtd-hidden-deleted', hiddenDeletedRows)
    restoreHiddenNodes('data-dtd-hidden-empty-ungrouped', hiddenEmptyUngroupedNodes)
    closeUngroupedMenu()
    cleanupCollapsibleErrors()
    deltaFeatures.resetSessionOverlays()
  }
}

/**
 * A plugin-owned search control inside the published sidebar scrollport.
 * It calls Harness Session Controller and UiWorkspace services directly if present.
 */
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
 * Plugin-owned multi-dimension search inside the sidebar scrollport + centered Command Search Palette.
 * Searches sessions (titles + in-memory Host content), workspaces, plugins, skills/commands, shortcuts, and quick actions.
 */
function installHostSearch(
  controller: DeltaController & { toggleSidebarSafe?(): boolean; toggleRightbarSafe?(): boolean },
  sessions: SearchSessionsApi,
  navigation: SearchNavigationApi,
  searchScope?: ClientContext,
): () => void {
  const root = document.documentElement
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
  kbdHint.textContent = isDarwin ? '⌘K' : initialCopy.searchPalette.triggerHint

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

  let backdropEl: HTMLElement | undefined
  let modalEl: HTMLElement | undefined
  let modalInputEl: HTMLInputElement | undefined
  let modalClearBtn: HTMLButtonElement | undefined
  let modalTabsEl: HTMLElement | undefined
  let modalListEl: HTMLElement | undefined

  const active = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
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

  const dispatchContentSearch = (
    query: string,
    signal: AbortSignal,
    onDone: (res: { items: HostContentHit[]; ok: boolean; fromDisabledOnly?: boolean }) => void,
  ): void => {
    const queryLegacy = (): void => {
      void sessions.search(query, signal).then(
        fallback => {
          if (fallback.ok) {
            onDone({
              items: (fallback.value?.items ?? []).map(item => ({
                sessionId: item.sessionId,
                snippet: item.snippet,
              })),
              ok: true,
            })
            return
          }
          const errMsg = fallback.error?.message ?? ''
          onDone(/DISABLED|UNAVAILABLE/i.test(errMsg) ? { items: [], ok: true, fromDisabledOnly: true } : { items: [], ok: false })
        },
        reason => {
          if (signal.aborted) return
          console.warn('[dsh-delta-desktop] native Session search failed', reason)
          onDone({ items: [], ok: false })
        },
      )
    }

    if (!canQueryHostSearchHttp()) {
      queryLegacy()
      return
    }
    void fetch('/api/delta-desktop/session-search?q=' + encodeURIComponent(query) + '&limit=30', {
      method: 'GET',
      credentials: 'same-origin',
      signal,
    }).then(
      async res => {
        if (res.ok) {
          const data = (await res.json()) as { items?: HostContentHit[] }
          if (Array.isArray(data?.items)) {
            onDone({ items: data.items, ok: true })
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
    if (deltaFeatures.isLocked(sessionId)) {
      const ws = searchScope?.get?.('workspaces') as WorkspacesApi | undefined
      const archived = ws?.list?.getSnapshot?.()?.archivedSessionIds?.includes(sessionId) ?? false
      if (archived || deltaFeatures.isProtectedView(sessionId)) {
        deltaFeatures.openUnlockPinDialog(sessionId)
        return
      }
    }
    stopRevealTimer?.()
    stopRevealTimer = undefined
    try {
      if (workspaceId) navigation.openSession(sessionId, { workspaceId })
      else navigation.openSession(sessionId)
      stopRevealTimer = revealSessionTurnInChat(turn, snippet)
    } catch (reason) {
      console.warn('[dsh-delta-desktop] native Session navigation failed', reason)
    }
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
    const query = input.value.trim().toLocaleLowerCase()
    if (!query || !active()) { results.hidden = true; return }
    results.hidden = false
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    const pal = (DICTIONARIES[language()] ?? DICTIONARIES.en).searchPalette
    const seen = new Set<string>()
    const matches: { id: string; title: string; snippet?: string; turn?: number; workspaceId?: string; isWorkspace?: boolean }[] = []

    for (const item of Object.values(sessions.list.getSnapshot().byId)) {
      const title = item.title?.trim() ?? ''
      if (!item.blank && title.toLocaleLowerCase().includes(query)) {
        matches.push({ id: item.id, title: redactSensitiveText(title), workspaceId: item.workspaceId })
        seen.add(item.id)
      }
      if (matches.length >= 20) break
    }
    for (const item of inlineRemoteItems) {
      if (seen.has(item.sessionId) || matches.length >= 20) continue
      const title = item.title?.trim() || sessions.list.getSnapshot().byId[item.sessionId]?.title?.trim() || item.sessionId
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
        try {
          if (match.isWorkspace && match.workspaceId) {
            const ws = getWorkspaces().find(w => w.workspaceId === match.workspaceId)
            const targetSid = ws?.sessionIds?.[0]
            if (targetSid) openSessionHit(targetSid, match.workspaceId)
            else navigation.startSession(match.workspaceId)
          } else {
            openSessionHit(match.id, match.workspaceId, match.turn, match.snippet)
          }
          input.value = ''
          clearInlineRequest()
          inlineRemoteItems = []
          renderInline()
        } catch (reason) {
          console.warn('[dsh-delta-desktop] native Session navigation failed', reason)
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
          if (!active() || inlineSerial !== requestId || aborter.signal.aborted) return
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
  const clickSidebarNavTarget = (labels: string[], fallbackAction?: () => void): void => {
    try {
      const buttons = document.querySelectorAll?.<HTMLButtonElement>('[data-sidebar-scrollport] nav button, [class*="wtg9ga_root"] nav button, [class*="wtg9ga_panelList"] button')
      if (buttons) {
        for (const btn of buttons) {
          const text = (btn.textContent ?? btn.getAttribute('aria-label') ?? '').trim()
          if (labels.includes(text)) {
            btn.click()
            return
          }
        }
      }
    } catch {}
    fallbackAction?.()
  }

  const clickSettingsTrigger = (): void => {
    try {
      const btn = document.querySelector?.<HTMLButtonElement>('[data-dtd-settings], .dtd-btn-settings, [aria-label="\u8bbe\u7f6e"], [aria-label="Settings"]')
      btn?.click()
    } catch {}
  }

  const insertSlashCommand = (commandName: string): void => {
    try {
      controller.openConversation()
      const editor = document.querySelector?.<HTMLElement>('[data-lexical-editor="true"], [data-composer-input] [contenteditable="true"], textarea, [contenteditable="true"]')
      if (!editor) return
      editor.focus?.()
      if ('value' in editor && typeof (editor as HTMLTextAreaElement).value === 'string') {
        const ta = editor as HTMLTextAreaElement
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
        setter?.call(ta, commandName + ' ')
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        return
      }
      if (typeof document.execCommand === 'function') {
        document.execCommand('insertText', false, commandName + ' ')
      } else {
        editor.textContent = commandName + ' '
        editor.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } catch {}
  }

  const getShortcutsService = (): {
    catalog?: { getSnapshot?: () => ReadonlyArray<{ id?: string; label?: string; keys?: readonly string[]; aliases?: readonly string[] }> }
    registry?: {
      dispatch?: (gesture: Record<string, unknown>, context: unknown, consume: () => void) => unknown
      invoke?: (id: string, context: unknown) => unknown
    }
  } | undefined => {
    try {
      return (searchScope?.get?.('shortcuts') ?? (searchScope as unknown as { shortcuts?: unknown })?.shortcuts) as any
    } catch {
      return undefined
    }
  }

  const buildDynamicCatalog = async (): Promise<{ plugins: PaletteItem[]; skills: PaletteItem[]; shortcuts: PaletteItem[] }> => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const plugins: PaletteItem[] = []
    const skills: PaletteItem[] = []
    const shortcuts: PaletteItem[] = []

    const remote = (searchScope?.get?.('remote') ?? (searchScope as unknown as { remote?: unknown })?.remote) as {
      pluginInventory?: { list?: () => Promise<unknown> }
      pluginManager?: { listPlugins?: () => Promise<unknown>; listBundles?: () => Promise<unknown> }
      skills?: { list?: () => Promise<unknown> }
      commands?: { list?: (sessionId: string) => Promise<{ ok?: boolean; value?: Array<{ name?: string; description?: string }> }> }
    } | undefined

    try {
      const rawPlugins = (await remote?.pluginInventory?.list?.())
        ?? (await remote?.pluginManager?.listPlugins?.())
        ?? (await remote?.pluginManager?.listBundles?.())
      const list = Array.isArray(rawPlugins)
        ? rawPlugins
        : ((rawPlugins as { items?: unknown[]; plugins?: unknown[]; bundles?: unknown[] })?.items
          ?? (rawPlugins as { plugins?: unknown[]; bundles?: unknown[] })?.plugins
          ?? (rawPlugins as { bundles?: unknown[] })?.bundles
          ?? [])
      for (const entry of list as Array<{ id?: string; name?: string; title?: string; description?: string; enabled?: boolean }>) {
        const pid = entry?.id || entry?.name
        if (!pid) continue
        const title = entry.title || entry.name || pid
        plugins.push({
          id: 'plugin:' + pid,
          tab: 'plugin',
          kind: 'plugin',
          title: redactSensitiveText(title),
          snippet: entry.description ? redactSensitiveText(entry.description) : undefined,
          badge: pCopy.kindPlugin,
          meta: pid !== title ? pid : undefined,
          score: 55,
          keywords: `${pid} ${title} ${entry.description ?? ''}`,
          run: () => clickSidebarNavTarget(['\u63d2\u4ef6\u7ba1\u7406', '\u63d2\u4ef6', 'Plugins']),
        })
      }
    } catch {}

    // Safe built-in & live slash commands (strictly exclude /export & /feedback per privacy rules)
    const safeBuiltins: Array<{ cmd: string; descZh: string; descEn: string }> = [
      { cmd: '/plan', descZh: '\u5236\u5b9a\u4efb\u52a1\u6267\u884c\u8ba1\u5212\u540e\u518d\u4fee\u6539\u4ee3\u7801', descEn: 'Create a structured execution plan' },
      { cmd: '/goal', descZh: '\u8bbe\u5b9a\u6301\u7eed\u8fbe\u6807\u76ee\u6807，\u76f4\u5230\u5b8c\u6210\u4e3a\u6b62', descEn: 'Run toward a goal until verified' },
      { cmd: '/compact', descZh: '\u538b\u7f29\u5e76\u7cbe\u7b80\u5f53\u524d\u4f1a\u8bdd\u4e0a\u4e0b\u6587', descEn: 'Compact current conversation context' },
      { cmd: '/schedule', descZh: '\u521b\u5efa\u5b9a\u65f6\u6216\u81ea\u52a8\u5316\u5468\u671f\u4efb\u52a1', descEn: 'Create a recurring or scheduled task' },
      { cmd: '/browser', descZh: '\u8c03\u7528\u5185\u7f6e\u6d4f\u89c8\u5668\u4ea4\u4e92\u4e0e\u68c0\u7d22', descEn: 'Interact with web applications via browser' },
      { cmd: '/boost', descZh: '\u6df1\u5ea6\u89c4\u5212\u4e0e\u591a\u7ef4\u5ea6\u4e25\u683c\u9a8c\u8bc1', descEn: 'Deep thinking and rigorous verification' },
    ]
    const seenCmds = new Set<string>()
    for (const c of safeBuiltins) {
      seenCmds.add(c.cmd.toLowerCase())
      skills.push({
        id: 'cmd:' + c.cmd,
        tab: 'skill',
        kind: 'command',
        title: c.cmd,
        snippet: language() === 'zh' ? c.descZh : c.descEn,
        badge: pCopy.kindCommand,
        score: 52,
        keywords: `${c.cmd} ${c.descZh} ${c.descEn}`,
        run: () => insertSlashCommand(c.cmd),
      })
    }

    try {
      const targetSid = deltaFeatures.getActiveSessionId() ?? Object.keys(sessions.list.getSnapshot().byId)[0]
      if (targetSid && remote?.commands?.list) {
        const res = await remote.commands.list(targetSid)
        if (res?.ok && Array.isArray(res.value)) {
          for (const item of res.value) {
            const rawName = item?.name?.trim() ?? ''
            if (!rawName) continue
            const cmdName = rawName.startsWith('/') ? rawName : '/' + rawName
            if (/^\/(?:export|feedback)$/i.test(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
            seenCmds.add(cmdName.toLowerCase())
            skills.push({
              id: 'skill:' + cmdName,
              tab: 'skill',
              kind: 'skill',
              title: cmdName,
              snippet: item.description ? redactSensitiveText(item.description) : undefined,
              badge: pCopy.kindSkill,
              score: 58,
              keywords: `${cmdName} ${item.description ?? ''}`,
              run: () => insertSlashCommand(cmdName),
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
        if (/^\/(?:export|feedback)$/i.test(cmdName) || seenCmds.has(cmdName.toLowerCase())) continue
        seenCmds.add(cmdName.toLowerCase())
        skills.push({
          id: 'skill:' + cmdName,
          tab: 'skill',
          kind: 'skill',
          title: cmdName,
          snippet: s.description ? redactSensitiveText(s.description) : undefined,
          badge: pCopy.kindSkill,
          score: 57,
          keywords: `${cmdName} ${s.description ?? ''}`,
          run: () => insertSlashCommand(cmdName),
        })
      }
    } catch {}

    // Live DSH shortcuts catalog + right sidebar guide entries + core shortcuts
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
        if (!id || !label) continue
        const keysStr = Array.isArray(row.keys) ? row.keys.join(' + ') : ''
        pushShortcut(id, redactSensitiveText(label), keysStr, () => {
          if (id === 'session.search') openPalette('')
          else if (id === 'sidebar.left.toggle') controller.toggleSidebarSafe?.() ?? controller.toggleSidebar()
          else if (id === 'sidebar.right.toggle') controller.toggleRightbarSafe?.()
          else if (id === 'settings.open') clickSettingsTrigger()
          else if (id === 'session.new') navigation.startSession()
          else getShortcutsService()?.registry?.invoke?.(id, { region: 'page', modal: null, target: null })
        })
      }
    } catch {}
    try {
      const guideNodes = document.querySelectorAll?.<HTMLElement>('[data-sidebar-right-guide-entry]')
      if (guideNodes) {
        guideNodes.forEach((node, idx) => {
          const textNode = node.querySelector?.<HTMLElement>('[class*="entryText"], [class*="4GESq_text"]')
          const keysNode = node.querySelector?.<HTMLElement>('[class*="_keys_"], [class*="4GESq_shortcut"]')
          const label = (textNode?.textContent ?? node.textContent ?? '').trim().split('\n')[0]?.trim()
          const keys = (keysNode?.textContent ?? '').trim()
          if (label) {
            pushShortcut(`guide-${idx}`, label, keys || '', () => node.click?.())
          }
        })
      }
    } catch {}
    pushShortcut('search', language() === 'zh' ? '\u5168\u5c40\u641c\u7d22\u547d\u4ee4\u9762\u677f' : 'Global Command Search', isDarwin ? '⌘ + K' : 'Ctrl + K', () => openPalette(''))
    pushShortcut('files', language() === 'zh' ? '\u5de5\u4f5c\u533a\u6587\u4ef6' : 'Workspace Files', isDarwin ? '⌘ + P' : 'Ctrl + P', () => controller.toggleRightbarSafe?.())
    pushShortcut('browser', language() === 'zh' ? '\u5185\u7f6e\u6d4f\u89c8\u5668' : 'Built-in Browser', isDarwin ? '⌘ + T' : 'Ctrl + T', () => controller.toggleRightbarSafe?.())

    return { plugins, skills, shortcuts }
  }

  const collectPaletteItems = (query: string, hostHits: HostContentHit[]): PaletteItem[] => {
    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
    const pCopy = copy.searchPalette
    const q = query.trim().toLowerCase()
    const terms = q ? q.split(/\s+/).filter(Boolean).slice(0, 6) : []
    const items: PaletteItem[] = []
    const wsList = getWorkspaces()
    const wsById = new Map(wsList.map(w => [w.workspaceId, w]))

    const matchText = (text: string): boolean => {
      if (terms.length === 0) return true
      const lower = text.toLowerCase()
      return terms.every(t => lower.includes(t))
    }

    // 1. Sessions (titles + host in-memory message content hits)
    const allSessions = Object.values(sessions.list.getSnapshot().byId)
      .filter(s => !s.blank)
      .sort((a, b) => normalizeSearchTime(b.updatedAt) - normalizeSearchTime(a.updatedAt))

    const contentHitsBySession = new Map<string, HostContentHit>()
    for (const hit of hostHits) {
      if (!contentHitsBySession.has(hit.sessionId)) {
        contentHitsBySession.set(hit.sessionId, hit)
      }
      const sess = sessions.list.getSnapshot().byId[hit.sessionId]
      const rawTitle = hit.title?.trim() || sess?.title?.trim() || hit.sessionId
      if (deltaFeatures.isDeleted(hit.sessionId)) continue
      const wsId = hit.workspaceId ?? sess?.workspaceId
      const ws = wsId ? wsById.get(wsId) : undefined
      const roleLabel = hit.role === 'user' ? pCopy.roleUser : hit.role === 'assistant' ? pCopy.roleAssistant : ''
      const turnText = hit.turn ? pCopy.turnLabel.replace('{turn}', String(hit.turn)) : ''
      const metaParts = [roleLabel, turnText, ws?.title].filter(Boolean)
      const locked = deltaFeatures.isLocked(hit.sessionId)
      items.push({
        id: `hit:${hit.sessionId}:${hit.seq ?? hit.turn ?? 'c'}`,
        tab: 'session',
        kind: 'content',
        title: redactSensitiveText(rawTitle),
        snippet: locked ? copy.sessionMenu.lockedShieldTitle : redactSensitiveText(hit.snippet),
        badge: pCopy.kindContent,
        meta: metaParts.join(' · ') || undefined,
        score: (hit.score ?? 100) + 20,
        run: () => openSessionHit(hit.sessionId, wsId, hit.turn, locked ? undefined : hit.snippet),
      })
    }

    for (const s of allSessions) {
      if (deltaFeatures.isDeleted(s.id)) continue
      const title = redactSensitiveText(s.title?.trim() || s.id)
      const ws = s.workspaceId ? wsById.get(s.workspaceId) : undefined
      const wsLabel = ws ? (ws.title || redactPathForUi(ws.path)) : ''
      const searchable = `${title} ${s.id} ${wsLabel}`
      if (!matchText(searchable)) continue
      if (q && contentHitsBySession.has(s.id) && title.toLowerCase() === (contentHitsBySession.get(s.id)?.title ?? '').toLowerCase()) {
        continue
      }
      const isPrefix = q ? title.toLowerCase().startsWith(q) : false
      const locked = deltaFeatures.isLocked(s.id)
      const isArchived = Boolean(s.archived || locked)
      items.push({
        id: 'sess:' + s.id,
        tab: 'session',
        kind: 'session',
        title,
        snippet: wsLabel || redactPathForUi(ws?.path ?? ''),
        badge: pCopy.kindSession,
        meta: locked
          ? (language() === 'zh' ? '\u5df2\u9501\u5b9a · \u5df2\u5f52\u6863' : 'Locked · Archived')
          : isArchived ? (language() === 'zh' ? '\u5df2\u5f52\u6863' : 'Archived') : undefined,
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
        meta: ws.sessionIds ? `${ws.sessionIds.length}` : undefined,
        score: q ? 85 : 50,
        run: () => {
          const sid = ws.sessionIds?.[0]
          if (sid) openSessionHit(sid, ws.workspaceId)
          else navigation.startSession(ws.workspaceId)
        },
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
        keywords: `new conversation chat start \u65b0\u5efa \u5bf9\u8bdd \u5f00\u59cb\u5bf9\u8bdd`,
        run: () => navigation.startSession(),
      },
      {
        id: 'act:plugins',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionPlugins,
        badge: pCopy.kindAction,
        score: 44,
        keywords: `plugins manager \u63d2\u4ef6 \u63d2\u4ef6\u7ba1\u7406`,
        run: () => clickSidebarNavTarget(['\u63d2\u4ef6\u7ba1\u7406', '\u63d2\u4ef6', 'Plugins']),
      },
      {
        id: 'act:schedules',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionSchedules,
        badge: pCopy.kindAction,
        score: 43,
        keywords: `schedules tasks cron \u5b9a\u65f6\u4efb\u52a1 \u81ea\u52a8\u5316\u4efb\u52a1`,
        run: () => clickSidebarNavTarget(['\u5b9a\u65f6\u4efb\u52a1', '\u81ea\u52a8\u5316\u4efb\u52a1', 'Schedules', 'Tasks']),
      },
      {
        id: 'act:settings',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionSettings,
        badge: pCopy.kindAction,
        score: 42,
        keywords: `settings privacy personalization theme proxy network pin \u8bbe\u7f6e \u9690\u79c1 \u4e2a\u6027\u8bbe\u7f6e \u4e3b\u9898 \u4ee3\u7406 \u7f51\u7edc \u9501\u5b9a`,
        run: () => clickSettingsTrigger(),
      },
      {
        id: 'act:sidebar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleSidebar,
        badge: pCopy.kindAction,
        score: 41,
        keywords: `toggle sidebar left \u4fa7\u8fb9\u680f \u6536\u8d77 \u5c55\u5f00`,
        run: () => controller.toggleSidebarSafe?.() ?? controller.toggleSidebar(),
      },
      {
        id: 'act:rightbar',
        tab: 'action',
        kind: 'action',
        title: pCopy.actionToggleRightbar,
        badge: pCopy.kindAction,
        score: 40,
        keywords: `toggle rightbar right \u53f3\u4fa7\u8fb9\u680f \u5de5\u5177`,
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
    clearModalRequest()
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
    syncModalChromeOverlay()
  }

  const executePaletteItem = (item: PaletteItem | undefined): void => {
    if (!item) return
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

  const openPalette = (seedQuery = ''): void => {
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
    activeTab = 'all'
    activeIndex = 0
    syncModalChromeOverlay()
    if (modalInputEl) {
      modalInputEl.value = seedQuery
      modalInputEl.focus?.()
      modalInputEl.select?.()
    }
    triggerModalSearch(seedQuery)
    void buildDynamicCatalog().then(cat => {
      if (!isModalOpen || isDisposed) return
      cachedCatalog = cat
      renderPalette()
    })
  }

  // Sidebar search stays inline while typing; only Enter in the input or Ctrl/Cmd+K opens the full Search Palette modal
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

  const onGlobalKeyDown = (e: Event): void => {
    if (isDisposed || controller.getSnapshot().mode !== 'delta') return
    const ke = e as KeyboardEvent
    const isCmdK = (ke.ctrlKey || ke.metaKey) && !ke.altKey && !ke.shiftKey &&
      (ke.key === 'k' || ke.key === 'K' || ke.code === 'KeyK')
    if (isCmdK) {
      ke.preventDefault?.()
      ;(ke as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      ke.stopPropagation?.()
      if (isModalOpen) closePalette()
      else openPalette(input.value)
    } else if (isModalOpen && ke.key === 'Escape') {
      ke.preventDefault?.()
      ;(ke as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      ke.stopPropagation?.()
      closePalette()
    }
  }
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', onGlobalKeyDown, { capture: true })
  } else if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', onGlobalKeyDown, { capture: true })
  }

  // Intercept Electron Desktop native Ctrl/Cmd+K ("session.search") routed through ShortcutsService
  let restoreShortcutHooks: (() => void) | undefined
  try {
    const reg = getShortcutsService()?.registry as any
    if (reg && typeof reg.dispatch === 'function' && !reg.__deltaSearchHooked) {
      const origDispatch = reg.dispatch
      const origInvoke = typeof reg.invoke === 'function' ? reg.invoke : undefined
      reg.__deltaSearchHooked = true
      reg.dispatch = function(this: any, gesture: Record<string, unknown>, context: unknown, consume: () => void) {
        if (!isDisposed && controller.getSnapshot().mode === 'delta' &&
            (gesture?.control || gesture?.meta) && !gesture?.alt && !gesture?.shift && gesture?.code === 'KeyK') {
          consume?.()
          if (!gesture?.repeat) {
            if (isModalOpen) closePalette()
            else openPalette(input.value)
          }
          return { status: 'handled', commandId: 'session.search' }
        }
        return origDispatch.apply(this, arguments)
      }
      if (origInvoke) {
        reg.invoke = function(this: any, id: string) {
          if (!isDisposed && controller.getSnapshot().mode === 'delta' && id === 'session.search') {
            if (isModalOpen) closePalette()
            else openPalette(input.value)
            return
          }
          return origInvoke.apply(this, arguments)
        }
      }
      restoreShortcutHooks = () => {
        if (reg.dispatch !== origDispatch) reg.dispatch = origDispatch
        if (origInvoke && reg.invoke !== origInvoke) reg.invoke = origInvoke
        delete reg.__deltaSearchHooked
      }
    }
  } catch {}

  let observer: MutationObserver | undefined
  const frameScheduler = createFrameScheduler(() => sync())
  const scheduleSync = (): void => {
    if (!isDisposed) frameScheduler.schedule()
  }
  const sync = (): void => {
    if (isDisposed) return
    try {
      syncSidebarLabels()
      if (controller.getSnapshot().mode !== 'delta') {
        clearInlineRequest()
        closePalette()
        if (shell.parentElement) shell.remove()
        if (root.getAttribute('data-delta-search-adapter') !== null) root.removeAttribute('data-delta-search-adapter')
        return
      }
      const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]') ??
        document.querySelector<HTMLElement>('[class*="wtg9ga_root"]') ??
        document.querySelector<HTMLElement>('[class*="SidebarRoot_root"]') ??
        document.querySelector<HTMLElement>('nav')?.parentElement ?? null
      const navigationRow = viewport?.querySelector?.('nav') ?? document.querySelector?.('nav') ?? null
      const navParent = navigationRow?.parentElement ?? viewport
      if (!viewport || !navParent || !navigationRow) {
        if (shell.parentElement) shell.remove()
        if (root.getAttribute('data-delta-search-adapter') !== 'waiting-for-sidebar') {
          root.setAttribute('data-delta-search-adapter', 'waiting-for-sidebar')
        }
        return
      }
      const staleNative = navParent.querySelector?.<HTMLElement>('.dtd-native-search')
      if (staleNative && staleNative !== shell) staleNative.remove?.()
      if (shell.parentElement !== navParent || shell.nextElementSibling !== navigationRow) {
        navParent.insertBefore(shell, navigationRow)
      }
      if (root.getAttribute('data-delta-search-adapter') !== 'active') {
        root.setAttribute('data-delta-search-adapter', 'active')
      }
    } finally {
      observer?.takeRecords?.()
    }
  }
  observer = new MutationObserver(scheduleSync)
  observer.observe(document.body ?? root, { subtree: true, childList: true })
  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    restoreShortcutHooks?.()
    restoreShortcutHooks = undefined
    frameScheduler.cancel()
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', onGlobalKeyDown, { capture: true })
    } else if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', onGlobalKeyDown, { capture: true })
    }
    stopRevealTimer?.()
    closePalette()
    clearInlineRequest()
    unsubscribe()
    observer.disconnect()
    shell.remove()
    root.removeAttribute('data-delta-search-adapter')
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
    function SessionHoverDetail({ sessionId }: SessionHoverProps): unknown {
      const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const label = copy.ui.sessionId
      return el('div', { className: 'dtd-session-meta', 'aria-hidden': true, hidden: true, style: { display: 'none' } },
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
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, copy.ui.unavailable) : null)
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
                    document.body?.setAttribute('data-delta-ui', 'delta')
                  } else {
                    document.documentElement.removeAttribute('data-delta-ui')
                    document.body?.removeAttribute('data-delta-ui')
                  }
                }
                syncAppearance()
                deltaFeatures.ensureLoaded()
                const stopAppearance = controller.subscribe(syncAppearance)
                const stopPrivacyGuards = installClientPrivacyGuards()
                const stopCompat = installSidebarCompatibility(controller)

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
                  stopCompat()
                  stopPrivacyGuards()
                  clearDeltaToasts()
                  document.documentElement.removeAttribute('data-delta-ui')
                  document.body?.removeAttribute('data-delta-ui')
                  syncModalChromeOverlay()
                  tag.parentNode?.removeChild(tag)
                  controller.dispose()
                }
              }, 'dsh-delta-desktop: personalization resource ownership')

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
              }, props => controller.getSnapshot().mode === 'delta' ? SessionHoverDetail(props) : null))

              const installProjectedList = <S>(
                listObj: { getSnapshot?: () => S; subscribe?: (listener: () => void) => () => void; invalidate?: (immediate?: boolean) => void; set?: (next: S) => void } | undefined,
                projectFn: (base: S) => S,
              ): (() => void) => {
                if (!listObj || typeof listObj.getSnapshot !== 'function') return () => {}
                const origSnap = listObj.getSnapshot
                const origSub = listObj.subscribe
                const origInvalidate = typeof listObj.invalidate === 'function' ? listObj.invalidate : undefined
                const origSet = typeof listObj.set === 'function' ? listObj.set : undefined
                const projectedSnap = (): S => projectFn(origSnap.call(listObj))
                let isRefreshingNative = false
                try {
                  listObj.getSnapshot = projectedSnap
                  const wrappedListeners = new Set<() => void>()
                  const unsubNotify = deltaFeatures.onDataMutate(() => {
                    if (isRefreshingNative) return
                    isRefreshingNative = true
                    try {
                      wrappedListeners.forEach(fn => { try { fn() } catch {} })
                      if (origInvalidate) {
                        try { origInvalidate.call(listObj, true) } catch {}
                      } else if (origSet) {
                        try {
                          const baseVal = origSnap.call(listObj)
                          if (baseVal && typeof baseVal === 'object') origSet.call(listObj, { ...(baseVal as object) } as S)
                        } catch {}
                      }
                    } finally {
                      isRefreshingNative = false
                    }
                  })
                  if (typeof origSub === 'function') {
                    listObj.subscribe = (listener: () => void) => {
                      wrappedListeners.add(listener)
                      const stopOrig = origSub.call(listObj, listener)
                      return () => {
                        wrappedListeners.delete(listener)
                        stopOrig?.()
                      }
                    }
                  }
                  return () => {
                    unsubNotify?.()
                    if (listObj.getSnapshot === projectedSnap) listObj.getSnapshot = origSnap
                    if (origSub && listObj.subscribe !== origSub) listObj.subscribe = origSub
                  }
                } catch {
                  return () => {}
                }
              }

              // Guard Host workspace mutations, register session move/lock/delete menus, and project durable session changes.
              scope.inject(['workspaces'], workspaceScope => {
                const workspaces = workspaceScope.workspaces
                if (!workspaces) return

                let cachedBaseSnap: WorkspaceSnapshot | undefined
                let cachedRev = -1
                let cachedProjected: WorkspaceSnapshot | undefined
                const stopWsProjection = installProjectedList<WorkspaceSnapshot>(workspaces.list, (base) => {
                  const f = deltaFeatures.getSnapshot()
                  const deletedSet = new Set(f.deletedSessionIds)
                  const lockedSet = new Set(f.lockedSessionIds.filter(id => !deletedSet.has(id)))
                  if (deletedSet.size === 0 && lockedSet.size === 0 && Object.keys(f.movedSessions).length === 0) return base
                  if (base === cachedBaseSnap && f.revision === cachedRev && cachedProjected) return cachedProjected
                  const nextItems = base.items.map(ws => ({
                    ...ws,
                    ...(Array.isArray(ws.sessionIds) ? { sessionIds: [...ws.sessionIds] } : {}),
                  }))
                  const byWsId = new Map(nextItems.map(w => [w.workspaceId, w]))
                  for (const ws of nextItems) {
                    if (!ws.sessionIds) continue
                    ws.sessionIds = ws.sessionIds.filter(sid => !deletedSet.has(sid) && (!f.movedSessions[sid] || f.movedSessions[sid] === ws.workspaceId))
                  }
                  for (const [sid, targetWsId] of Object.entries(f.movedSessions)) {
                    if (deletedSet.has(sid)) continue
                    const targetWs = byWsId.get(targetWsId)
                    if (targetWs) {
                      const existing = Array.isArray(targetWs.sessionIds) ? targetWs.sessionIds : []
                      if (!existing.includes(sid)) {
                        targetWs.sessionIds = [sid, ...existing]
                      }
                    }
                  }
                  const baseArchived = Array.isArray(base.archivedSessionIds) ? base.archivedSessionIds : []
                  const nextArchivedSet = new Set(baseArchived.filter(id => !deletedSet.has(id)))
                  for (const lid of lockedSet) nextArchivedSet.add(lid)
                  const nextArchived = [...nextArchivedSet]
                  cachedBaseSnap = base
                  cachedRev = f.revision
                  cachedProjected = {
                    ...base,
                    items: nextItems,
                    archivedSessionIds: nextArchived,
                    ...(Array.isArray(base.pinnedSessionIds)
                      ? { pinnedSessionIds: base.pinnedSessionIds.filter(id => !deletedSet.has(id) && !lockedSet.has(id)) }
                      : {}),
                  }
                  return cachedProjected
                })
                workspaceScope.effect(() => stopWsProjection, 'dsh-delta-desktop: workspace session overlay')
                deltaFeatures.setWorkspacesApi(workspaces)
                workspaceScope.effect(() => () => deltaFeatures.setWorkspacesApi(undefined),
                  'dsh-delta-desktop: workspaces reference')

                if (typeof workspaces.unarchiveSession === 'function') {
                  const originalUnarchive = workspaces.unarchiveSession
                  deltaFeatures.setRawUnarchiveSession(originalUnarchive)
                  const guardedUnarchive = (sessionId: string): Promise<unknown> => {
                    if (deltaFeatures.isLocked(sessionId)) {
                      deltaFeatures.openUnlockPinDialog(sessionId)
                      return Promise.reject(new Error('delta/session-locked'))
                    }
                    return originalUnarchive.call(workspaces, sessionId)
                  }
                  try {
                    workspaces.unarchiveSession = guardedUnarchive
                    workspaceScope.effect(() => () => {
                      deltaFeatures.setRawUnarchiveSession(undefined)
                      if (workspaces.unarchiveSession === guardedUnarchive) workspaces.unarchiveSession = originalUnarchive
                    }, 'dsh-delta-desktop: workspace unarchive lock guard')
                  } catch (error) {
                    console.error('[dsh-delta-desktop] Workspace unarchive guard unavailable:', error)
                  }
                }

                if (typeof workspaces.delete !== 'function') return
                const originalDelete = workspaces.delete
                const guardedDelete = (id: string): Promise<unknown> => {
                  const items = workspaces.list.getSnapshot().items
                  if (items.length <= 1) {
                    const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                    showDeltaToast(copy.ui.cannotDeleteSoleWorkspace)
                    return Promise.reject(new Error('delta/sole-workspace-protected'))
                  }
                  const target = items.find(item => item.workspaceId === id)
                  const path = target?.path.replace(/\\/g, '/').toLowerCase()
                  const protectedDefault = path?.endsWith('/deepseek-harness/default-workspace') === true ||
                    path?.endsWith('/default-workspace') === true
                  if (controller.getSnapshot().mode === 'delta' && protectedDefault) {
                    const hasOtherWorkspace = items.some(item => item.workspaceId !== id)
                    const hasSessions = target?.sessionIds === undefined || target.sessionIds.length > 0
                    if (!hasOtherWorkspace || hasSessions) {
                      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                      showDeltaToast(copy.ui.protectedDefaultWorkspace)
                      return Promise.reject(new Error('delta/protected-default-workspace'))
                    }
                  }
                  return originalDelete.call(workspaces, id)
                }
                try {
                  workspaces.delete = guardedDelete
                  workspaceScope.effect(() => () => {
                    if (workspaces.delete === guardedDelete) workspaces.delete = originalDelete
                  }, 'dsh-delta-desktop: workspace deletion guard')
                } catch (error) {
                  console.error('[dsh-delta-desktop] Workspace guard unavailable:', error)
                }
              })

              scope.inject(['sessions', 'uiWorkspace'], searchScope => {
                if (!searchScope.sessions || !searchScope.uiWorkspace) return
                const sessionsApi = searchScope.sessions
                const navApi = searchScope.uiWorkspace

                // Track active session id & protect deleted sessions in client projection
                const origOpenSession = typeof navApi.openSession === 'function' ? navApi.openSession : undefined
                if (origOpenSession) {
                  try {
                    const wrappedOpen = (sessionId: string, opts?: { workspaceId?: string }) => {
                      deltaFeatures.setActiveSessionId(sessionId)
                      return opts ? origOpenSession.call(navApi, sessionId, opts) : origOpenSession.call(navApi, sessionId)
                    }
                    navApi.openSession = wrappedOpen
                    searchScope.effect(() => () => {
                      if (navApi.openSession === wrappedOpen) navApi.openSession = origOpenSession
                    }, 'dsh-delta-desktop: active session tracker')
                  } catch {}
                }

                // Filter deleted sessions from sessions.list snapshot (for "In one list" view) & track active mainView session
                let cachedBaseSess: ReturnType<SearchSessionsApi['list']['getSnapshot']> | undefined
                let cachedSessRev = -1
                let cachedProjSess: ReturnType<SearchSessionsApi['list']['getSnapshot']> | undefined
                const stopSessProjection = installProjectedList(sessionsApi.list, (base) => {
                  const f = deltaFeatures.getSnapshot()
                  if (f.deletedSessionIds.length === 0) return base
                  if (base === cachedBaseSess && f.revision === cachedSessRev && cachedProjSess) return cachedProjSess
                  const del = new Set(f.deletedSessionIds)
                  const nextById: Record<string, SearchSessionRecord> = {}
                  for (const [k, v] of Object.entries(base.byId)) {
                    if (!del.has(k)) nextById[k] = v
                  }
                  cachedBaseSess = base
                  cachedSessRev = f.revision
                  cachedProjSess = {
                    ...base,
                    byId: nextById,
                    ...(Array.isArray(base.ids) ? { ids: base.ids.filter(id => !del.has(id)) } : {}),
                  }
                  return cachedProjSess
                })
                searchScope.effect(() => stopSessProjection, 'dsh-delta-desktop: deleted sessions snapshot filter')
                deltaFeatures.setSessionsApi(sessionsApi)
                deltaFeatures.setNavigationApi(navApi)
                const stopActiveSessTrack = sessionsApi.list.subscribe?.(() => {
                  const snap = sessionsApi.list.getSnapshot()
                  const mainSess = Object.values(snap?.byId ?? {}).find(s => ((s as { retainedBy?: { mainView?: number } }).retainedBy?.mainView ?? 0) > 0)
                  if (mainSess?.id) deltaFeatures.setActiveSessionId(mainSess.id)
                })
                if (stopActiveSessTrack) {
                  searchScope.effect(() => stopActiveSessTrack, 'dsh-delta-desktop: active mainView session tracker')
                }

                // Register Move, PIN Lock, Delete actions natively in DSH contextMenus when supported
                const contextMenus = searchScope.get?.('contextMenus') as {
                  register?: (spec: {
                    id: string
                    target: 'session'
                    order: number
                    observe?: (t: { sessionId: string }) => unknown[]
                    resolve: (t: { sessionId: string; displayTitle?: string }) => unknown[]
                  }) => () => void
                } | undefined
                if (contextMenus && typeof contextMenus.register === 'function') {
                  try {
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

                    const iconStops = [
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.move', key: 'delta.session.move' }, iconMov),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.lock', key: 'delta.session.lock' }, () => iconLock(false)),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.unlock', key: 'delta.session.unlock' }, () => iconLock(true)),
                      scope.slots.register({ name: 'contextMenu.icon', id: 'delta.icon.delete', key: 'delta.session.delete' }, iconTrash),
                    ]
                    const menuStops = [
                      contextMenus.register({
                        id: 'session.delta.lock',
                        target: 'session',
                        order: 580,
                        resolve: (t) => {
                          const locked = deltaFeatures.isLocked(t.sessionId)
                          const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
                          return [{
                            id: 'delta-lock',
                            label: locked ? copy.sessionMenu.unlockSession : copy.sessionMenu.lockSession,
                            icon: { key: locked ? 'delta.session.unlock' : 'delta.session.lock' },
                            afterContent: true,
                            run: () => {
                              if (locked) {
                                deltaFeatures.openUnlockPinDialog(t.sessionId)
                              } else if (deltaFeatures.getSnapshot().hasPin) {
                                void deltaFeatures.lockSession(t.sessionId).then(res => {
                                  if (res.ok) showDeltaToast(copy.sessionMenu.lockedToast)
                                })
                              } else {
                                deltaFeatures.openSetPinDialog(t.sessionId, t.displayTitle)
                              }
                            },
                          }]
                        },
                      }),
                      contextMenus.register({
                        id: 'session.delta.move',
                        target: 'session',
                        order: 590,
                        resolve: (t) => [{
                          id: 'delta-move',
                          label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.moveSession,
                          icon: { key: 'delta.session.move' },
                          afterContent: true,
                          run: () => deltaFeatures.openMoveDialog(t.sessionId, t.displayTitle),
                        }],
                      }),
                      contextMenus.register({
                        id: 'session.delta.delete',
                        target: 'session',
                        order: 650,
                        resolve: (t) => [{
                          id: 'delta-delete',
                          label: (DICTIONARIES[language()] ?? DICTIONARIES.en).sessionMenu.deleteSession,
                          icon: { key: 'delta.session.delete' },
                          danger: true,
                          afterContent: true,
                          run: () => deltaFeatures.openDeleteDialog(t.sessionId, t.displayTitle),
                        }],
                      }),
                    ]
                    searchScope.effect(() => () => {
                      for (const s of menuStops) { try { s?.() } catch {} }
                      for (const s of iconStops) { try { if (typeof s === 'function') (s as () => void)() } catch {} }
                    }, 'dsh-delta-desktop: session move/lock/delete menus')
                  } catch {}
                }

                searchScope.effect(() => {
                  const stopSearch = installHostSearch(controller, sessionsApi, navApi, searchScope)
                  return () => {
                    stopSearch()
                    deltaFeatures.setSessionsApi(undefined)
                    deltaFeatures.setNavigationApi(undefined)
                  }
                }, 'dsh-delta-desktop: native service-backed sidebar search')
              })

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

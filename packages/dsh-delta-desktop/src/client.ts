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
  useSyncExternalStore(subscribe: (listener: () => void) => () => void, getSnapshot: () => DeltaState): DeltaState
}
interface ThemeApi {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}
interface LayoutApi { toggleSidebar(): void; selectPanel(id: string | null): void }
interface SlotsApi {
  inject(name: string, register: () => unknown): void
  register<P = DeltaProps>(options: { name: string; id: string; order?: number; label?: () => string; inject?: () => DeltaProps }, component: (props: P) => unknown): unknown
}
interface WorkspacesApi {
  list: { getSnapshot(): { items: readonly { workspaceId: string; path: string; title: string; sessionIds?: readonly string[] }[] } }
  delete(workspaceId: string): Promise<unknown>
}

/** Optional Harness public Client services. All data and navigation remain Host-owned. */
interface SearchSessionsApi {
  list: { getSnapshot(): { byId: Record<string, { id: string; title?: string; blank?: boolean }> } }
  search(query: string, signal: AbortSignal): Promise<{
    ok: boolean
    value?: { items: { sessionId: string; snippet: string }[]; hasMore: boolean }
    error?: { message?: string }
  }>
}
interface SearchNavigationApi {
  openSession(sessionId: string): void
  startSession(): void
}

interface ClientContext {
  theme?: ThemeApi
  layout?: LayoutApi
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
    openConversation: () => { safeLayout(layout => layout.selectPanel(null)) },
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
      publish({ error: !applyPalette(snapshot.mode) })
    },
    bindLayout: (layout: LayoutApi | undefined) => {
      if (!isDisposed) activeLayout = layout
    },
  } as DeltaController & { syncLanguage(): void; activate(): void }
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
  const failedAvatarUrls = new Set<string>()
  let isDisposed = false
  let isSyncing = false
  let allowSilentMenu = false
  let silentMenuTimer: number | undefined
  let updateBusy = false
  let desktopUpdatePhase: string | undefined
  let stopDesktopUpdates: (() => void) | undefined
  let observer: MutationObserver | undefined
  let rafId: number | undefined
  let timerId: number | undefined
  const scheduleSync = (): void => {
    if (isDisposed) return
    if (typeof requestAnimationFrame === 'function') {
      if (rafId !== undefined) return
      rafId = requestAnimationFrame(() => {
        rafId = undefined
        sync()
      })
    } else if (typeof setTimeout === 'function') {
      if (timerId !== undefined) return
      timerId = scheduleTimer(() => {
        timerId = undefined
        sync()
      }, 16)
    } else {
      sync()
    }
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
          frame.style?.removeProperty?.('--dtd-sidebar-col')
          frame.style?.removeProperty?.('--dtd-rightbar-col')
        }
      } catch {}
    }
  }

  const syncElasticLayout = (): void => {
    if (typeof document?.querySelector !== 'function') return
    const frame = document.querySelector<HTMLElement>('[class*="mP3x-q_frame"]')
    if (!frame || !frame.style) return
    const tracks = splitGridTracks(frame.style.gridTemplateColumns ?? '')
    const sidebarCol = frame.querySelector?.<HTMLElement>('[data-sidebar-col], [class*="sidebarCol"]') ?? null
    const rightbarCol = frame.querySelector?.<HTMLElement>('[data-rightbar-col], [class*="rightbarCol"]') ?? null
    const hasTracks = tracks.length >= 2
    const hostSidebarOpen = hasTracks
      ? !isZeroGridTrack(tracks[0])
      : Boolean(sidebarCol && (sidebarCol.offsetWidth ?? 1) > 0)
    const rightbarHasContent = rightbarCol
      ? ((rightbarCol.childElementCount ?? (rightbarCol as unknown as { children?: { length: number } }).children?.length ?? 0) > 0)
      : true
    const hostRightbarOpen = hasTracks
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

    let targetRightbar = hostRightbarOpen ? (customRightbarWidth ?? hostRightbarPx) : 0
    let targetSidebar = hostSidebarOpen ? (customSidebarWidth ?? hostSidebarPx) : 0

    if (hostSidebarOpen) {
      const reserve = 150 + (hostRightbarOpen ? 150 : 0)
      const maxSidebar = Math.max(150, frameWidth - reserve)
      targetSidebar = Math.max(150, Math.min(targetSidebar, maxSidebar))
    }
    if (hostRightbarOpen) {
      const reserve = 150 + (hostSidebarOpen ? targetSidebar : 0)
      const maxRightbar = Math.max(150, frameWidth - reserve)
      targetRightbar = Math.max(150, Math.min(targetRightbar, maxRightbar))
    }

    const nextSidebarAttr = hostSidebarOpen ? '1' : '0'
    const nextRightbarAttr = hostRightbarOpen ? '1' : '0'
    const nextSidebarCss = hostSidebarOpen ? `${targetSidebar}px` : '0px'
    const nextRightbarCss = hostRightbarOpen ? `${targetRightbar}px` : '0px'

    if (frame.getAttribute('data-dtd-elastic') !== '1') frame.setAttribute('data-dtd-elastic', '1')
    if (frame.getAttribute('data-dtd-sidebar-open') !== nextSidebarAttr) frame.setAttribute('data-dtd-sidebar-open', nextSidebarAttr)
    if (frame.getAttribute('data-dtd-rightbar-open') !== nextRightbarAttr) frame.setAttribute('data-dtd-rightbar-open', nextRightbarAttr)
    if (frame.style.getPropertyValue('--dtd-sidebar-col') !== nextSidebarCss) {
      frame.style.setProperty('--dtd-sidebar-col', nextSidebarCss)
    }
    if (frame.style.getPropertyValue('--dtd-rightbar-col') !== nextRightbarCss) {
      frame.style.setProperty('--dtd-rightbar-col', nextRightbarCss)
    }
    if (hostSidebarOpen) {
      frame.style.setProperty('--dsh-windows-sidebar-width', nextSidebarCss)
    }

    if (typeof ResizeObserver !== 'undefined' && observedFrameEl !== frame) {
      frameResizeObserver?.disconnect()
      observedFrameEl = frame
      frameResizeObserver = new ResizeObserver(() => scheduleSync())
      frameResizeObserver.observe(frame)
    }

    if (typeof frame.querySelectorAll === 'function') {
      const handles = Array.from(frame.querySelectorAll<HTMLElement>('[class*="mP3x-q_handle"]'))
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i]
        const isSidebarHandle = Boolean(h.closest?.('[data-sidebar-col], [class*="sidebarCol"]'))
          || (!h.closest?.('[data-rightbar-col], [class*="rightbarCol"]') && (i === 0 || !hostRightbarOpen))
        if (isSidebarHandle) {
          if (h.style.left) {
            if (h.dataset && h.dataset.dtdOrigLeft === undefined) h.dataset.dtdOrigLeft = h.style.left
            modifiedHandles.add(h)
            if (h.style.left !== nextSidebarCss) h.style.setProperty('left', nextSidebarCss, 'important')
          }
        } else if (hostRightbarOpen) {
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
    const handle = target?.closest?.<HTMLElement>('[class*="mP3x-q_handle"]')
    if (!handle) return
    const frame = handle.closest?.<HTMLElement>('[class*="mP3x-q_frame"]') ?? document.querySelector<HTMLElement>('[class*="mP3x-q_frame"]')
    if (!frame) return
    const tracks = splitGridTracks(frame.style.gridTemplateColumns ?? '')
    const handles = Array.from(frame.querySelectorAll<HTMLElement>('[class*="mP3x-q_handle"]'))
    const rightbarCol = frame.querySelector<HTMLElement>('[data-rightbar-col], [class*="rightbarCol"]')
    const hostSidebarOpen = tracks.length >= 2 ? !isZeroGridTrack(tracks[0]) : true
    const hostRightbarOpen = tracks.length >= 3
      ? !isZeroGridTrack(tracks[2])
      : Boolean(rightbarCol && ((rightbarCol.childElementCount ?? (rightbarCol as unknown as { children?: { length: number } }).children?.length ?? 0) > 0))
    const idx = handles.indexOf(handle)
    const frameRect = frame.getBoundingClientRect?.()
    const handleRect = handle.getBoundingClientRect?.()
    const currentSidebar = parseFloat(frame.style.getPropertyValue('--dtd-sidebar-col')) || parseTrackMaxPx(tracks[0], 264)
    const currentRightbar = parseFloat(frame.style.getPropertyValue('--dtd-rightbar-col')) || parseTrackMaxPx(tracks[2], 360)
    const isSidebarHandle = Boolean(handle.closest?.('[data-sidebar-col], [class*="sidebarCol"]'))
      || (!handle.closest?.('[data-rightbar-col], [class*="rightbarCol"]') && (
        (frameRect && handleRect ? Math.abs((handleRect.left - frameRect.left) - currentSidebar) <= 28 : idx === 0 || !hostRightbarOpen)
      ))

    if ((isSidebarHandle && !hostSidebarOpen) || (!isSidebarHandle && !hostRightbarOpen)) return

    pe.preventDefault()
    pe.stopPropagation()
    activeDragCleanup?.()

    const startX = pe.clientX
    const startWidth = isSidebarHandle ? currentSidebar : currentRightbar
    const frameWidth = Math.round(frameRect?.width || frame.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 0) || 1200)

    const onMove = (moveEv: PointerEvent): void => {
      const dx = moveEv.clientX - startX
      if (isSidebarHandle) {
        const maxSidebar = Math.max(150, frameWidth - 150 - (hostRightbarOpen ? (customRightbarWidth ?? currentRightbar) : 0))
        customSidebarWidth = Math.max(150, Math.min(Math.round(startWidth + dx), maxSidebar))
      } else {
        const maxRightbar = Math.max(150, frameWidth - 150 - (hostSidebarOpen ? (customSidebarWidth ?? currentSidebar) : 0))
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
      activeDragCleanup?.()
      activeDragCleanup = undefined
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', onMove, { capture: true })
      window.addEventListener('pointerup', onEnd, { capture: true })
      window.addEventListener('pointercancel', onEnd, { capture: true })
      activeDragCleanup = () => {
        window.removeEventListener('pointermove', onMove, { capture: true })
        window.removeEventListener('pointerup', onEnd, { capture: true })
        window.removeEventListener('pointercancel', onEnd, { capture: true })
      }
    }
  }

  const modifiedMenuNodes = new Set<HTMLElement>()
  const modifiedTailNavCells = new Set<HTMLElement>()
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

  const reset = (): void => {
    resetElasticLayout()
    resetModalState()
    for (const node of modifiedMenuNodes) {
      try {
        node.removeAttribute?.('data-dtd-menu-order')
        node.style?.removeProperty?.('order')
      } catch {}
    }
    modifiedMenuNodes.clear()
    for (const navBtn of modifiedTailNavCells) {
      try { navBtn.removeAttribute?.('data-dtd-nav-tail') } catch {}
    }
    modifiedTailNavCells.clear()
    if (silentMenuTimer !== undefined) {
      cancelTimer(silentMenuTimer)
      silentMenuTimer = undefined
    }
    allowSilentMenu = false
    updateBusy = false
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
    '重命名': '10', 'Rename': '10',
    '置顶会话': '20', '取消置顶': '20', 'Pin': '20', 'Unpin': '20',
    '分叉会话': '30', 'Fork': '30', 'Fork session': '30',
    '在文件夹显示': '50', '在 Finder 显示': '50', 'Show in folder': '50', 'Show in Finder': '50',
    '复制 Session ID': '60', 'Copy Session ID': '60',
    '归档会话': '80', '取消归档': '80', 'Archive': '80', 'Unarchive': '80',
  }
  const VIEW_OPTIONS_ORDERS: Record<string, string> = {
    '分组方式': '10', 'Group by': '10',
    '单列表': '15', 'In one list': '15',
    '按工作区': '20', 'WorkSpace': '20',
    '按工作区树': '30', 'Workspace Tree': '30',
    '排序方式': '40', 'Order by': '40',
    '手动排序': '45', 'Manual': '45',
    '最近更新': '50', 'Last updated': '50',
    '筛选会话': '60', 'Filter sessions': '60',
    '隐藏已归档': '65', 'Hide archived': '65',
    '仅显示已归档': '70', 'Archived only': '70',
    '全部对话（显示已归档）': '80', 'All conversations (show archived)': '80',
  }

  const setMenuNodeOrder = (node: HTMLElement, order: string): void => {
    if (node.getAttribute('data-dtd-menu-order') !== order) node.setAttribute('data-dtd-menu-order', order)
    if (node.style?.getPropertyValue?.('order') !== order) node.style?.setProperty?.('order', order, 'important')
    modifiedMenuNodes.add(node)
  }

  const syncMenus = (): void => {
    for (const stale of modifiedMenuNodes) {
      if (!stale.isConnected) modifiedMenuNodes.delete(stale)
    }
    if (typeof document?.querySelectorAll !== 'function') return
    const containers = document.querySelectorAll<HTMLElement>('[class*="_viewport_1p5el"], [role="menu"]')
    for (const container of containers) {
      const items = Array.from(container.children ?? []) as HTMLElement[]
      if (items.length < 2) continue
      const labels = items.map(el => (el.querySelector?.('[class*="_itemLabel_"], [role="menuitem"]')?.textContent ?? el.textContent ?? '').trim())
      const isSessionMenu = (labels.some(t => t === '重命名' || t === 'Rename') && labels.some(t => t === '置顶会话' || t === '取消置顶' || t === 'Pin' || t === 'Unpin'))
        || (labels.some(t => t === '复制 Session ID' || t === 'Copy Session ID') && labels.some(t => t === '在文件夹显示' || t === '在 Finder 显示' || t === 'Show in folder' || t === 'Show in Finder'))
      const isViewMenu = labels.some(t => t === '单列表' || t === 'In one list')
        && (labels.some(t => t === '按工作区' || t === 'WorkSpace') || labels.some(t => t === '仅显示已归档' || t === 'Archived only'))
      if (!isSessionMenu && !isViewMenu) continue

      let seenSep = 0
      const table = isSessionMenu ? SESSION_MENU_ORDERS : VIEW_OPTIONS_ORDERS
      for (let i = 0; i < items.length; i++) {
        const el = items[i]
        const isSep = el.getAttribute?.('role') === 'separator' || (typeof el.className === 'string' && el.className.includes('_separator_'))
        if (isSep) {
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
      replaceButtonText(btn, '账号与余额', '账户详情')
      replaceButtonText(btn, '模型', '模型配置')
      const labelText = (btn.querySelector?.('[class*="navLabel"]')?.textContent ?? btn.textContent ?? '').trim()
      if (labelText === 'Agent 预设' || labelText === 'Agent Presets' || labelText === 'Agent presets') {
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
        const patched = origText === '插件' ? '插件管理' : (origText === '自动化任务' ? '定时任务' : origText)
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
      if (text === '插件') {
        if (!mutatedPageHeadings.has(heading)) mutatedPageHeadings.set(heading, '插件')
        setButtonLabel(heading, '插件', '插件管理')
      } else if (text === '自动化任务') {
        if (!mutatedPageHeadings.has(heading)) mutatedPageHeadings.set(heading, '自动化任务')
        setButtonLabel(heading, '自动化任务', '定时任务')
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
        header?.querySelector<HTMLButtonElement>('button[aria-label*="search" i], button[aria-label*="搜索"]') ??
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
          input.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
          input.placeholder = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions
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
              hostHeader?.querySelector<HTMLButtonElement>('button[aria-label*="search" i], button[aria-label*="搜索"]') ??
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

      const searchPlaceholder = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions
      const searchEl = mounted.get('search')
      const searchProxy = searchEl?.querySelector?.<HTMLInputElement>('input')
      if (searchProxy && searchProxy.placeholder !== searchPlaceholder) {
        searchProxy.placeholder = searchPlaceholder
        searchProxy.setAttribute?.('aria-label', searchPlaceholder)
      }

      // Nav items normalization: "插件" -> "插件管理", "自动化任务" -> "定时任务", hide "更多"
      if (navigation && typeof navigation.querySelectorAll === 'function') {
        const navButtons = navigation.querySelectorAll<HTMLButtonElement>('button')
        for (const btn of navButtons) {
          replaceButtonText(btn, '插件', '插件管理')
          replaceButtonText(btn, '自动化任务', '定时任务')
          const rawText = btn.textContent?.trim() ?? ''
          const aria = btn.getAttribute?.('aria-label')?.trim() ?? ''
          if (rawText === '更多' || aria === '更多' || rawText === 'More' || aria === 'More') {
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

      // 8, 9, 10. Footer bar: Left Avatar/Logo, Right Action Icons (更新通知, 设置, 登录/登出)
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
            if (isDisposed || allowSilentMenu || controller.getSnapshot().mode !== 'delta') return
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
              width: 15,
              height: 15,
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

        const updateAuthButton = (btn: HTMLButtonElement, signedIn: boolean): void => {
          const uiCopy = getUiCopy()
          const label = signedIn ? uiCopy.signOut : uiCopy.signIn
          if (btn.title !== label) btn.title = label
          if (btn.getAttribute?.('aria-label') !== label) btn.setAttribute('aria-label', label)
          const stateKey = signedIn ? '1' : '0'
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
          if (signedIn) {
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
            const directSettings = document.querySelector?.<HTMLElement>('[data-action="settings"], button[aria-label*="设置"]:not(.dtd-footer-btn), button[aria-label*="Settings"]:not(.dtd-footer-btn)')
            if (directSettings && directSettings !== liveTrigger) {
              directSettings.click()
              return
            }
          } else {
            const directAuth = document.querySelector?.<HTMLElement>(
              '[data-action="logout"], [data-action="login"], button[aria-label*="退出登录"]:not(.dtd-footer-btn), button[aria-label*="登录"]:not(.dtd-footer-btn), button[aria-label*="Sign " i]:not(.dtd-footer-btn), button[aria-label*="Log " i]:not(.dtd-footer-btn)'
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
            allowSilentMenu = true
            try {
              liveTrigger.click()
            } finally {
              allowSilentMenu = false
            }
          }

          const findTargetItem = (): HTMLElement | undefined => {
            if (typeof document.querySelectorAll !== 'function') return undefined
            const allItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"], [role="menu"] button'))
            const newItems = allItems.filter(el => !preExisting.has(el))
            const candidates = newItems.length > 0 ? newItems : allItems
            if (candidates.length === 0) return undefined
            if (kind === 'settings') {
              return candidates.find(el => /设置|Settings/i.test(el.textContent ?? ''))
                ?? candidates.find(el => !/反馈|Feedback|退出|Sign|Log/i.test(el.textContent ?? ''))
                ?? candidates[0]
            }
            return candidates.find(el => /退出登录|登录|Sign\s*(Out|In)|Log\s*(Out|In)/i.test(el.textContent ?? ''))
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
                allowSilentMenu = true
                try { liveTrigger.click() } finally { allowSilentMenu = false }
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
          if (btn.title !== updateLabel) btn.title = updateLabel
          if (btn.getAttribute?.('aria-label') !== updateLabel) btn.setAttribute('aria-label', updateLabel)
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
            btn.hidden = true
            btn.setAttribute('hidden', '')
            btn.removeAttribute?.('data-has-update')
          }
        }

        // Right-side 3 action buttons (更新通知 [仅在有更新时显示], 设置, 登录/登出)
        let actionsBox = footArea.querySelector?.<HTMLElement>('.dtd-footer-actions')
        if (!actionsBox) {
          actionsBox = document.createElement('div')
          actionsBox.className = 'dtd-footer-actions'

          // 1. 更新通知（有更新时才显示）
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
            if (updateBusy) return
            const dshDesktop = (window as unknown as { dshDesktop?: { updates?: { open?: () => unknown } } }).dshDesktop
            if (typeof dshDesktop?.updates?.open === 'function') {
              updateBusy = true
              try {
                Promise.resolve(dshDesktop.updates.open()).catch(() => {
                  showDeltaToast(getUiCopy().latestVersion)
                }).finally(() => {
                  updateBusy = false
                })
              } catch {
                updateBusy = false
                showDeltaToast(getUiCopy().latestVersion)
              }
              return
            }
            const liveFoot = document.querySelector?.<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')
            const nativeUpdate = liveFoot?.querySelector?.<HTMLElement>('button[class*="VUhOWa_indicator"], [class*="VUhOWa_indicator"] button, button[aria-label*="更新"], button[aria-label*="Update" i], button[class*="update" i]')
            if (nativeUpdate && !nativeUpdate.classList?.contains('dtd-footer-btn')) {
              nativeUpdate.click()
            } else {
              showDeltaToast(getUiCopy().latestVersion)
            }
          })
          syncUpdateButtonState(btnUpdate, footArea)

          // 2. 设置
          const btnSettings = document.createElement('button')
          btnSettings.type = 'button'
          btnSettings.className = 'dtd-footer-btn dtd-btn-settings'
          const settingsLabel = getUiCopy().settings
          btnSettings.title = settingsLabel
          btnSettings.setAttribute('aria-label', settingsLabel)
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

          // 3. 登录/登出
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
            const settingsLabel = getUiCopy().settings
            if (btnSettings.title !== settingsLabel) btnSettings.title = settingsLabel
            if (btnSettings.getAttribute?.('aria-label') !== settingsLabel) btnSettings.setAttribute('aria-label', settingsLabel)
          }
          const btnAuth = actionsBox.querySelector?.<HTMLButtonElement>('.dtd-btn-auth')
          if (btnAuth) updateAuthButton(btnAuth, isSignedIn)
        }
      }

      // Defense-in-depth: replace any rendered "深度求索中" with "任务执行中" inside [data-chat-running]
      if (typeof document?.querySelectorAll === 'function') {
        const runningEls = document.querySelectorAll<HTMLElement>('[data-chat-running]')
        for (let i = 0; i < runningEls.length; i++) {
          const r = runningEls[i]
          if (typeof document.createTreeWalker === 'function') {
            const walker = document.createTreeWalker(r, 4 /* NodeFilter.SHOW_TEXT */)
            let node = walker.nextNode()
            while (node) {
              if (node.nodeValue && node.nodeValue.includes('深度求索中')) {
                node.nodeValue = node.nodeValue.replace(/深度求索中/g, '任务执行中')
              }
              node = walker.nextNode()
            }
          }
        }
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
    ? new MutationObserver(() => scheduleSync())
    : undefined
  observer?.observe(document.body ?? root, {
    subtree: true,
    childList: true,
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
  const onPointerDownCapture = (e: Event): void => {
    onSplitterPointerDown(e)
    if (!(e as PointerEvent).defaultPrevented) {
      onModalPointerDown(e)
    }
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('mouseover', onMouseOver, { capture: true, passive: true })
    document.addEventListener('pointerdown', onPointerDownCapture, { capture: true })
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

  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    isDisposed = true
    if (rafId !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
    if (timerId !== undefined) cancelTimer(timerId)
    stopDesktopUpdates?.()
    stopDesktopUpdates = undefined
    unsubscribe()
    observer?.disconnect()
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('mouseover', onMouseOver, { capture: true })
      document.removeEventListener('pointerdown', onPointerDownCapture, { capture: true })
      document.removeEventListener('dblclick', onModalDblClick, { capture: true })
    }
    reset()
  }
}

/**
 * A plugin-owned search control inside the published sidebar scrollport.
 * It calls Harness Session Controller and UiWorkspace services directly if present.
 */
function installHostSearch(controller: DeltaController, sessions: SearchSessionsApi, navigation: SearchNavigationApi): () => void {
  const root = document.documentElement
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
  input.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
  input.placeholder = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions
  searchField.append(searchIcon, input)
  const results = document.createElement('div')
  results.className = 'dtd-host-search-results'
  results.setAttribute('role', 'region')
  results.setAttribute('aria-label', (DICTIONARIES[language()] ?? DICTIONARIES.en).ui.searchSessions)
  results.hidden = true
  shell.append(searchField, results)
  let isDisposed = false
  let timer: number | undefined
  let pending: AbortController | undefined
  let serial = 0
  let remoteItems: { sessionId: string; snippet: string }[] = []
  let isSearching = false
  let hasError = false
  const active = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
  const clearRequest = (): void => {
    if (timer !== undefined) cancelTimer(timer)
    timer = undefined
    pending?.abort()
    pending = undefined
    serial += 1
  }
  const render = (): void => {
    results.replaceChildren()
    const query = input.value.trim().toLocaleLowerCase()
    if (!query || !active()) { results.hidden = true; return }
    results.hidden = false
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    const seen = new Set<string>()
    const matches: { id: string; title: string; snippet?: string }[] = []
    for (const item of Object.values(sessions.list.getSnapshot().byId)) {
      const title = item.title?.trim() ?? ''
      if (!item.blank && title.toLocaleLowerCase().includes(query)) {
        matches.push({ id: item.id, title })
        seen.add(item.id)
      }
      if (matches.length >= 20) break
    }
    for (const item of remoteItems) {
      if (seen.has(item.sessionId) || matches.length >= 20) continue
      const title = sessions.list.getSnapshot().byId[item.sessionId]?.title?.trim() || item.sessionId
      matches.push({ id: item.sessionId, title, snippet: item.snippet })
      seen.add(item.sessionId)
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
          navigation.openSession(match.id)
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
      results.appendChild(button)
    }
    if (isSearching || hasError || matches.length === 0) {
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
    if (query) {
      isSearching = true
      const requestId = serial
      const aborter = new AbortController()
      pending = aborter
      timer = scheduleTimer(() => {
        timer = undefined
        void sessions.search(query, aborter.signal).then(result => {
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
  input.addEventListener('input', onInput)
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    input.value = ''
    onInput()
    input.blur()
  })
  let rafId: number | undefined
  let timerId: number | undefined
  let observer: MutationObserver | undefined
  const scheduleSync = (): void => {
    if (isDisposed) return
    if (typeof requestAnimationFrame === 'function') {
      if (rafId !== undefined) return
      rafId = requestAnimationFrame(() => {
        rafId = undefined
        sync()
      })
    } else if (typeof setTimeout === 'function') {
      if (timerId !== undefined) return
      timerId = scheduleTimer(() => {
        timerId = undefined
        sync()
      }, 16)
    } else {
      sync()
    }
  }
  const sync = (): void => {
    if (isDisposed) return
    try {
      if (controller.getSnapshot().mode !== 'delta') {
        clearRequest()
        if (shell.parentElement) shell.remove()
        if (root.getAttribute('data-delta-search-adapter') !== null) root.removeAttribute('data-delta-search-adapter')
        return
      }
      const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]')
      const navigationRow = viewport?.querySelector('nav')
      if (!viewport || !navigationRow) {
        if (shell.parentElement) shell.remove()
        if (root.getAttribute('data-delta-search-adapter') !== 'waiting-for-sidebar') {
          root.setAttribute('data-delta-search-adapter', 'waiting-for-sidebar')
        }
        return
      }
      if (shell.parentElement !== viewport || shell.nextElementSibling !== navigationRow) {
        viewport.insertBefore(shell, navigationRow)
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
    if (rafId !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId)
    if (timerId !== undefined) cancelTimer(timerId)
    clearRequest()
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
      const { state, copy } = useCopy(controller)
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
                const stopAppearance = controller.subscribe(syncAppearance)
                const stopCompat = installSidebarCompatibility(controller)

                // Adapt runtime chat status: "深度求索中" -> "任务执行中"
                let effectDisposed = false
                let stopLocaleSync: (() => void) | undefined
                let restoreLocaleOnDispose: (() => void) | undefined
                try {
                  const slotsObj = scope.slots as any
                  const origSlotsEntries = typeof slotsObj?.entries === 'function' ? slotsObj.entries : undefined
                  if (origSlotsEntries && !slotsObj.__deltaEntriesWrapped) {
                    try {
                      slotsObj.__deltaEntriesWrapped = true
                      slotsObj.entries = function(this: any, slotName: string) {
                        const list = origSlotsEntries.apply(this, arguments)
                        if (!effectDisposed && controller.getSnapshot().mode === 'delta' && slotName === 'settings.section' && Array.isArray(list)) {
                          return list.map((item: any) => item?.options?.id === 'agent-presets'
                            ? { ...item, options: { ...item.options, order: 9999 } }
                            : item)
                        }
                        return list
                      }
                    } catch { /* Slots entries wrapper is optional */ }
                  }
                  const origDictValues = new Map<Record<string, string>, Record<string, string | undefined>>()
                  const setDictEntry = (dict: Record<string, string>, key: string, nextValue: string, active: boolean): void => {
                    let origMap = origDictValues.get(dict)
                    if (!origMap) {
                      origMap = {}
                      origDictValues.set(dict, origMap)
                    }
                    if (!(key in origMap)) origMap[key] = dict[key]
                    if (active) {
                      dict[key] = nextValue
                    } else if (origMap[key] !== undefined) {
                      dict[key] = origMap[key]
                    } else {
                      delete dict[key]
                    }
                  }
                  const attachLocalePatch = (localeRuntime: any): void => {
                    if (!localeRuntime || localeRuntime.__deltaLocaleAttached) return
                    localeRuntime.__deltaLocaleAttached = true
                    const syncLocaleDict = (notify: boolean): void => {
                      const activeMode = !effectDisposed && controller.getSnapshot().mode === 'delta'
                      const chatLocales = localeRuntime.dicts?.get?.('chat')
                      const zhDict = chatLocales?.get?.('zh')
                      if (zhDict) {
                        setDictEntry(zhDict, 'chat.deepDiving', '任务执行中', activeMode)
                        setDictEntry(zhDict, 'chat.deepDivingFor', '任务执行中，用时 {duration} ···', activeMode)
                      }
                      if (typeof localeRuntime.dicts?.forEach === 'function') {
                        localeRuntime.dicts.forEach((nsMap: any, ns: string) => {
                          if (typeof ns !== 'string') return
                          const lowerNs = ns.toLowerCase()
                          const isSettingsNs = lowerNs.includes('setting') || lowerNs.includes('account') || lowerNs.includes('model')
                          const isScheduleNs = lowerNs.includes('schedule')
                          const isPluginManagerNs = lowerNs === 'pluginmanager' || lowerNs.includes('plugin')
                          const zh = nsMap?.get?.('zh')
                          if (!zh || typeof zh !== 'object') return
                          const origMap = origDictValues.get(zh)
                          for (const k of Object.keys(zh)) {
                            const baseline = origMap && k in origMap ? origMap[k] : zh[k]
                            if (baseline === '账号与余额' && (isSettingsNs || k === 'nav' || k.endsWith('.nav'))) {
                              setDictEntry(zh, k, '账户详情', activeMode)
                            } else if (baseline === '模型' && (isSettingsNs || k === 'nav' || k === 'title' || k.endsWith('.nav') || k.endsWith('.title'))) {
                              setDictEntry(zh, k, '模型配置', activeMode)
                            } else if (baseline === '自动化任务' && (isScheduleNs || k === 'panel' || k === 'title' || k === 'trigger.label')) {
                              setDictEntry(zh, k, '定时任务', activeMode)
                            } else if (baseline === '插件' && (isPluginManagerNs && (k === 'panel' || k === 'title' || k === 'crumbRoot') || k === 'panel' || k === 'title')) {
                              setDictEntry(zh, k, '插件管理', activeMode)
                            }
                          }
                        })
                      }
                      if (notify) {
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
                      localeRuntime.register = function(this: any) {
                        const res = origRegister.apply(this, arguments)
                        try { syncLocaleDict(false) } catch {}
                        return res
                      }
                    }
                    if (typeof localeRuntime.translate === 'function' && !localeRuntime.__deltaTranslatePatched) {
                      localeRuntime.__deltaTranslatePatched = true
                      const origTranslate = localeRuntime.translate
                      localeRuntime.translate = function(this: any, ns: string, key: string, params: any) {
                        const activeMode = !effectDisposed && controller.getSnapshot().mode === 'delta'
                        if (activeMode && ns === 'chat') {
                          if (key === 'chat.deepDiving') return '任务执行中'
                          if (key === 'chat.deepDivingFor') {
                            const template = '任务执行中，用时 {duration} ···'
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
                            if (res === '账号与余额') return '账户详情'
                            if (res === '模型') return '模型配置'
                          }
                          if (res === '自动化任务' && (lowerNs.includes('schedule') || lowerKey === 'panel' || lowerKey === 'title')) {
                            return '定时任务'
                          }
                          if (res === '插件' && ((lowerNs.includes('plugin') && (lowerKey === 'panel' || lowerKey === 'title' || lowerKey === 'crumbroot')) || lowerKey === 'panel' || lowerKey === 'title')) {
                            return '插件管理'
                          }
                        }
                        return res
                      }
                    }
                  }
                  const findLocaleRuntime = (obj: any): any => {
                    if (!obj || typeof obj !== 'object') return undefined
                    if (obj._locale && typeof obj._locale === 'object' && typeof obj._locale.translate === 'function') {
                      return obj._locale
                    }
                    try {
                      for (const val of Object.values(obj)) {
                        if (val && typeof val === 'object' && (val as any).dicts instanceof Map && typeof (val as any).translate === 'function') {
                          return val
                        }
                      }
                    } catch {}
                    return undefined
                  }
                  const discovered = findLocaleRuntime(slotsObj)
                  if (discovered) {
                    attachLocalePatch(discovered)
                  }
                  if (slotsObj && typeof slotsObj.installLocale === 'function' && !slotsObj.__deltaLocaleHooked) {
                    try {
                      slotsObj.__deltaLocaleHooked = true
                      const origInstallLocale = slotsObj.installLocale
                      slotsObj.installLocale = function(this: any, face: any) {
                        const res = origInstallLocale.apply(this, arguments)
                        try { attachLocalePatch(face) } catch {}
                        return res
                      }
                    } catch {}
                  }
                } catch { /* Locale runtime is optional and gracefully degraded */ }

                return () => {
                  effectDisposed = true
                  observer?.disconnect()
                  stopLocaleSync?.()
                  restoreLocaleOnDispose?.()
                  stopAppearance()
                  stopCompat()
                  clearDeltaToasts()
                  document.documentElement.removeAttribute('data-delta-ui')
                  document.body?.removeAttribute('data-delta-ui')
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

              // Guard Host workspace mutations at the client service boundary.
              scope.inject(['workspaces'], workspaceScope => {
                const workspaces = workspaceScope.workspaces
                if (!workspaces || typeof workspaces.delete !== 'function') return
                const originalDelete = workspaces.delete
                const guardedDelete = (id: string): Promise<unknown> => {
                  const items = workspaces.list.getSnapshot().items
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
                searchScope.effect(() => installHostSearch(controller, searchScope.sessions!, searchScope.uiWorkspace!),
                  'dsh-delta-desktop: native service-backed sidebar search')
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

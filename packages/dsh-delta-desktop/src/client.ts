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
const TOKENS: Record<string, { light: string; dark: string }> = {
  '--dsw-alias-brand-primary': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-brand-primary-invert': { light: '#70B1BA', dark: '#286F78' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-brand-text': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-fill': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-primary-hover': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-alias-button-info-fill': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-button-info-hover': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-alias-button-ghost-active-fill': { light: '#EAF3F4', dark: '#1C3B40' },
  '--dsw-alias-button-ghost-active-border': { light: '#9AC9CE', dark: '#357079' },
  '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--dsw-alias-label-primary-bluish': { light: '#10373C', dark: '#E4F4F6' },
  '--dsw-alias-label-deep-diving': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-label-deep-diving-shimmer': { light: '#5CA1AA', dark: '#8EE0EA' },
  '--dsw-alias-state-business-primary': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-state-business-tertiary': { light: '#EAF3F4', dark: '#1C3B40' },
  '--dsw-alias-link': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-bg-base': { light: '#F5F6F7', dark: '#131417' },
  '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1C1E22' },
  '--dsw-alias-bg-overlay': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-alias-bg-document-selection': { light: 'rgba(40, 111, 120, 0.22)', dark: 'rgba(96, 180, 191, 0.28)' },
  '--dsw-alias-border-l1': { light: '#E5E9EB', dark: '#31363B' },
  '--dsw-specific-sidebar-fill': { light: '#F5F6F7', dark: '#171A1D' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#DCEBEC', dark: '#1C3B40' },
  '--dsw-specific-bubble': { light: '#F4F8F8', dark: '#132225' },
  '--dsw-specific-bubble-highlight': { light: '#C2DFE2', dark: '#244E55' },
  '--dsw-focus-ring-width': { light: '1px', dark: '1px' },
  '--dsw-focus-ring-color': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-focus-stroke': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-alias-border-focus': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-menu-surface-fill': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-specific-menu': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-hovercard-bg': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-alias-tooltip-bg': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-alias-tooltip-key-bg': { light: '#EEF0F2', dark: 'rgba(255, 255, 255, 0.12)' },
  '--dsw-alias-toast-bg': { light: '#FFFFFF', dark: '#1E1E20' },
  '--dsw-alias-toast-label': { light: '#18181B', dark: '#FAFAFA' },
  '--dsw-alias-menu-group-header-fill': { light: '#F8F9FA', dark: '#242427' },
  '--dsw-alias-bg-module-platform': { light: '#EAF3F4', dark: '#1C2A2D' },
  '--dsw-static-deepseek-50': { light: '#F4F8F8', dark: '#132225' },
  '--dsw-static-deepseek-100': { light: '#EAF3F4', dark: '#1C3B40' },
  '--dsw-static-deepseek-200': { light: '#C2DFE2', dark: '#244E55' },
  '--dsw-static-deepseek-300': { light: '#9AC9CE', dark: '#357079' },
  '--dsw-static-deepseek-400': { light: '#45939D', dark: '#60B4BF' },
  '--dsw-static-deepseek-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-deepseek-500': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-static-deepseek-600': { light: '#1D5E66', dark: '#4A98A3' },
  '--dsw-static-deepseek-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-deepseek-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-50': { light: '#F4F8F8', dark: '#132225' },
  '--dsw-static-blue-50p': { light: '#F4F8F8', dark: '#132225' },
  '--dsw-static-blue-75': { light: '#EAF3F4', dark: '#172B2E' },
  '--dsw-static-blue-100': { light: '#DCEBEC', dark: '#1C3B40' },
  '--dsw-static-blue-300': { light: '#9AC9CE', dark: '#357079' },
  '--dsw-static-blue-400': { light: '#5CA1AA', dark: '#60B4BF' },
  '--dsw-static-blue-450': { light: '#337F89', dark: '#75CBD5' },
  '--dsw-static-blue-500': { light: '#286F78', dark: '#60B4BF' },
  '--dsw-static-blue-600': { light: '#1D5E66', dark: '#75CBD5' },
  '--dsw-static-blue-800': { light: '#16484E', dark: '#8EE0EA' },
  '--dsw-static-blue-900': { light: '#10373C', dark: '#B2ECF3' },
  '--dsw-static-blue-950': { light: '#0A2528', dark: '#D8F6F9' },
  '--ens-color-primary': { light: '#286F78', dark: '#60B4BF' },
  '--ens-color-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' },
  '--ens-color-accent': { light: '#EAF3F4', dark: '#1C3B40' },
  '--ens-color-accent-foreground': { light: '#286F78', dark: '#60B4BF' },
  '--ens-color-ring': { light: '#286F78', dark: '#60B4BF' },
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

/**
 * Compatibility layer for the public Harness sidebar DOM. The Host retains
 * ownership of all React nodes, commands, and session data.
 */
function installSidebarCompatibility(controller: DeltaController): () => void {
  const root = document.documentElement
  const mounted = new Map<string, HTMLElement>()
  const initialized = new Set<string>()
  const mutatedNavButtons = new Map<HTMLElement, { origText: string; origAria: string | null }>()
  const hiddenMoreElements = new Map<HTMLElement, string | null>()
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
  const reset = (): void => {
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

          const searchIcon = typeof document.createElementNS === 'function'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            : document.createElement('svg')
          searchIcon.setAttribute('viewBox', '0 0 24 24')
          searchIcon.setAttribute('width', '15')
          searchIcon.setAttribute('height', '15')
          searchIcon.setAttribute('fill', 'none')
          searchIcon.setAttribute('stroke', 'currentColor')
          searchIcon.setAttribute('stroke-width', '2')
          searchIcon.setAttribute('stroke-linecap', 'round')
          searchIcon.setAttribute('stroke-linejoin', 'round')
          searchIcon.setAttribute('class', 'dtd-search-icon')
          const circle = typeof document.createElementNS === 'function'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            : document.createElement('circle')
          circle.setAttribute('cx', '11')
          circle.setAttribute('cy', '11')
          circle.setAttribute('r', '8')
          const line = typeof document.createElementNS === 'function'
            ? document.createElementNS('http://www.w3.org/2000/svg', 'line')
            : document.createElement('line')
          line.setAttribute('x1', '21')
          line.setAttribute('y1', '21')
          line.setAttribute('x2', '16.65')
          line.setAttribute('y2', '16.65')
          searchIcon.appendChild(circle)
          searchIcon.appendChild(line)
          search.appendChild(searchIcon)

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

      // Nav items normalization: "插件" -> "插件管理", preserve "定时任务", hide "更多"
      if (navigation && typeof navigation.querySelectorAll === 'function') {
        const navButtons = navigation.querySelectorAll<HTMLButtonElement>('button')
        for (const btn of navButtons) {
          replaceButtonText(btn, '插件', '插件管理')
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

      // Footer bar: left profile and right-side update, settings, and authentication controls.
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
            fallback.setAttribute('aria-label', '已登录')
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
              viewBox: '0 0 32 32',
              width: 28,
              height: 28,
              fill: 'none',
              class: 'dtd-harness-logo',
              'aria-label': 'DeepSeek Harness',
            })
            harnessLogo.appendChild(createSvgEl('rect', {
              width: 32,
              height: 32,
              rx: 8,
              fill: 'var(--dsw-alias-brand-primary, #286F78)',
            }))
            harnessLogo.appendChild(createSvgEl('path', {
              d: 'M8.5 18.8C11.2 18.8 13.4 16.6 15.6 13.9C17.2 11.8 19.3 10.8 21.5 10.8C20.6 12.7 19.3 14.5 17.7 15.6C19.8 15.6 21.6 14.9 22.5 13.8C21.6 17.4 18.8 20.1 15 20.1C11 20.1 8.5 17.7 8.5 18.8Z',
              fill: '#FFFFFF',
            }))
            harnessLogo.appendChild(createSvgEl('circle', {
              cx: 12,
              cy: 14,
              r: 1.5,
              fill: '#FFFFFF',
            }))
            avatarBox.appendChild(harnessLogo)
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
          const stateKey = signedIn ? '1' : '0'
          if (btn.getAttribute?.('data-signed-in') === stateKey) return
          btn.setAttribute('data-signed-in', stateKey)
          const label = signedIn
            ? '退出登录'
            : '登录'
          btn.title = label
          btn.setAttribute('aria-label', label)
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
            const directAuth = document.querySelector?.<HTMLElement>('[data-action="logout"], [data-action="login"], button[aria-label*="退出登录"]:not(.dtd-footer-btn), button[aria-label*="登录"]:not(.dtd-footer-btn)')
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
              showDeltaToast(signedInNow
                ? '已退出登录'
                : '请前往登录')
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
            const settingsPattern = new RegExp('设置|Settings', 'i')
            const otherActionPattern = new RegExp('反馈|Feedback|退出|Sign|Log', 'i')
            const authPattern = new RegExp('退出登录|登录|Sign\\s*(Out|In)|Log\\s*(Out|In)', 'i')
            if (kind === 'settings') {
              return candidates.find(el => settingsPattern.test(el.textContent ?? ''))
                ?? candidates.find(el => !otherActionPattern.test(el.textContent ?? ''))
                ?? candidates[0]
            }
            return candidates.find(el => authPattern.test(el.textContent ?? ''))
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
                showDeltaToast(signedInNow
                  ? '请点击登录账户菜单退出登录'
                  : '请前往登录')
              }
              return
            }
            silentMenuTimer = scheduleTimer(trySelect, 10)
          }
          trySelect()
        }

        const HAS_UPDATE_PHASES = new Set(['available', 'downloading', 'verifying', 'installing', 'ready', 'error'])
        const syncUpdateButtonState = (btn: HTMLButtonElement, container: HTMLElement): void => {
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

        // Right-side action buttons: update (when available), settings, and authentication.
        let actionsBox = footArea.querySelector?.<HTMLElement>('.dtd-footer-actions')
        if (!actionsBox) {
          actionsBox = document.createElement('div')
          actionsBox.className = 'dtd-footer-actions'

          // 1. Update notification (visible only when an update is available).
          const btnUpdate = document.createElement('button')
          btnUpdate.type = 'button'
          btnUpdate.className = 'dtd-footer-btn dtd-btn-update'
          btnUpdate.title = '更新通知'
          btnUpdate.setAttribute('aria-label', '更新通知')
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
                  showDeltaToast('当前已是最新版本')
                }).finally(() => {
                  updateBusy = false
                })
              } catch {
                updateBusy = false
                showDeltaToast('当前已是最新版本')
              }
              return
            }
            const liveFoot = document.querySelector?.<HTMLElement>('[class*="wtg9ga_footArea"], [class*="footArea"]')
            const nativeUpdate = liveFoot?.querySelector?.<HTMLElement>('button[class*="VUhOWa_indicator"], [class*="VUhOWa_indicator"] button, button[aria-label*="更新"], button[aria-label*="Update" i], button[class*="update" i]')
            if (nativeUpdate && !nativeUpdate.classList?.contains('dtd-footer-btn')) {
              nativeUpdate.click()
            } else {
              showDeltaToast('当前已是最新版本')
            }
          })
          syncUpdateButtonState(btnUpdate, footArea)

          // 2. Settings.
          const btnSettings = document.createElement('button')
          btnSettings.type = 'button'
          btnSettings.className = 'dtd-footer-btn dtd-btn-settings'
          btnSettings.title = '设置'
          btnSettings.setAttribute('aria-label', '设置')
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

          // 3. Sign in/out.
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
                node.nodeValue = node.nodeValue.split('深度求索中').join('任务执行中')
              }
              node = walker.nextNode()
            }
          }
        }
      }

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
  observer?.observe(document.body ?? root, { subtree: true, childList: true })

  const onMouseOver = (e: Event): void => {
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest?.('[class*="hoverContent"], [class*="SessionHoverContent"], [class*="_card_bgejw"], [data-row-key^="session:"]')) {
      processHoverCards()
    }
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('mouseover', onMouseOver, { capture: true, passive: true })
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
  const searchIcon = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    : document.createElement('svg')
  searchIcon.setAttribute('viewBox', '0 0 24 24')
  searchIcon.setAttribute('width', '15')
  searchIcon.setAttribute('height', '15')
  searchIcon.setAttribute('fill', 'none')
  searchIcon.setAttribute('stroke', 'currentColor')
  searchIcon.setAttribute('stroke-width', '2')
  searchIcon.setAttribute('stroke-linecap', 'round')
  searchIcon.setAttribute('stroke-linejoin', 'round')
  searchIcon.setAttribute('class', 'dtd-search-icon')
  const sCircle = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    : document.createElement('circle')
  sCircle.setAttribute('cx', '11')
  sCircle.setAttribute('cy', '11')
  sCircle.setAttribute('r', '8')
  const sLine = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', 'line')
    : document.createElement('line')
  sLine.setAttribute('x1', '21')
  sLine.setAttribute('y1', '21')
  sLine.setAttribute('x2', '16.65')
  sLine.setAttribute('y2', '16.65')
  searchIcon.appendChild(sCircle)
  searchIcon.appendChild(sLine)
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
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true },
        el('line', { x1: 4, y1: 7, x2: 20, y2: 7 }),
        el('circle', { cx: 9, cy: 7, r: 2, fill: 'currentColor' }),
        el('line', { x1: 4, y1: 17, x2: 20, y2: 17 }),
        el('circle', { cx: 15, cy: 17, r: 2, fill: 'currentColor' }))
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
        el('header', { className: 'dtd-page-head' },
          el('div', { className: 'dtd-heading-group' },
            el('span', { className: 'dtd-mark', 'aria-hidden': true }, 'Δ'),
            el('div', null,
              el('h2', null, copy.meta.title),
              el('p', null, copy.ui.personalizationDescription))),
          el('span', { className: 'dtd-enabled', role: 'status' }, copy.ui.enabled)),
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
        state.error ? el('p', { role: 'alert', className: 'dtd-error' }, copy.ui.unavailable) : null,
        el('p', { className: 'dtd-recovery' }, copy.ui.recovery),
        el('p', { className: 'dtd-capability' }, copy.ui.hostOwned))
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
                  const origZhValues: Record<string, string | undefined> = {}
                  const attachLocalePatch = (localeRuntime: any): void => {
                    if (!localeRuntime || localeRuntime.__deltaLocaleAttached) return
                    localeRuntime.__deltaLocaleAttached = true
                    const syncLocaleDict = (notify: boolean): void => {
                      const chatLocales = localeRuntime.dicts?.get?.('chat')
                      const zhDict = chatLocales?.get?.('zh')
                      if (zhDict) {
                        for (const key of ['chat.deepDiving', 'chat.deepDivingFor'] as const) {
                          if (!(key in origZhValues)) origZhValues[key] = zhDict[key]
                        }
                        if (!effectDisposed && controller.getSnapshot().mode === 'delta') {
                          zhDict['chat.deepDiving'] = '任务执行中'
                          zhDict['chat.deepDivingFor'] = '任务执行中，用时 {duration} ···'
                        } else {
                          for (const key of ['chat.deepDiving', 'chat.deepDivingFor'] as const) {
                            if (origZhValues[key] !== undefined) zhDict[key] = origZhValues[key]
                            else delete zhDict[key]
                          }
                        }
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
                        if (!effectDisposed && controller.getSnapshot().mode === 'delta' && ns === 'chat') {
                          if (key === 'chat.deepDiving') return '任务执行中'
                          if (key === 'chat.deepDivingFor') {
                            const template = '任务执行中，用时 {duration} ···'
                            if (!params) return template
                            return template.replace(/\{(\w+)\}/g, (match: string, name: string) => name in params ? String(params[name]) : match)
                          }
                        }
                        return origTranslate.apply(this, arguments)
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

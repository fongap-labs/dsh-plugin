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
interface ReactApi {
  createElement(type: string | ((props: DeltaProps) => unknown), props: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (value: T | ((state: T) => T)) => void]
  useSyncExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T
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

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
    searchSessions: string; newConversation: string; pluginManagement: string; scheduledTasks: string; searching: string; noResults: string;
    searchReady: string; searchWaitingServices: string; searchWaitingSidebar: string; searchDisabled: string;
    workspaceResult: string; archivedSession: string; sessionStateUnknown: string;
    sessionRunning: string; sessionArchived: string;
    copied: string; copyFailed: string;
  }
}
type Language = 'zh' | 'en'
type Mode = 'delta' | 'official'
type SearchStatus = 'waiting-services' | 'waiting-sidebar' | 'active' | 'disabled'
type DeltaState = Readonly<{
  mode: Mode; language: Language; error: boolean; searchStatus: SearchStatus;
  createAllowed: boolean; revision: number
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
      byId: Record<string, { id: string; title?: string; blank?: boolean; running?: boolean }>
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
    createAllowed: false, revision: 0 })
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
      if (!success) { publish({ error: true }); return }
      writeMode(mode)
      publish({ mode, error: false, searchStatus: mode === 'official' ? 'disabled' : 'waiting-services' })
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
      publish({ error: !applyPalette(snapshot.mode) })
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
  sessions: SearchSessionsApi,
  navigation: SearchNavigationApi,
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
  shell.append(searchField, quickActions, feedback, results)
  let isDisposed = false
  let timer: number | undefined
  let pending: AbortController | undefined
  let serial = 0
  let remoteItems: { sessionId: string; snippet: string }[] = []
  let isSearching = false
  let hasError = false
  const active = (): boolean => !isDisposed && controller.getSnapshot().mode === 'delta' && shell.isConnected
  const workspaceReady = (snapshot: ReturnType<WorkspacesApi['list']['getSnapshot']>): boolean =>
    (snapshot.phase === undefined || snapshot.phase === 'ready') &&
    (snapshot.state === undefined || snapshot.state === 'idle')
  // Native WorkspaceBrowser's guardedOpen forbids archived Sessions. The public
  // Workspace snapshot is authoritative; missing or loading metadata fails closed.
  const sessionOpenability = (sessionId: string): 'allowed' | 'archived' | 'unknown' => {
    const workspaces = getWorkspaces()
    if (!workspaces) return 'unknown'
    try {
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
  const render = (): void => {
    results.replaceChildren()
    const query = input.value.trim().toLocaleLowerCase()
    if (!query || !active()) { results.hidden = true; return }
    results.hidden = false
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    // Workspaces are an optional read-only enhancement. No filesystem paths, IDs,
    // permissions, or private viewing-store keys are exposed in search results.
    const workspaceMatches: { id: string; title: string }[] = []
    const workspaceApi = getWorkspaces()
    if (workspaceApi && typeof navigation.openWorkspace === 'function') {
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
    const sessionSnapshot = sessions.list.getSnapshot()
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
        if (!active() || typeof navigation.openWorkspace !== 'function') return
        clearRequest()
        isSearching = false
        const navigationRequest = serial
        try {
          void Promise.resolve(navigation.openWorkspace(workspace.id)).then(() => {
            if (!active() || serial !== navigationRequest) return
            input.value = ''
            clearRequest()
            remoteItems = []
            hasError = false
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
      const running = sessionSnapshot.phase !== 'pending' && currentSessions[match.id]?.running === true
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
          feedback.hidden = true
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
    if (query) {
      isSearching = true
      const requestId = serial
      const aborter = new AbortController()
      pending = aborter
      timer = window.setTimeout(() => {
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
      navigation.startSession()
    }))
  input.addEventListener('input', () => {
    feedback.hidden = true
    onInput()
  })
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    input.value = ''
    onInput()
    input.blur()
  })
  const sync = (): void => {
    if (isDisposed) return
    if (controller.getSnapshot().mode !== 'delta') {
      clearRequest()
      input.value = ''
      remoteItems = []
      isSearching = false
      hasError = false
      feedback.hidden = true
      results.hidden = true
      results.replaceChildren()
      shell.remove()
      root.removeAttribute('data-delta-search-adapter')
      controller.setSearchStatus('disabled')
      return
    }
    const copy = (DICTIONARIES[language()] ?? DICTIONARIES.en).ui
    input.placeholder = copy.searchSessions
    input.setAttribute('aria-label', copy.searchSessions)
    results.setAttribute('aria-label', copy.searchSessions)
    pluginsButton.textContent = copy.pluginManagement
    schedulesButton.textContent = copy.scheduledTasks
    newSessionButton.textContent = copy.newConversation
    newSessionButton.hidden = !controller.getSnapshot().createAllowed
    newSessionButton.disabled = !controller.getSnapshot().createAllowed
    const viewport = document.querySelector<HTMLElement>('[data-sidebar-scrollport]')
    // The Host only renders <nav> when it has main-panel entries; search must
    // still work with no panels, above the unchanged workspace browsing region.
    if (!viewport) {
      shell.remove()
      root.setAttribute('data-delta-search-adapter', 'waiting-for-sidebar')
      controller.setSearchStatus('waiting-sidebar')
      return
    }
    if (shell.parentElement !== viewport || viewport.firstElementChild !== shell) {
      viewport.insertBefore(shell, viewport.firstElementChild)
    }
    root.setAttribute('data-delta-search-adapter', 'active')
    controller.setSearchStatus('active')
  }
  // Workspace Controller notifications update matches without replacing Host controls.
  bindWorkspaceRefresh(() => { if (active()) render() })
  const unsubscribeSessions = typeof sessions.list.subscribe === 'function'
    ? sessions.list.subscribe(() => { if (active()) render() }) : undefined
  const observer = new MutationObserver(sync)
  observer.observe(document.body ?? root, { subtree: true, childList: true })
  const unsubscribe = controller.subscribe(sync)
  sync()
  return () => {
    if (isDisposed) return
    isDisposed = true
    clearRequest()
    unsubscribe()
    unsubscribeSessions?.()
    observer.disconnect()
    bindWorkspaceRefresh(undefined)
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
    // This extension uses an existing native row-hover seat. Host-owned
    // activity state and timestamps remain authoritative and are not duplicated.
    function SessionHoverDetail({ sessionId }: SessionHoverProps): unknown {
      const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId
      const copy = DICTIONARIES[language()] ?? DICTIONARIES.en
      const label = copy.ui.sessionId
      return el('div', { className: 'dtd-session-meta' },
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
        el('p', { className: 'dtd-capability' }, copy.ui.hostOwned),
        el('p', { className: 'dtd-capability', role: 'status',
          'data-delta-search-status': state.searchStatus },
          state.searchStatus === 'active' ? copy.ui.searchReady
            : state.searchStatus === 'waiting-sidebar' ? copy.ui.searchWaitingSidebar
              : state.searchStatus === 'disabled' ? copy.ui.searchDisabled
                : copy.ui.searchWaitingServices))
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
              }, props => controller.getSnapshot().mode === 'delta' ? SessionHoverDetail(props) : null))
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
              // Native search and navigation are optional Host services, not synthetic DOM commands.
              // They mount only once both services exist and never block the Settings or Theme.
              scope.inject(['sessions', 'uiWorkspace'], searchScope => {
                if (!searchScope.sessions || !searchScope.uiWorkspace ||
                    typeof searchScope.sessions.search !== 'function' ||
                    typeof searchScope.sessions.list?.getSnapshot !== 'function' ||
                    typeof searchScope.uiWorkspace.openSession !== 'function' ||
                    typeof searchScope.uiWorkspace.startSession !== 'function') return
                searchScope.effect(() => installHostSearch(
                  controller, searchScope.sessions!, searchScope.uiWorkspace!,
                  () => workspaceService, refresh => { refreshWorkspaceResults = refresh },
                ), 'dsh-delta-desktop: native service-backed sidebar search')
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

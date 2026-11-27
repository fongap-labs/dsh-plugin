/** Delta UI appearance state and native layout commands. The public Theme
 * service and scoped CSS fallback share one reversible palette owner.
 */
const STORAGE_SLOT = 'fongap.delta-ui.v1'
function readMode(): Mode {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_SLOT) ?? 'null') as unknown
    if (value !== null && typeof value === 'object' && 'schema' in value &&
        'mode' in value && value.schema === 1 &&
        (value.mode === 'delta' || value.mode === 'official')) return value.mode
  } catch { /* storage is optional */ }
  return 'delta'
}
function writeMode(mode: Mode): void {
  try { localStorage.setItem(STORAGE_SLOT, JSON.stringify({ schema: 1, mode })) }
  catch { /* session-only preference when storage is blocked */ }
}

function createController(): DeltaController {
  let snapshot: DeltaState = Object.freeze({ mode: readMode(), language: language(), error: false, revision: 0 })
  let ownedLayer: (() => void) | undefined
  let activeTheme: ThemeApi | undefined
  let appliedMode: Mode | undefined
  let activeLayout: LayoutApi | undefined
  let activeSidebarRight: SidebarRightApi | undefined
  let isDisposed = false
  const listeners = new Set<() => void>()
  const publish = (change: Partial<Omit<DeltaState, 'revision'>>): void => {
    if (isDisposed) return
    snapshot = Object.freeze({ ...snapshot, ...change, revision: snapshot.revision + 1 })
    listeners.forEach(listener => {
      try { listener() } catch { /* a failed view must not block sibling subscribers */ }
    })
  }
  const releasePalette = (): boolean => {
    try {
      ownedLayer?.()
      ownedLayer = undefined
      return true
    } catch { return false }
  }
  const applyPalette = (mode: Mode): boolean => {
    appliedMode = undefined
    if (!releasePalette()) return false
    if (mode === 'official') { appliedMode = mode; return true }
    try {
      if (!activeTheme || typeof activeTheme.overrideTokens !== 'function') {
        ownedLayer = installClientThemeFallback()
        if (typeof ownedLayer !== 'function') return false
        appliedMode = mode
        return true
      }
      // Do not install a second layer if the public API throws or cannot
      // provide a disposer: it may already have mutated the Host cascade.
      const release = activeTheme.overrideTokens(DELTA_UI_OWNER, TOKENS)
      if (typeof release !== 'function') return false
      ownedLayer = release
      appliedMode = mode
      return true
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
    isActive: () => !isDisposed,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (isDisposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setMode: (mode) => {
      if (isDisposed || (mode !== 'delta' && mode !== 'official')) return
      if (mode === snapshot.mode && appliedMode === mode) {
        if (snapshot.error) publish({ error: false })
        return
      }
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
      releasePalette()
      ownedLayer = undefined
      appliedMode = undefined
      activeTheme = undefined
      activeLayout = undefined
      activeSidebarRight = undefined
      listeners.clear()
    },
    // Used by the owning activation to sync a host language switch.
    syncLanguage: () => {
      const next = language()
      if (next !== snapshot.language) publish({ language: next })
    },
    activate: () => {
      if (isDisposed || appliedMode === snapshot.mode) return
      if (!applyPalette(snapshot.mode)) publish({ error: true })
    },
    bindTheme: (theme: ThemeApi | undefined) => {
      if (isDisposed) return
      if (theme === activeTheme && appliedMode === snapshot.mode) return
      activeTheme = theme
      if (snapshot.mode === 'official' && appliedMode === 'official') return
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


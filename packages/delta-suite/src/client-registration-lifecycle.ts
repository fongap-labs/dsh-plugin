/** Synchronous rollback for a group of public browser registrations.
 * Cordis owns the group lifetime; this helper owns only returned disposers.
 */
function registerClientFeatureGroup(install: (track: (release: unknown) => void) => void): () => void {
  const releases: Array<() => void> = []
  let isDisposed = false
  const dispose = (): void => {
    if (isDisposed) return
    isDisposed = true
    for (let index = releases.length - 1; index >= 0; index--) {
      try { releases[index]() } catch { /* continue releasing sibling registrations */ }
    }
    releases.length = 0
  }
  const track = (release: unknown): void => {
    // Older public Slot APIs may not return a disposer. Their registrations
    // remain Cordis-owned; do not invent a private removal mechanism.
    if (typeof release === 'function') releases.push(release as () => void)
  }
  try {
    install(track)
    return dispose
  } catch (error) {
    dispose()
    throw error
  }
}

/** Give each public service binding its own generation, even for the same service object. */
function createClientBindingLifetime() {
  let generation = 0
  return (install: () => void, clear: () => void) => {
    const token = ++generation
    let isActive = true
    const isCurrent = (): boolean => isActive && token === generation
    const dispose = (): void => {
      if (!isActive) return
      const shouldClear = isCurrent()
      isActive = false
      if (shouldClear) clear()
    }
    try { install() }
    catch (error) {
      try { dispose() } catch { /* preserve the installation error */ }
      throw error
    }
    return { isCurrent, dispose }
  }
}

/** Scoped reversible attribute Patch. Restore only values still owned by this activation. */
function createClientAppearancePatch() {
  const originals = new Map<Element, string | null>()
  const attribute = 'data-delta-ui'
  const value = 'delta'
  let isDisposed = false
  const restore = (target: Element): void => {
    if (!originals.has(target)) return
    const previous = originals.get(target)
    originals.delete(target)
    try {
      if (target.getAttribute(attribute) !== value) return
      if (previous == null) target.removeAttribute(attribute)
      else target.setAttribute(attribute, previous)
    } catch { /* detached or unavailable target must not block sibling cleanup */ }
  }
  const sync = (isEnabled: boolean): void => {
    if (isDisposed) return
    const targets = new Set<Element>()
    if (isEnabled && typeof document !== 'undefined') {
      if (document.documentElement) targets.add(document.documentElement)
      if (document.body) targets.add(document.body)
    }
    for (const target of originals.keys()) {
      if (!targets.has(target)) restore(target)
    }
    for (const target of targets) {
      try {
        const previous = target.getAttribute(attribute)
        if (originals.has(target) || previous === value) continue
        target.setAttribute(attribute, value)
        originals.set(target, previous ?? null)
      } catch { /* optional presentation only; never interrupt native services */ }
    }
  }
  return {
    sync,
    dispose: () => {
      if (isDisposed) return
      sync(false)
      isDisposed = true
    },
  }
}

/** Expanded SidebarRoot compatibility: preserve native nodes and scroll handoff.
 * The Host exposes a scrollport marker and a workspace Slot, but no public
 * setting to keep its panel navigation fixed. Match both structural anchors;
 * unknown markup keeps the original grid. CSS applies to remounted nodes.
 */
function installClientSidebarLayoutPatch(): () => void {
  if (typeof document === 'undefined' || !document.head || typeof CSS === 'undefined' ||
      typeof CSS.supports !== 'function') return () => {}
  const region = '[data-sidebar-scrollport]:has(> nav + div [data-slot="sidebar.workspaces"])'
  const scope = ':root[data-delta-ui="delta"] ' + region
  if (!CSS.supports('selector(' + region + ')') ||
      !CSS.supports('container-type', 'size') ||
      !CSS.supports('grid-template-rows', '8px max-content 2px minmax(0, 1fr)')) return () => {}
  const style = document.createElement('style')
  style.dataset.deltaSidebarLayout = ''
  // Keep the panel list at its original grid position. The workspace gets
  // the remaining height and becomes the nearest height-query container.
  // Its own native list scroller and cqh sizing continue to own scrolling.
  style.textContent = scope + ' { grid-template-rows: 8px max-content 2px minmax(0, 1fr); }\n' +
    scope + ' > nav + div:has([data-slot="sidebar.workspaces"]) { container-type: size; min-height: 0; }'
  // SidebarRoot renders the native session action outside the panel scrollport.
  // Use nested subgrids to reserve its row BETWEEN the entire native panel
  // list and the workspace. Keep React's DOM ownership and native events.
  // The public sidebar.panellist registry already sorts plugins (0),
  // schedules (10), and other registrations by order. Every registered panel
  // stays in the same nav track regardless of later registration/removal.
  const panel = 'div:has(> nav + div > [data-slot="sidebar.workspaces"])'
  const session = 'div:has(> [data-slot="sidebar.session.action"])'
  const shell = ':root[data-delta-ui="delta"] div:has(> [data-window-drag] + ' + session + ' + div > ' + panel + ')'
  const scrollRegion = shell + ' > ' + session + ' + div'
  const scrollArea = scrollRegion + ' > ' + panel
  if (CSS.supports('grid-template-rows', 'subgrid') && CSS.supports('selector(' + shell + ')')) {
    style.textContent += '\n' + [
      shell + ' { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto auto auto minmax(0, 1fr) auto; }',
      shell + ' > [data-window-drag]:has(+ [data-window-drag]) { grid-area: 1 / 1; }',
      shell + ' > [data-window-drag]:has(+ ' + session + ') { grid-area: 2 / 1; }',
      shell + ' > ' + session + ' { grid-area: 4 / 1; position: relative; z-index: 1; }',
      scrollRegion + ' { display: grid; grid-area: 3 / 1 / 6 / 2; grid-template-rows: subgrid; grid-template-columns: minmax(0, 1fr); container-type: normal; margin-top: 0; min-height: 0; }',
      scrollArea + ' { display: grid; grid-row: 1 / 4; grid-template-rows: subgrid; min-height: 0; }',
      scrollArea + ':not([data-sidebar-scrollport]) { grid-template-columns: minmax(0, 1fr); }',
      scrollArea + '::before, ' + scrollArea + '::after { content: none; }',
      scrollArea + ' > nav { grid-row: 1; }',
      scrollArea + ' > nav + div { grid-row: 3; container-type: size; min-height: 0; }',
      scrollArea + ':not([data-sidebar-scrollport]) > nav, ' + scrollArea + ':not([data-sidebar-scrollport]) > nav + div { grid-column: 1; }',
      shell + ' > div:has([data-slot="sidebar.settings"]):has([data-slot="sidebar.footer.action"]) { grid-area: 6 / 1; }',
    ].join('\n')
  }
  try {
    document.head.appendChild(style)
  } catch {
    try { style.parentNode?.removeChild(style) } catch {}
    return () => {}
  }
  return () => { style.parentNode?.removeChild(style) }
}

/** Theme fallback only for a missing public overrideTokens capability.
 * Use the same palette and the documented Host body color-scheme marker.
 * No inline style changes, preference writes, forced priority or observers.
 * Confirm representative computed tokens before reporting success.
 */
function installClientThemeFallback(): (() => void) | undefined {
  if (typeof document === 'undefined' || !document.head || !document.body ||
      !document.defaultView || typeof document.defaultView.getComputedStyle !== 'function') return
  const root = document.documentElement
  const body = document.body
  const preference = root?.getAttribute('data-ds-theme-source')
  if (preference !== 'light' && preference !== 'dark' && preference !== 'system') return
  const style = document.createElement('style')
  style.dataset.deltaThemeFallback = ''
  const declarations = (mode: 'light' | 'dark'): string => Object.entries(TOKENS)
    .map(([name, pair]) => name + ':' + pair[mode] + ';').join('')
  const selector = 'html[data-ds-theme-source] > body'
  style.textContent = selector + ':not([data-ds-dark-theme]){' + declarations('light') + '}\n' +
    selector + '[data-ds-dark-theme]{' + declarations('dark') + '}'
  const release = (): void => { style.parentNode?.removeChild(style) }
  try {
    document.head.appendChild(style)
    const scheme = body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
    const computed = document.defaultView.getComputedStyle(body)
    const samples = ['--dsw-alias-brand-primary', '--dsw-alias-label-primary', '--dsw-menu-surface-fill']
    if (samples.every(key => computed.getPropertyValue(key).trim().toLowerCase() === TOKENS[key][scheme].toLowerCase())) {
      return release
    }
  } catch { /* unknown Host cascade or unavailable document: fail closed */ }
  try { release() } catch {}
  return undefined
}

/** Narrow read-only Patch for older Hosts: observe only the document language attribute.
 * No subtree scanning, mutations, polling, or Host preference writes.
 */
function createClientLocaleFallback(sync: () => void) {
  let observer: MutationObserver | undefined
  let isDisposed = false
  let generation = 0
  const stop = (): void => {
    generation++
    const previous = observer
    observer = undefined
    try { previous?.disconnect() } catch { /* optional compatibility path */ }
  }
  const start = (): void => {
    if (isDisposed || observer) return
    const token = ++generation
    try {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.documentElement) return
      observer = new MutationObserver(() => {
        if (!isDisposed && token === generation) sync()
      })
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    } catch { stop() }
  }
  return { start, stop, dispose: () => { isDisposed = true; stop() } }
}

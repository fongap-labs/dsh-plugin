import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const file = path => fileURLToPath(new URL('../' + path, import.meta.url))
// Compile into an isolated directory. TypeScript 7's native compiler no longer
// exports the legacy transpileModule API; concurrent node --test workers must
// not overwrite the real package's lib/client.js during finalize-client.
const compileDir = mkdtempSync(join(tmpdir(), 'delta-search-'))
let compiled
try {
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
    file('packages/dsh-delta-suite/tsconfig.client.json'), '--outDir', compileDir], { stdio: 'pipe' })
  compiled = readFileSync(join(compileDir, 'client.js'), 'utf8')
} finally { rmSync(compileDir, { recursive: true, force: true }) }
const locales = Object.fromEntries(['en', 'zh'].map(lang =>
  [lang, JSON.parse(readFileSync(file('packages/dsh-delta-suite/locale/' + lang + '.json'), 'utf8'))]))
assert.equal(compiled.split("'__DELTA_SUITE_LOCALES__'").length, 2)
assert.equal(compiled.split("'__DELTA_SUITE_STYLE__'").length, 2)
const source = compiled.replace("'__DELTA_SUITE_LOCALES__'", JSON.stringify(locales))
  .replace("'__DELTA_SUITE_STYLE__'", JSON.stringify(
    readFileSync(file('packages/dsh-delta-suite/src/theme.css'), 'utf8')))

class Element {
  constructor(tag) {
    this.tagName = tag
    this.parentElement = null
    this.children = []
    this.attrs = new Map()
    this.listeners = new Map()
    this.dataset = {}
    this.textContent = ''
    this.value = ''
    this.hidden = false
    this.lang = 'zh-CN'
    this.focused = false
  }
  get isConnected() { return this.parentElement !== null }
  get firstElementChild() { return this.children[0] ?? null }
  get nextElementSibling() {
    if (!this.parentElement) return null
    return this.parentElement.children[this.parentElement.children.indexOf(this) + 1] ?? null
  }
  setAttribute(key, value) { this.attrs.set(key, value) }
  getAttribute(key) { return this.attrs.get(key) ?? null }
  removeAttribute(key) { this.attrs.delete(key) }
  appendChild(node) { node.remove(); node.parentElement = this; this.children.push(node); return node }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)) }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null }); this.children = []; this.append(...nodes) }
  insertBefore(node, before) {
    node.remove()
    const index = this.children.indexOf(before)
    this.children.splice(index < 0 ? this.children.length : index, 0, node)
    node.parentElement = this
  }
  remove() {
    if (!this.parentElement) return
    this.parentElement.children = this.parentElement.children.filter(node => node !== this)
    this.parentElement = null
  }
  addEventListener(type, fn) { this.listeners.set(type, fn) }
  emit(type, args = {}) { this.listeners.get(type)?.({ type, ...args }) }
  blur() { this.focused = false }
  focus() { this.focused = true }
  querySelector(selector) {
    if (selector === 'nav') return this.children.find(item => item.tagName === 'nav') ?? null
    return null
  }
}

test('service-backed Search Palette uses public composer Slot without native sidebar injection', async () => {
  const root = new Element('html')
  const body = new Element('body')
  root.appendChild(body)
  const viewport = new Element('div')
  const nav = new Element('nav')
  viewport.appendChild(nav)
  const nativeWorkspace = new Element('section')
  viewport.appendChild(nativeWorkspace)
  const head = new Element('head')
  const callbacks = []
  const timers = new Map()
  let timerId = 0
  let registered
  const inserted = []
  const actions = []
  let archivedSessionIds = []
  let protectionState = { hasPin: false, lockMode: 'none', deletedSessionIds: [], lockedSessionIds: [], lockedWorkspaceIds: [], movedSessions: {} }
  let workspacePhase = 'ready'
  let workspaceState = 'idle'
  let workspaceTitle = 'Design Workspace'
  let refreshWorkspaces = () => {}
  const sessionListeners = new Set()
  const hoverSignals = []
  const hoverDisposers = []
  const refreshSessions = () => { for (const listener of [...sessionListeners]) listener() }
  let sessionRunning = false
  let nextNativeSearch
  let sessionPhase = 'ready'
  let isSessionSnapshotUnavailable = false
  let mainSession = 'local'
  let currentDraft = { draft: '', draftRev: 0, phase: 'plain', attachmentIds: [], occurrences: [] }
  let composerBlocked = false
  let composerAccess = true
  let runCommandEffects = false
  const commandSlotEffects = []
  const accessWatchers = new Set()
  const setComposerAccess = allowed => {
    composerAccess = allowed
    for (const watcher of accessWatchers) watcher(allowed)
  }
  const hostUiSession = {
    whenAccess(sessionId, action, install) {
      assert.equal(sessionId, 'local')
      assert.equal(action, 'session/prompt')
      let remove = composerAccess ? install() : undefined
      const watcher = allowed => {
        if (allowed && !remove) remove = install()
        else if (!allowed && remove) { remove(); remove = undefined }
      }
      accessWatchers.add(watcher)
      return () => { accessWatchers.delete(watcher); remove?.() }
    },
  }
  let generation = { ctx: { sessionId: 'local' }, session: {
    getSnapshot: () => ({ sessionId: 'local', removed: false, subagent: null, openState: 'open' }),
  } }
  const hostConversation = {
    blocks: { storeFor: () => ({ getSnapshot: () => composerBlocked ? { reason: 'blocked' } : undefined }) },
    input: { for: () => ({ state: { getSnapshot: () => currentDraft } }) },
  }
  const nativeInputActions = {
    captureInsertion: () => ({ start: 0, end: 0, draftRev: currentDraft.draftRev }),
    insertText(text, span) {
      actions.push(['insert-command', text, span.draftRev])
      return true
    },
  }
  const hostWorkspaces = {
    list: {
      getSnapshot: () => ({ phase: workspacePhase, state: workspaceState, archivedSessionIds, items: [
        { workspaceId: 'design', title: workspaceTitle, path: 'C:\\Users\\private\\secret', sessionIds: ['local'] },
      ] }),
      subscribe(callback) { refreshWorkspaces = callback; return () => { refreshWorkspaces = () => {} } },
    },
    async delete() { throw new Error('workspace deletion is Host-owned') },
  }
  let workspaceNavigationFails = false
  let revokeSessionCreate = () => {}
  let grantSessionCreate = () => {}
  const hostSessions = {
    list: {
      getSnapshot: () => {
        if (isSessionSnapshotUnavailable) throw new Error('Session catalog reconnecting')
        return { phase: sessionPhase,
          byId: { local: { id: 'local', title: 'Example Session', running: sessionRunning, updatedAt: 1760000000000, retainedBy: { mainView: mainSession === 'local' ? 1 : 0 } } } }
      },
      subscribe(callback) {
        sessionListeners.add(callback)
        return () => { sessionListeners.delete(callback) }
      },
    },
    binding: id => id === 'local' ? generation : undefined,
    search: async (query, signal) => {
      actions.push(['search', query])
      assert.equal(signal.aborted, false)
      if (nextNativeSearch) {
        const task = nextNativeSearch
        nextNativeSearch = undefined
        return task(signal)
      }
      return { ok: true, value: { items: [{ sessionId: 'remote', snippet: 'Example content match' }], hasMore: false } }
    },
  }
  const ctx = {
    get(name) { return name === 'conversation' ? hostConversation : name === 'uiSession' ? hostUiSession : name === 'workspaces' ? hostWorkspaces : undefined },
    theme: { overrideTokens() { return () => {} } },
    layout: { toggleSidebar() {}, selectPanel(id) { actions.push(['panel', id]) } },
    sessions: hostSessions,
    workspaces: hostWorkspaces,
    remoteAccess: {
      whenAccess(action, install) {
        assert.equal(action, 'session/create')
        let uninstall = install()
        revokeSessionCreate = () => { uninstall?.(); uninstall = undefined }
        grantSessionCreate = () => { uninstall = install() }
        return () => { uninstall?.(); uninstall = undefined }
      },
    },
    uiWorkspace: {
      openSession(id) { actions.push(['open', id]) },
      startSession() { actions.push(['new-session']) },
      openWorkspace(id) {
        actions.push(['workspace', id])
        return workspaceNavigationFails ? Promise.reject(new Error('Host refused')) : Promise.resolve()
      },
    },
    inject(_names, fn) { fn(ctx) },
    effect(create) { const cleanup = create(); if (typeof cleanup === 'function') callbacks.push(cleanup) },
    slots: {
      inject(_slot, callback) { const cleanup = callback(); if (typeof cleanup === 'function') callbacks.push(cleanup) },
      register(spec, component) { inserted.push([spec, component]); return () => {} },
    },
  }
  const doc = {
    documentElement: root, body,
    head: { appendChild(tag) { tag.parentNode = { removeChild() {} } } },
    createElement(tag) { return new Element(tag) },
    createTextNode(text) { const node = new Element('#text'); node.textContent = text; return node },
    querySelector(selector) { return selector === '[data-sidebar-scrollport]' && body.children.includes(viewport) ? viewport : null },
  }
  const env = {
    window: { __ModuleLoader__: { load(entry) { registered = entry } },
      setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id },
      clearTimeout(id) { timers.delete(id) } },
    document: doc,
    navigator: { language: 'zh-CN' },
    localStorage: { getItem() { return null }, setItem() {} },
    MutationObserver: class { constructor(callback) { this.callback = callback; env.observers.push(callback) } observe() {} disconnect() {} },
    observers: [],
    AbortController,
  }
  const originalSessionSnapshot = hostSessions.list.getSnapshot
  const originalSessionSubscribe = hostSessions.list.subscribe
  vm.runInNewContext(source + '\n;globalThis.testFeatures = deltaFeatures', env)
  const plugin = registered.factory(() => ({
    createElement(type, props, ...children) { return { type, props, children } },
    useState(initial) { return [initial, () => {}] },
    useRef(value) { return { current: value } },
    useEffect(create) {
      if (!runCommandEffects) return
      const cleanup = create()
      if (typeof cleanup === 'function') commandSlotEffects.push(cleanup)
    },
    useSyncExternalStore(subscribe, read) {
      const snapshot = read()
      if (typeof snapshot === 'string') {
        hoverDisposers.push(subscribe(() => { hoverSignals.push(read()) }))
      }
      return snapshot
    },
  }))
  const windowKeyHandlers = new Map()
  env.window.addEventListener = (name, callback) => windowKeyHandlers.set(name, callback)
  env.window.removeEventListener = name => windowKeyHandlers.delete(name)
  plugin.apply(ctx)
  env.window.location = { href: 'https://harness.test/' }
  env.fetch = async path => ({
    ok: !path.includes('/session-search'), status: path.includes('/session-search') ? 503 : 200,
    json: async () => path === '/api/delta-suite/state' ? { state: protectionState } : {},
  })
  await env.testFeatures.refreshState()
  assert.equal(hostSessions.list.getSnapshot, originalSessionSnapshot, 'Host snapshot method is not wrapped')
  assert.equal(hostSessions.list.subscribe, originalSessionSubscribe, 'Host subscription method is not wrapped')
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  body.appendChild(viewport)
  // No sidebar observer is installed: this test must not dispatch Host DOM mutations.
  assert.equal(viewport.children[0], nav, 'Host navigation retains its position')
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(viewport.children.length, 2, 'no Delta search shell inserted into Host sidebar')
  const paletteSlot = inserted.find(([spec]) => spec.id === 'delta.search.palette')
  assert.ok(paletteSlot, 'public composer Slot contributes Search Palette entry')
  const openGeneralPalette = () => {
    const entry = paletteSlot[1]()
    assert.equal(entry.type, 'button')
    entry.props.onClick()
    const overlay = body.children.find(node => node.className === 'dtd-search-backdrop')
    assert.ok(overlay)
    return overlay.children[0]
  }
  const generalDialog = openGeneralPalette()
  assert.equal(generalDialog.children[1].children.length, 7)
  assert.equal(windowKeyHandlers.has('keydown'), false, 'Host owns global shortcut')
  generalDialog.emit('keydown', { key: 'Escape', preventDefault() {} })
  assert.equal(body.children.some(node => node.className === 'dtd-search-backdrop'), false)

  const commandSlot = inserted.find(([spec]) => spec.id === 'delta.search.composer-commands')
  assert.ok(commandSlot, 'only a public session-scope slot contributes the command entry')
  const props = {
    sessionId: 'local',
    inputActions: nativeInputActions,
    useInput: select => select(currentDraft),
    useAccess: () => composerAccess,
  }
  const wrapper = commandSlot[1]
  assert.equal(wrapper({ sessionId: 'local' }), null, 'legacy Host props stay copy-only')
  const renderCommandEntry = () => {
    commandSlotEffects.splice(0).forEach(dispose => dispose())
    const element = wrapper(props)
    runCommandEffects = true
    try { return element && element.type(element.props) }
    finally { runCommandEffects = false }
  }
  const flushCatalog = async () => { await new Promise(resolve => setImmediate(resolve)) }
  const openCommandPicker = async () => {
    const entry = renderCommandEntry()
    assert.equal(entry.type, 'button')
    entry.props.onClick()
    await flushCatalog()
    const overlay = body.children.find(node => node.className === 'dtd-search-backdrop')
    assert.ok(overlay)
    return overlay.children[0]
  }
  const firstCommand = dialog => dialog.children[2].children.find(row => row.className === 'dtd-search-item')
  let commandDialog = await openCommandPicker()
  assert.equal(commandDialog.children[1].children[4].className, 'dtd-search-tab dtd-active')
  let row = firstCommand(commandDialog)
  assert.ok(row, 'scoped catalog lists built-in commands')
  row.emit('click')
  assert.ok(actions.some(action => action[0] === 'insert-command' && /^\/[a-z]+ $/.test(action[1])),
    'selection inserts through public InputActions, never submits')
  const writes = actions.filter(action => action[0] === 'insert-command').length

  commandDialog = await openCommandPicker()
  currentDraft = { ...currentDraft, draft: 'new draft', draftRev: 1 }
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes, 'changed draft is preserved')
  assert.equal(renderCommandEntry(), null, 'nonempty draft hides native entry')
  currentDraft = { ...currentDraft, draft: '', draftRev: 2 }

  commandDialog = await openCommandPicker()
  mainSession = 'other'
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes, 'switched Session is not edited')
  mainSession = 'local'

  commandDialog = await openCommandPicker()
  generation = { ...generation }
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes, 'same-ID replacement generation is not edited')

  commandDialog = await openCommandPicker()
  composerBlocked = true
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes, 'blocked composer is unchanged')
  composerBlocked = false

  commandDialog = await openCommandPicker()
  setComposerAccess(false)
  setComposerAccess(true)
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes,
    'revoked and re-granted access cannot reuse a captured command selection')
  setComposerAccess(false)
  assert.equal(renderCommandEntry(), null, 'no permission means no entry')
  setComposerAccess(true)

  commandDialog = await openCommandPicker()
  commandSlotEffects.splice(0).forEach(dispose => dispose())
  firstCommand(commandDialog).emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, writes,
    'unmounted Slot never writes even if the Session generation is still retained')

  // Stale scoped command callbacks cannot edit a later general Search Palette.
  commandDialog = await openCommandPicker()
  row = firstCommand(commandDialog)
  commandDialog.emit('keydown', { key: 'Escape', preventDefault() {} })
  const palette = openGeneralPalette()
  const modalInput = palette.children[0].children.find(node => node.tagName === 'input')
  const modalResults = palette.children[2]
  const flatten = node => [node.textContent, ...node.children.flatMap(flatten)].join(' ')
  assert.ok(modalInput)
  modalInput.value = 'Example'
  modalInput.emit('input')
  assert.equal(modalInput.value, 'Example', 'public palette owns its own search input')
  const beforeCommands = actions.filter(action => action[0] === 'insert-command').length
  row.emit('click')
  assert.equal(actions.filter(action => action[0] === 'insert-command').length, beforeCommands)
  commandSlotEffects.splice(0).forEach(dispose => dispose())
  assert.equal(accessWatchers.size, 0, 'command permission listener released')

  // An in-flight public Host search cannot republish protected content.
  let resolveNative, observedSignal
  nextNativeSearch = signal => {
    observedSignal = signal
    return new Promise(resolve => { resolveNative = resolve })
  }
  const runLastTimer = async () => {
    const [id, callback] = [...timers.entries()].at(-1)
    assert.ok(callback, 'search debounce scheduled')
    timers.delete(id)
    callback()
    await flushCatalog()
  }
  await runLastTimer()
  assert.ok(observedSignal && resolveNative, 'unprotected query may use Host search')
  protectionState = { ...protectionState, hasPin: true, lockMode: 'totp', lockedSessionIds: ['session-local'] }
  await env.testFeatures.refreshState()
  assert.doesNotMatch(flatten(modalResults), /Example Session/, 'locked session removed')
  assert.equal(observedSignal.aborted, true, 'lock aborts Host request')
  resolveNative({ ok: true, value: { items: [{ sessionId: 'local', snippet: 'late protected secret' }], hasMore: false } })
  await flushCatalog()
  assert.doesNotMatch(flatten(modalResults), /late protected secret/)

  protectionState = { ...protectionState, lockedSessionIds: [], lockedWorkspaceIds: ['design'] }
  await env.testFeatures.refreshState()
  assert.doesNotMatch(flatten(modalResults), /Example Session|Design Workspace/)
  protectionState = { ...protectionState, lockedWorkspaceIds: [], hasPin: false, lockMode: 'none' }
  await env.testFeatures.refreshState()

  protectionState = { ...protectionState, deletedSessionIds: ['local'] }
  await env.testFeatures.refreshState()
  assert.ok(hostSessions.list.getSnapshot().byId.local, 'native Session catalog remains unmodified')
  assert.doesNotMatch(flatten(modalResults), /Example Session/)
  assert.equal(hostSessions.list.getSnapshot, originalSessionSnapshot)
  assert.equal(hostSessions.list.subscribe, originalSessionSubscribe)
  palette.emit('keydown', { key: 'Escape', preventDefault() {} })
  callbacks.forEach(dispose => dispose())
  assert.equal(viewport.children[0], nav)
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
})

test('public Search Palette entry waits for Host Session and navigation services', () => {
  const root = new Element('html')
  const body = new Element('body')
  root.appendChild(body)
  const viewport = new Element('div')
  const nativeNav = new Element('nav')
  viewport.appendChild(nativeNav)
  body.appendChild(viewport)
  const effects = []
  const delayed = []
  const registeredSlots = []
  const actions = []
  let registration
  const ctx = {
    slots: {
      inject(_name, register) {
        const dispose = register()
        if (typeof dispose === 'function') effects.push(dispose)
      },
      register(options, component) {
        registeredSlots.push(options.id)
        return () => {}
      },
    },
    layout: { toggleSidebar() {}, selectPanel(id) { actions.push(id) } },
    theme: { overrideTokens() { return () => {} } },
    inject(names, callback) {
      if (names.every(name => ctx[name] !== undefined)) callback(ctx)
      else delayed.push({ names, callback })
    },
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') effects.push(dispose)
    },
  }
  const env = {
    window: {
      __ModuleLoader__: { load(entry) { registration = entry } },
      setTimeout() { return 1 },
      clearTimeout() {},
    },
    document: {
      documentElement: root,
      body,
      head: { appendChild(tag) { tag.parentNode = { removeChild() {} } } },
      createElement(tag) { return new Element(tag) },
    createTextNode(text) { const node = new Element('#text'); node.textContent = text; return node },
      querySelector(selector) {
        return selector === '[data-sidebar-scrollport]' ? viewport : null
      },
    },
    localStorage: { getItem() { return null }, setItem() {} },
    navigator: { language: 'zh-CN' },
    MutationObserver: class { observe() {} disconnect() {} },
    AbortController,
  }
  vm.runInNewContext(source, env)
  const client = registration.factory(() => ({
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [value, () => {}] },
    useRef(initial) { return { current: initial } },
    useEffect() {},
    useSyncExternalStore(_subscribe, get) { return get() },
  }))
  client.apply(ctx)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null,
    'no counterfeit search adapter is installed before public services exist')
  assert.equal(viewport.children[0], nativeNav)

  ctx.sessions = {
    list: { getSnapshot() { return { phase: 'ready', byId: {
      local: { id: 'local', title: 'A local conversation' },
    } } }, subscribe() { return () => {} } },
    async search() { return { ok: true, value: { items: [], hasMore: false } } },
  }
  ctx.uiWorkspace = {
    openSession(id) { actions.push(['open', id]) },
    startSession() { actions.push(['new']) },
  }
  for (const pending of delayed.filter(entry =>
    entry.names.includes('sessions') && entry.names.includes('uiWorkspace'))) {
    pending.callback(ctx)
  }
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  assert.equal(viewport.children.length, 1, 'Host sidebar remains unchanged')
  assert.equal(viewport.children[0], nativeNav)
  assert.ok(registeredSlots.includes('delta.search.palette'), 'public entry registers with Host services')
  effects.forEach(dispose => dispose?.())
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  assert.equal(viewport.children[0], nativeNav)
})

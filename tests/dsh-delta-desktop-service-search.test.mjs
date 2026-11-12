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
    file('packages/dsh-delta-desktop/tsconfig.client.json'), '--outDir', compileDir], { stdio: 'pipe' })
  compiled = readFileSync(join(compileDir, 'client.js'), 'utf8')
} finally { rmSync(compileDir, { recursive: true, force: true }) }
const locales = Object.fromEntries(['en', 'zh'].map(lang =>
  [lang, JSON.parse(readFileSync(file('packages/dsh-delta-desktop/locale/' + lang + '.json'), 'utf8'))]))
assert.equal(compiled.split("'__DELTA_DESKTOP_LOCALES__'").length, 2)
assert.equal(compiled.split("'__DELTA_DESKTOP_STYLE__'").length, 2)
const source = compiled.replace("'__DELTA_DESKTOP_LOCALES__'", JSON.stringify(locales))
  .replace("'__DELTA_DESKTOP_STYLE__'", JSON.stringify(
    readFileSync(file('packages/dsh-delta-desktop/src/theme.css'), 'utf8')))

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

test('service-backed sidebar search waits for native sidebar, uses Host search/navigation and disposes', async () => {
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
  let workspacePhase = 'ready'
  let workspaceState = 'idle'
  let workspaceTitle = 'Design Workspace'
  let refreshWorkspaces = () => {}
  const sessionListeners = new Set()
  const hoverSignals = []
  const hoverDisposers = []
  const refreshSessions = () => { for (const listener of [...sessionListeners]) listener() }
  let sessionRunning = false
  let sessionPhase = 'ready'
  let isSessionSnapshotUnavailable = false
  const hostWorkspaces = {
    list: {
      getSnapshot: () => ({ phase: workspacePhase, state: workspaceState, archivedSessionIds, items: [
        { workspaceId: 'design', title: workspaceTitle, path: 'C:\\Users\\private\\secret' },
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
          byId: { local: { id: 'local', title: 'Example Session', running: sessionRunning, updatedAt: 1760000000000 } } }
      },
      subscribe(callback) {
        sessionListeners.add(callback)
        return () => { sessionListeners.delete(callback) }
      },
    },
    search: async (query, signal) => {
      actions.push(['search', query])
      assert.equal(signal.aborted, false)
      return { ok: true, value: { items: [{ sessionId: 'remote', snippet: 'Example content match' }], hasMore: false } }
    },
  }
  const ctx = {
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
  vm.runInNewContext(source, env)
  const plugin = registered.factory(() => ({
    createElement(type, props, ...children) { return { type, props, children } },
    useState(initial) { return [initial, () => {}] },
    useRef(value) { return { current: value } },
    useEffect() {},
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
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'waiting-for-sidebar')
  body.appendChild(viewport)
  env.observers.forEach(update => update())
  const shell = viewport.children[0]
  assert.equal(shell.getAttribute('data-delta-search'), 'sessions')
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'active')
  assert.equal(viewport.children[1], nav)
  assert.equal(viewport.children[2], nativeWorkspace)

  const searchField = shell.children[0]
  const input = searchField.children.find(node => node.tagName === 'input')
  const results = shell.children[1]
  assert.ok(input, 'ZIP owns the sidebar search input')
  assert.equal(input.placeholder, locales.zh.searchPalette.sidebarPlaceholder)
  assert.equal(results.hidden, true)
  input.value = 'Example'
  input.emit('input')
  assert.ok(results.children.some(node => node.className === 'dtd-host-search-result'),
    'typing presents inline matches')
  assert.equal(body.children.some(node => node.className === 'dtd-search-backdrop'), false,
    'clicking or typing must not force the full-screen palette')

  const firstHit = results.children.find(node => node.className === 'dtd-host-search-result')
  firstHit.emit('click')
  assert.ok(actions.some(action => action[0] === 'open' && action[1] === 'local'),
    'search navigation uses the public Host API')

  input.value = 'Example'
  input.emit('keydown', { key: 'Enter', preventDefault() {} })
  assert.ok(body.children.some(node => node.className === 'dtd-search-backdrop'),
    'Enter explicitly opens the 7-category SearchPalette')
  const modal = body.children.find(node => node.className === 'dtd-search-backdrop')
  const dialog = modal.children[0]
  assert.equal(dialog.className, 'dtd-search-modal')
  assert.equal(dialog.children[1].children.length, 7)

  windowKeyHandlers.get('keydown')?.({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
  assert.equal(body.children.some(node => node.className === 'dtd-search-backdrop'), false)
  windowKeyHandlers.get('keydown')?.({
    key: 'k', code: 'KeyK', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {},
  })
  assert.ok(body.children.some(node => node.className === 'dtd-search-backdrop'),
    'Ctrl+K opens the same ZIP SearchPalette')
  callbacks.forEach(dispose => dispose())
  assert.equal(viewport.children[0], nav)
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
})

test('ZIP sidebar search activates only after public Host Session and navigation services arrive', () => {
  const root = new Element('html')
  const body = new Element('body')
  root.appendChild(body)
  const viewport = new Element('div')
  const nativeNav = new Element('nav')
  viewport.appendChild(nativeNav)
  body.appendChild(viewport)
  const effects = []
  const delayed = []
  const actions = []
  let registration
  const ctx = {
    slots: {
      inject(_name, register) {
        const dispose = register()
        if (typeof dispose === 'function') effects.push(dispose)
      },
      register(options, component) {
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
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'active')
  assert.equal(viewport.children[0].getAttribute('data-delta-search'), 'sessions')
  assert.equal(viewport.children[1], nativeNav)
  effects.forEach(dispose => dispose?.())
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  assert.equal(viewport.children[0], nativeNav)
})

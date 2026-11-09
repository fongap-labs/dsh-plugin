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
    useSyncExternalStore(subscribe, read) {
      const snapshot = read()
      if (typeof snapshot === 'string') {
        hoverDisposers.push(subscribe(() => { hoverSignals.push(read()) }))
      }
      return snapshot
    },
  }))
  plugin.apply(ctx)
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'waiting-for-sidebar')
  const controller = inserted.find(([spec]) => spec.name === 'settings.section')[0].inject().controller
  assert.equal(controller.getSnapshot().searchStatus, 'waiting-sidebar')
  body.appendChild(viewport)
  env.observers.forEach(update => update())
  const shell = viewport.children[0]
  assert.equal(shell.getAttribute('data-delta-search'), 'sessions')
  assert.equal(viewport.children[1], nav)
  assert.equal(viewport.children[2], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'active')
  assert.equal(controller.getSnapshot().searchStatus, 'active')

  const input = shell.children[0].children[1]
  const quickActions = shell.children[1]
  const feedback = shell.children[2]
  assert.deepEqual(quickActions.children.map(button => button.getAttribute('data-delta-action')),
    ['plugins', 'schedules', 'new-session'])
  assert.deepEqual(quickActions.children.map(button => button.textContent), ['插件管理', '定时任务', '开始对话'])
  assert.equal(quickActions.children[2].hidden, false, 'owner grant enables New Session')
  quickActions.children[0].emit('click')
  quickActions.children[1].emit('click')
  quickActions.children[2].emit('click')
  assert.deepEqual(actions, [['panel', 'plugins'], ['panel', 'schedules'], ['new-session']])
  assert.equal(feedback.hidden, true)
  revokeSessionCreate()
  assert.equal(quickActions.children[2].hidden, true, 'revoked grant hides New Session')
  assert.equal(quickActions.children[2].disabled, true)
  quickActions.children[2].emit('click')
  assert.deepEqual(actions, [['panel', 'plugins'], ['panel', 'schedules'], ['new-session']],
    'revoked grants cannot dispatch even a synthetic click')
  assert.equal(feedback.hidden, false)
  grantSessionCreate()
  assert.equal(quickActions.children[2].hidden, false, 'restored grant shows New Session')
  quickActions.children[2].emit('click')
  assert.deepEqual(actions.at(-1), ['new-session'])
  assert.equal(feedback.hidden, true)
  input.value = 'example'
  input.emit('input')
  const results = shell.children[3]
  assert.equal(results.hidden, false)
  assert.equal(results.children[0].textContent, '')
  assert.equal(results.children[0].children[0].textContent, 'Example Session')
  let keyboardPrevented = false
  input.emit('keydown', { key: 'ArrowDown', preventDefault() { keyboardPrevented = true } })
  assert.equal(keyboardPrevented, true)
  assert.equal(results.children[0].focused, true, 'ArrowDown focuses first search result')
  results.children[0].emit('keydown', { key: 'ArrowUp', preventDefault() {} })
  assert.equal(input.focused, true, 'ArrowUp from first result restores search input')
  sessionRunning = true
  refreshSessions()
  assert.equal(results.children[0].children[1].textContent, '运行中',
    'active Host Session status refreshes plugin search results')
  isSessionSnapshotUnavailable = true
  assert.doesNotThrow(() => refreshSessions(), 'Host catalog reconnect must not unmount Delta search')
  assert.equal(results.children[0].textContent, '搜索与快捷入口：等待 Harness 会话与导航服务。')
  isSessionSnapshotUnavailable = false
  refreshSessions()
  assert.equal(results.children[0].children[0].textContent, 'Example Session',
    'Host catalog recovery restores search without replacing the native sidebar')
  const nativeHover = inserted.find(([spec]) => spec.name === 'sidebar.session.row.hover')[1]
  const hoverText = JSON.stringify(nativeHover({ sessionId: 'local' }))
  assert.ok(hoverText.includes('运行中'), 'native Session hover exposes Host-confirmed running state')
  assert.ok(hoverText.includes('最近更新'), 'native Session hover includes public updatedAt metadata')
  assert.doesNotMatch(hoverText, /private\\\\secret/, 'native Session hover must never contain a path')
  assert.equal(sessionListeners.size, 2, 'hover subscribes without starting another Session')
  sessionRunning = false
  refreshSessions()
  assert.equal(hoverSignals.at(-1), '0:1760000000000',
    'Host running-state changes signal the mounted native hover')
  assert.doesNotMatch(JSON.stringify(nativeHover({ sessionId: 'local' })), /运行中/,
    'a stopped Session must not retain the previous running badge')
  sessionPhase = 'pending'
  assert.doesNotMatch(JSON.stringify(nativeHover({ sessionId: 'local' })), /最近更新/,
    'pending Host snapshots must not show stale activity metadata')
  sessionPhase = 'ready'
  isSessionSnapshotUnavailable = true
  assert.doesNotThrow(() => nativeHover({ sessionId: 'local' }),
    'a reconnecting Host must leave the identity-only hover usable')
  isSessionSnapshotUnavailable = false
  hoverDisposers.forEach(dispose => dispose())
  assert.equal(sessionListeners.size, 1, 'unmounted hover removes its Host subscription')
  assert.equal(results.children[0].children.length, 1)
  const fire = timers.values().next().value
  assert.equal(typeof fire, 'function')
  fire()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(actions.at(-1), ['search', 'example'])
  assert.equal(results.children.length, 2)
  assert.equal(results.children[1].children[1].textContent, 'Example content match')
  input.emit('keydown', { key: 'ArrowDown', preventDefault() {} })
  results.children[0].emit('keydown', { key: 'ArrowDown', preventDefault() {} })
  assert.equal(results.children[1].focused, true, 'ArrowDown advances through result buttons')
  results.children[1].emit('keydown', { key: 'Escape', preventDefault() {} })
  assert.equal(input.value, '', 'Escape clears the search')
  assert.equal(results.hidden, true)
  const startedSearchCount = actions.filter(([action]) => action === 'search').length
  fire()
  assert.equal(actions.filter(([action]) => action === 'search').length, startedSearchCount,
    'a queued debounce callback must not start a Host RPC after Escape cancels it')
  input.value = 'example'
  input.emit('input')
  // The debounced request is no longer needed here: the Host list still contains the local row.
  // Reuse a fresh remote search response for archive checks below.
  const fireAgain = [...timers.values()].at(-1)
  assert.equal(typeof fireAgain, 'function')
  fireAgain()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(results.children.length, 2)
  archivedSessionIds = ['remote']
  refreshWorkspaces()
  assert.equal(results.children[1].getAttribute('aria-disabled'), 'true')
  assert.equal(results.children[1].children.at(-1).textContent, '已归档')
  results.children[1].emit('click')
  assert.equal(feedback.hidden, false)
  assert.equal(feedback.textContent, '此会话已归档。请先通过官方工作区列表恢复后再打开。')
  assert.equal(actions.filter(([action]) => action === 'open').length, 0,
    'archived search results must not bypass native WorkspaceBrowser guardedOpen')
  archivedSessionIds = []
  workspacePhase = 'loading'
  results.children[1].emit('click')
  assert.equal(feedback.textContent, '无法确认会话归档状态，请使用官方会话列表打开。')
  workspacePhase = 'ready'
  archivedSessionIds = undefined
  results.children[1].emit('click')
  assert.equal(feedback.textContent, '无法确认会话归档状态，请使用官方会话列表打开。')
  archivedSessionIds = []
  workspaceState = 'loading'
  results.children[1].emit('click')
  assert.equal(feedback.textContent, '无法确认会话归档状态，请使用官方会话列表打开。',
    'loading Workspace streams must not expose stale archive grants')
  workspaceState = 'error'
  results.children[1].emit('click')
  assert.equal(feedback.textContent, '无法确认会话归档状态，请使用官方会话列表打开。')
  workspaceState = 'idle'
  sessionPhase = 'pending'
  results.children[1].emit('click')
  assert.equal(feedback.textContent, '无法确认会话归档状态，请使用官方会话列表打开。',
    'reconnecting Session streams must not navigate using a stale Workspace snapshot')
  sessionPhase = 'ready'
  results.children[1].emit('click')
  assert.deepEqual(actions.at(-1), ['open', 'remote'])
  assert.equal(results.hidden, true)

  workspaceState = 'loading'
  input.value = 'design'
  input.emit('input')
  assert.notEqual(results.children[0].getAttribute('data-delta-result-kind'), 'workspace',
    'reconnecting workspace lists do not expose stale title navigation')
  workspaceState = 'idle'
  refreshWorkspaces()
  assert.equal(results.children[0].getAttribute('data-delta-result-kind'), 'workspace')
  assert.equal(results.children[0].children[0].textContent, '工作区')
  assert.equal(results.children[0].children[1].textContent, 'Design Workspace')
  assert.equal(results.children[0].children.some(x => String(x.textContent).includes('private')), false,
    'only the workspace title may appear; the filesystem path must stay private')
  // Host state may change after the row is rendered but before click.
  // Never use a stale Workspace button as authority for navigation.
  const beforeWorkspaceClicks = actions.filter(([kind]) => kind === 'workspace').length
  workspaceState = 'loading'
  results.children[0].emit('click')
  assert.equal(actions.filter(([kind]) => kind === 'workspace').length, beforeWorkspaceClicks,
    'a stale row must not open a Workspace while the Host is reconnecting')
  assert.equal(feedback.hidden, false, 'stale workspace navigation must report a visible error')
  workspaceState = 'idle'
  workspaceTitle = 'Renamed Workspace'
  results.children[0].emit('click')
  assert.equal(actions.filter(([kind]) => kind === 'workspace').length, beforeWorkspaceClicks,
    'a Workspace renamed since paint must not be opened from the stale row')
  workspaceTitle = 'Design Workspace'
  results.children[0].emit('click')
  // The simulated Host returns a cross-vm Promise; wait for Promise assimilation.
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(actions.at(-1), ['workspace', 'design'])
  assert.equal(results.hidden, true, 'successful Host workspace navigation clears search')
  assert.equal(feedback.hidden, true, 'successful navigation must also clear stale Host-reconnect errors')
  workspaceNavigationFails = true
  input.value = 'design'
  input.emit('input')
  results.children[0].emit('click')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(results.hidden, false, 'rejected Host navigation retains search and shows failure')
  assert.equal(results.children.at(-1).textContent, '此版本缺少必要能力或操作失败，请停用此插件并恢复官方界面。')
  workspaceNavigationFails = false

  input.value = 'example'
  input.emit('input')
  sessionRunning = true
  refreshSessions()
  assert.equal(results.children[0].children[1].textContent, '运行中')
  root.lang = 'en-US'
  controller.syncLanguage()
  assert.equal(results.children[0].children[1].textContent, 'Running',
    'language switch updates visible status copy without repeating search')
  assert.match(JSON.stringify(nativeHover({ sessionId: 'local' })), /Last updated/,
    'native hover time label follows the active Host language')
  sessionRunning = false
  refreshSessions()
  assert.equal(input.placeholder, 'Search sessions')
  assert.deepEqual(quickActions.children.map(button => button.textContent), ['Plugins', 'Schedules', 'New conversation'])
  controller.bindLayout(undefined)
  quickActions.children[0].emit('click')
  assert.equal(feedback.hidden, false, 'unavailable Host panel must report a visible error')
  controller.setMode('official')
  assert.equal(viewport.children[0], nav)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  assert.equal(controller.getSnapshot().searchStatus, 'disabled')
  nav.remove()
  controller.setMode('delta')
  assert.equal(controller.getSnapshot().searchStatus, 'active')
  assert.equal(viewport.children[0], shell, 'search mounts even if Host does not render a nav list')
  assert.equal(viewport.children[1], nativeWorkspace)
  viewport.insertBefore(nav, nativeWorkspace)
  assert.equal(input.value, '', 'switching themes discards stale search state')
  assert.equal(feedback.hidden, true)
  assert.equal(results.hidden, true)
  input.value = 'old-search'
  input.emit('input')
  viewport.remove()
  env.observers.forEach(update => update())
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'waiting-for-sidebar')
  assert.equal(input.value, '', 'unmounted Host sidebar invalidates stale search')
  assert.equal(results.hidden, true)
  assert.equal(viewport.children[0], nav, 'native sidebar children are not replaced')
  body.appendChild(viewport)
  env.observers.forEach(update => update())
  assert.equal(viewport.children[0], shell)
  assert.equal(input.value, '', 'Host sidebar remount does not replay prior query')
  callbacks.forEach(dispose => dispose())
  assert.equal(viewport.children[0], nav)
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
})

test('Delta sidebar remains visible without optional Host Session services', () => {
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
    useSyncExternalStore(_subscribe, get) { return get() },
  }))
  client.apply(ctx)
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'waiting-for-services')
  const shell = viewport.children[0]
  assert.equal(shell.getAttribute('data-delta-search'), 'sessions')
  assert.equal(viewport.children[1], nativeNav, 'the native navigation remains available')
  assert.deepEqual(shell.children[1].children.map(button => button.textContent),
    ['插件管理', '定时任务', '开始对话'])
  shell.children[1].children[0].emit('click')
  assert.deepEqual(actions, ['plugins'], 'Plugins uses native layout with no Session service')
  const input = shell.children[0].children[1]
  input.value = 'example'
  input.emit('input')
  assert.equal(shell.children[3].children[0].textContent,
    '搜索与快捷入口：等待 Harness 会话与导航服务。')
  // Simulate Cordis resolving late optional services.
  const sessionListeners = new Set()
  ctx.sessions = {
    list: {
      getSnapshot() { return { phase: 'ready',
        byId: { local: { id: 'local', title: 'Example Session', running: false } } } },
      subscribe(listener) {
        sessionListeners.add(listener)
        return () => { sessionListeners.delete(listener) }
      },
    },
    search: async () => ({ ok: true, value: { items: [], hasMore: false } }),
  }
  ctx.uiWorkspace = { openSession() {}, startSession() {} }
  for (const entry of delayed) {
    if (entry.names.every(name => ctx[name] !== undefined)) entry.callback(ctx)
  }
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'active')
  assert.equal(viewport.children[0], shell, 'service activation does not remount the search input')
  assert.equal(shell.children[3].children[0].children[0].textContent, 'Example Session')
  effects.reverse().forEach(dispose => dispose())
  assert.equal(sessionListeners.size, 0, 'cleanup releases Host Session subscriptions')
  assert.equal(shell.parentElement, null)
})

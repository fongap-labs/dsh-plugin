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
  blur() {}
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
  const hostWorkspaces = {
    list: {
      getSnapshot: () => ({ phase: workspacePhase, archivedSessionIds, items: [
        { workspaceId: 'design', title: 'Design Workspace', path: 'C:\\Users\\private\\secret' },
      ] }),
      subscribe() { return () => {} },
    },
    async delete() { throw new Error('workspace deletion is Host-owned') },
  }
  let workspaceNavigationFails = false
  let revokeSessionCreate = () => {}
  let grantSessionCreate = () => {}
  const hostSessions = {
    list: { getSnapshot: () => ({ byId: { local: { id: 'local', title: 'Example Session' } } }) },
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
    useSyncExternalStore(_subscribe, read) { return read() },
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
  const fire = timers.values().next().value
  assert.equal(typeof fire, 'function')
  fire()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(actions.at(-1), ['search', 'example'])
  assert.equal(results.children.length, 2)
  assert.equal(results.children[1].children[1].textContent, 'Example content match')
  archivedSessionIds = ['remote']
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
  results.children[1].emit('click')
  assert.deepEqual(actions.at(-1), ['open', 'remote'])
  assert.equal(results.hidden, true)

  input.value = 'design'
  input.emit('input')
  assert.equal(results.children[0].getAttribute('data-delta-result-kind'), 'workspace')
  assert.equal(results.children[0].children[0].textContent, '工作区')
  assert.equal(results.children[0].children[1].textContent, 'Design Workspace')
  assert.equal(results.children[0].children.some(x => String(x.textContent).includes('private')), false,
    'only the workspace title may appear; the filesystem path must stay private')
  results.children[0].emit('click')
  // The simulated Host returns a cross-vm Promise; wait for Promise assimilation.
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(actions.at(-1), ['workspace', 'design'])
  assert.equal(results.hidden, true, 'successful Host workspace navigation clears search')
  workspaceNavigationFails = true
  input.value = 'design'
  input.emit('input')
  results.children[0].emit('click')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(results.hidden, false, 'rejected Host navigation retains search and shows failure')
  assert.equal(results.children.at(-1).textContent, '此版本缺少必要能力或操作失败，请停用此插件并恢复官方界面。')
  workspaceNavigationFails = false

  root.lang = 'en-US'
  controller.syncLanguage()
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
  callbacks.forEach(dispose => dispose())
  assert.equal(viewport.children[0], nav)
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
})

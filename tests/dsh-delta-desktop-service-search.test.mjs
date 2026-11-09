import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const file = path => fileURLToPath(new URL('../' + path, import.meta.url))
execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
  file('packages/dsh-delta-desktop/tsconfig.client.json')], { stdio: 'pipe' })
execFileSync(process.execPath, [file('packages/dsh-delta-desktop/scripts/finalize-client.mjs')], { stdio: 'pipe' })
const source = readFileSync(file('packages/dsh-delta-desktop/lib/client.js'), 'utf8')

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
    layout: { toggleSidebar() {}, selectPanel() {} },
    sessions: hostSessions,
    uiWorkspace: { openSession(id) { actions.push(['open', id]) }, startSession() {} },
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
  body.appendChild(viewport)
  env.observers.forEach(update => update())
  const shell = viewport.children[0]
  assert.equal(shell.getAttribute('data-delta-search'), 'sessions')
  assert.equal(viewport.children[1], nav)
  assert.equal(viewport.children[2], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), 'active')

  const input = shell.children[0].children[1]
  input.value = 'example'
  input.emit('input')
  const results = shell.children[1]
  assert.equal(results.hidden, false)
  assert.equal(results.children[0].textContent, '')
  assert.equal(results.children[0].children[0].textContent, 'Example Session')
  const fire = timers.values().next().value
  assert.equal(typeof fire, 'function')
  fire()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(actions[0], ['search', 'example'])
  assert.equal(results.children.length, 2)
  assert.equal(results.children[1].children[1].textContent, 'Example content match')
  results.children[1].emit('click')
  assert.deepEqual(actions[1], ['open', 'remote'])
  assert.equal(results.hidden, true)

  const preference = inserted.find(([spec]) => spec.name === 'settings.section')
  const controller = preference[0].inject().controller
  controller.setMode('official')
  assert.equal(viewport.children[0], nav)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
  controller.setMode('delta')
  assert.equal(viewport.children[0], shell)
  callbacks.forEach(dispose => dispose())
  assert.equal(viewport.children[0], nav)
  assert.equal(viewport.children[1], nativeWorkspace)
  assert.equal(root.getAttribute('data-delta-search-adapter'), null)
})

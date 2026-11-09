import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const file = rel => fileURLToPath(new URL('../' + rel, import.meta.url))
execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
  file('packages/dsh-delta-desktop/tsconfig.client.json')], { stdio: 'pipe' })
execFileSync(process.execPath, [file('packages/dsh-delta-desktop/scripts/finalize-client.mjs')], { stdio: 'pipe' })
const code = readFileSync(file('packages/dsh-delta-desktop/lib/client.js'), 'utf8')

class NodeStub {
  constructor(name) {
    this.name = name
    this.children = []
    this.parentElement = null
    this.listeners = new Map()
    this.attrs = new Map()
    this.dataset = {}
    this.lang = 'zh-CN'
    this.textContent = ''
    this.className = ''
    this._value = ''
  }
  set value(value) { this._value = value }
  get value() { return this._value }
  get isConnected() { return this.parentElement !== null }
  get nextElementSibling() {
    if (!this.parentElement) return null
    return this.parentElement.children[this.parentElement.children.indexOf(this) + 1] ?? null
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)) }
  getAttribute(name) { return this.attrs.get(name) ?? null }
  removeAttribute(name) { this.attrs.delete(name) }
  appendChild(node) { node.remove(); node.parentElement = this; this.children.push(node); return node }
  insertBefore(node, next) {
    node.remove()
    const at = this.children.indexOf(next)
    this.children.splice(at < 0 ? this.children.length : at, 0, node)
    node.parentElement = this
    return node
  }
  insertAdjacentElement(where, node) {
    if (where === 'afterend' && this.parentElement) this.parentElement.insertBefore(node, this.nextElementSibling)
  }
  remove() {
    if (!this.parentElement) return
    this.parentElement.children = this.parentElement.children.filter(item => item !== this)
    this.parentElement = null
  }
  addEventListener(name, listener) { this.listeners.set(name, listener) }
  dispatchEvent(event) { this.listeners.get(event.type)?.(event); return true }
  focus() { fixture.activeElement = this }
  click() { this.dispatchEvent({ type: 'click' }) }
  querySelector(selector) {
    if (selector === ':scope > nav' || selector === 'nav') return fixture.navigation
    if (selector === '[data-sidebar-workspace-header]') return fixture.header
    if (selector === 'input[type="text"]') return fixture.nativeInputReady ? fixture.nativeInput : null
    if (selector === 'button[aria-expanded]') return fixture.nativeSearch
    if (selector === 'input') return this.children.find(child => child.name === 'input') ?? null
    return null
  }
  querySelectorAll(selector) { return selector.startsWith('[data-row-key') ? [fixture.group] : [] }
}

const fixture = {
  root: new NodeStub('html'),
  viewport: new NodeStub('div'),
  navigation: new NodeStub('nav'),
  region: new NodeStub('div'),
  header: new NodeStub('div'),
  nativeInput: new NodeStub('input'),
  nativeSearch: new NodeStub('button'),
  nativeNew: new NodeStub('button'),
  group: new NodeStub('div'),
  activeElement: null,
  nativeInputReady: false,
  nativeClicks: 0,
  newClicks: 0,
  groupClicks: 0,
  nativeInputs: [],
}
fixture.root.appendChild(fixture.viewport)
fixture.viewport.appendChild(fixture.navigation)
fixture.viewport.appendChild(fixture.region)
fixture.region.appendChild(fixture.header)
fixture.header.appendChild(fixture.nativeInput)
fixture.header.appendChild(fixture.nativeSearch)
fixture.group.setAttribute('data-row-key', 'workspace:abc')
fixture.group.setAttribute('aria-expanded', 'true')
fixture.nativeSearch.setAttribute('aria-expanded', 'false')
fixture.nativeSearch.click = () => { fixture.nativeClicks++; fixture.nativeInputReady = true; fixture.nativeSearch.setAttribute('aria-expanded', 'true') }
fixture.nativeNew.click = () => { fixture.newClicks++ }
fixture.group.click = () => { fixture.groupClicks++; fixture.group.setAttribute('aria-expanded', 'false') }
fixture.nativeInput.dispatchEvent = event => { fixture.nativeInputs.push({ type: event.type, value: fixture.nativeInput.value }) }

test('Delta native navigation mounts, dispatches host actions, folds, and restores', () => {
  let registration
  const effects = [], components = new Map()
  const doc = {
    documentElement: fixture.root, body: fixture.root, activeElement: null,
    head: { appendChild(node) { node.parentNode = { removeChild() {} } } },
    createElement: tag => new NodeStub(tag),
    querySelector(selector) {
      if (selector === '[data-sidebar-scrollport]') return fixture.viewport
      if (selector === '[data-sidebar-workspace-header]') return fixture.header
      if (selector.includes('input[type="text"]')) return fixture.nativeInputReady ? fixture.nativeInput : null
      if (selector.includes('button[aria-expanded]')) return fixture.nativeSearch
      if (selector.includes('button[class*="newSession"]')) return fixture.nativeNew
      return null
    },
  }
  const context = {
    document: doc,
    HTMLInputElement: NodeStub,
    Event: class { constructor(type) { this.type = type } },
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { language: 'zh-CN' },
    localStorage: { getItem() { return null }, setItem() {} },
    window: { __ModuleLoader__: { load(entry) { registration = entry } }, requestAnimationFrame(fn) { fn() } },
  }
  vm.runInNewContext(code, context)
  const plugin = registration.factory(() => ({
    createElement(type, props, ...children) { return { type, props, children } },
    useState(value) { return [value, () => {}] },
    useSyncExternalStore(_subscribe, get) { return get() },
  }))
  const ctx = {
    inject(_services, callback) { callback(ctx) },
    effect(make) { effects.push(make()) },
    slots: {
      inject(_name, make) { const dispose = make(); if (typeof dispose === 'function') effects.push(dispose) },
      register(options, component) {
        components.set(options.name, { options, component })
        return () => { components.delete(options.name) }
      },
    },
    theme: { overrideTokens() { return () => {} } },
  }
  plugin.apply(ctx)
  assert.equal(fixture.root.getAttribute('data-delta-compat'), '1')
  assert.equal(fixture.root.getAttribute('data-delta-compat-status'), 'mounted')
  assert.equal(fixture.viewport.children[0].getAttribute('data-delta-search'), '')
  assert.equal(fixture.viewport.children[1], fixture.navigation)
  assert.equal(fixture.groupClicks, 1)
  const input = fixture.viewport.children[0].querySelector('input')
  input.value = 'example'
  input.dispatchEvent({ type: 'input' })
  assert.equal(fixture.nativeClicks, 1)
  assert.equal(fixture.nativeInputReady, true)
  assert.equal(fixture.nativeInputs.at(-1).value, 'example')
  const newButton = fixture.viewport.children.find(node => node.className === 'dtd-native-new-session')
  assert.ok(newButton)
  newButton.click()
  assert.equal(fixture.newClicks, 1)
  const controller = components.get('settings.section').options.inject().controller
  controller.setMode('official')
  assert.equal(fixture.root.getAttribute('data-delta-compat'), null)
  assert.equal(fixture.viewport.children.some(node => node.className.startsWith('dtd-native')), false)
  controller.setMode('delta')
  assert.equal(fixture.root.getAttribute('data-delta-compat'), '1')
  effects.forEach(fn => fn?.())
  assert.equal(fixture.root.getAttribute('data-delta-compat'), null)
  assert.equal(fixture.root.getAttribute('data-delta-compat-status'), null)
})

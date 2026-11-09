import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Central CI invokes node --test directly, so build the actual client artifact here.
const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-theme-delta/tsconfig.json')], { stdio: 'pipe' })
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-theme-delta/tsconfig.client.json')], { stdio: 'pipe' })
execFileSync(process.execPath, [fixture('packages/dsh-theme-delta/scripts/finalize-client.mjs')],
  { stdio: 'pipe' })
const source = readFileSync(fixture('packages/dsh-theme-delta/lib/client.js'), 'utf8')
function harness({ stored = null, failTheme = false } = {}) {
  let registration
  const effects = [], slots = [], layers = new Map(), changes = []
  let removed = 0
  const documentElement = { lang: 'zh-CN' }
  const head = { appendChild(tag) {
    tag.parentNode = { removeChild(value) { removed++; value.parentNode = null } }
  } }
  const context = {
    window: { __ModuleLoader__: { load(entry) { registration = entry } } },
    document: { documentElement, head, createElement(name) { return { name, dataset: {}, textContent: '', parentNode: null } } },
    navigator: { language: 'en-US' },
    localStorage: { getItem() { return stored }, setItem(_key, value) { stored = value } },
    MutationObserver: class { constructor(callback) { context.observer = callback } observe() {} disconnect() {} },
  }
  vm.runInNewContext(source, context)
  const components = new Map()
  const client = registration.factory(id => {
    assert.equal(id, 'react')
    return {
      createElement(type, props, ...children) { return { type, props, children } },
      useState(value) { return [value, () => {}] },
      useSyncExternalStore(_subscribe, get) { return get() },
    }
  })
  const ctx = {
    effect(create) { effects.push(create()) },
    theme: { overrideTokens(id, values) {
      if (failTheme) throw new Error('theme unavailable')
      layers.set(id, values)
      return () => { layers.delete(id) }
    } },
    layout: { toggleSidebar() { changes.push('sidebar') }, selectPanel(id) { changes.push(id) } },
    slots: {
      inject(name, register) { slots.push(name); register() },
      register(spec, component) { components.set(spec.name, { spec, component }); return () => components.delete(spec.name) },
    },
  }
  client.apply(ctx)
  return { registration, context, documentElement, components, slots, layers, changes,
    cleanup() { effects.forEach(fn => fn?.()) },
    get removed() { return removed },
    get stored() { return stored } }
}
test('lazy ModuleLoader registration and browser-safe artifact', () => {
  let loaded
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(x) { loaded = x } } } })
  assert.equal(loaded.id, '@fongap-labs/dsh-theme-delta')
  assert.equal(typeof loaded.factory, 'function')
  assert.doesNotMatch(source, /__DELTA_THEME_|process\.env|from\s+['"]/)
})
test('appearance, official layout actions, and cleanup are reversible', () => {
  const app = harness()
  assert.deepEqual(app.slots, ['settings.general.item', 'shell.overlay'])
  const palette = app.layers.get(app.registration.id)
  assert.equal(palette['--dsw-alias-brand-primary'].light, '#286F78')
  assert.equal(palette['--dsw-alias-brand-primary'].dark, '#60B4BF')
  const entry = app.components.get('settings.general.item')
  const controller = entry.spec.inject().controller
  assert.match(JSON.stringify(entry.component({ controller })), new RegExp('Delta 主题'))
  controller.setMode('official')
  assert.equal(app.layers.size, 0)
  controller.openConversation()
  controller.toggleSidebar()
  assert.deepEqual(app.changes, [null, 'sidebar'])
  controller.setMode('delta')
  assert.equal(app.layers.size, 1)
  assert.match(app.stored, /"mode":"delta"/)
  app.documentElement.lang = 'en'
  app.context.observer()
  assert.match(JSON.stringify(entry.component({ controller })), /Delta Theme/)
  app.cleanup(); app.cleanup()
  assert.equal(app.layers.size, 0)
  assert.equal(app.removed, 1)
  controller.setMode('delta')
  assert.equal(app.layers.size, 0)
})
test('invalid persisted values and missing theme services are recoverable', () => {
  const official = harness({ stored: JSON.stringify({ schema: 1, mode: 'official' }) })
  assert.equal(official.layers.size, 0)
  official.cleanup()
  const invalid = harness({ stored: '{"schema":2,"mode":"official"}' })
  assert.equal(invalid.layers.size, 1)
  invalid.cleanup()
  const failed = harness({ failTheme: true })
  const controller = failed.components.get('settings.general.item').spec.inject().controller
  assert.equal(controller.getSnapshot().error, true)
  controller.setMode('official')
  assert.equal(controller.getSnapshot().mode, 'official')
  failed.cleanup()
})
test('package identity, localization and assets are independent', () => {
  const base = '../packages/dsh-theme-delta/'
  const json = path => JSON.parse(readFileSync(new URL(base + path, import.meta.url), 'utf8'))
  const pkg = json('package.json')
  assert.equal(pkg.name, '@fongap-labs/dsh-theme-delta')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.description, json('locale/en.json').meta.description)
  assert.equal(json('locale/zh.json').meta.title, 'Delta 主题')
  assert.equal(pkg.dependencies?.['@deepseek-ai/cordis'], undefined)
  const rel = json('../../projects/dsh-theme-delta/release.manifest.json')
  assert.equal(rel.release_key, 'dsh-theme-delta')
})

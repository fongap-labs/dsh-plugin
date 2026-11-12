import { test } from 'node:test'
import { buildDesktopClientFixture } from './helpers/build-desktop-client.mjs'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Central CI invokes node --test directly, so build the actual client artifact here.
const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const source = buildDesktopClientFixture()
function harness({ stored = null, failTheme = false, failLayout = false } = {}) {
  let registration
  const effects = [], slots = [], layers = new Map(), changes = []
  let removed = 0
  const deletedWorkspaces = []
  const defaultSessions = ['session-one']
  const workspaces = {
    list: { getSnapshot() { return { items: [
      { workspaceId: 'default', path: 'C:\\Users\\user\\Documents\\deepseek-harness\\default-workspace', title: 'default-workspace', sessionIds: defaultSessions },
      { workspaceId: 'other', path: 'C:\\Users\\user\\Documents\\work', title: 'work', sessionIds: [] },
    ] } } },
    async delete(id) { deletedWorkspaces.push(id) },
  }
  const originalDelete = workspaces.delete
  const attributes = new Map()
  const documentElement = { lang: 'zh-CN',
    setAttribute(key, value) { attributes.set(key, value) },
    removeAttribute(key) { attributes.delete(key) },
    getAttribute(key) { return attributes.get(key) },
  }
  const head = { appendChild(tag) {
    tag.parentNode = { removeChild(value) { removed++; value.parentNode = null } }
  } }
  const context = {
    observers: [],
    window: { __ModuleLoader__: { load(entry) { registration = entry } } },
    document: { documentElement, head, createElement(name) { return { name, dataset: {}, textContent: '', parentNode: null } } },
    navigator: { language: 'en-US' },
    localStorage: { getItem() { return stored }, setItem(_key, value) { stored = value } },
    MutationObserver: class { constructor(callback) { context.observers.push(callback) } observe() {} disconnect() {} },
  }
  vm.runInNewContext(source, context)
  const components = new Map()
  const client = registration.factory(id => {
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { MenuItemButton() {} }
    if (id === 'react-dom/client') return { createRoot() { return { render() {}, unmount() {} } } }
    assert.equal(id, 'react')
    return {
      createElement(type, props, ...children) { return { type, props, children } },
      useState(value) { return [value, () => {}] },
      useRef(value) { return { current: value } },
      useEffect() {},
      useSyncExternalStore(_subscribe, get) { return get() },
    }
  })
  const ctx = {
    inject(services, callback) {
      const names = Array.from(services)
      assert.ok(['slots', 'theme', 'layout', 'workspaces', 'sessions,uiWorkspace', 'remoteAccess',
        'sessions,resources,sidebarRightTabs,sidebarRight', 'configForms,remote'].includes(names.join(',')))
      // Cordis throws for undeclared services even when optional chaining is used.
      callback(new Proxy(ctx, { get(target, property) {
        if (property === 'locale') throw new Error('cannot get property "locale" without inject')
        return Reflect.get(target, property)
      } }))
    },
    effect(create) { effects.push(create()) },
    workspaces,
    theme: { overrideTokens(id, values) {
      if (failTheme) throw new Error('theme unavailable')
      layers.set(id, values)
      return () => { layers.delete(id) }
    } },
    layout: failLayout ? undefined : { toggleSidebar() { changes.push('sidebar') }, selectPanel(id) { changes.push(id) } },
    slots: {
      inject(name, register) {
        slots.push(name)
        const dispose = register()
        if (typeof dispose === 'function') effects.push(dispose)
      },
      register(spec, component) { components.set(spec.name, { spec, component }); return () => components.delete(spec.name) },
    },
  }
  client.apply(ctx)
  return { registration, context, documentElement, components, slots, layers, changes,
    workspaces, deletedWorkspaces, originalDelete, defaultSessions,
    cleanup() { effects.forEach(fn => fn?.()) },
    get removed() { return removed },
    get stored() { return stored } }
}
test('lazy ModuleLoader registration and browser-safe artifact', () => {
  let loaded
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(x) { loaded = x } } } })
  assert.equal(loaded.id, '@fongap-labs/dsh-delta-desktop')
  assert.equal(typeof loaded.factory, 'function')
  assert.doesNotMatch(source, /__DELTA_DESKTOP_|process\.env|from\s+['"]/)
})
test('web boot stays active while waiting for UI services or when React is unavailable', () => {
  let entry
  const diagnostic = []
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load(value) { entry = value } } },
    console: { error(...args) { diagnostic.push(args) } },
  })
  const react = entry.factory(id => {
    assert.equal(id, 'react')
    return { createElement() {}, useState() {}, useRef() {}, useEffect() {}, useSyncExternalStore() {} }
  })
  assert.deepEqual(Array.from(react.inject), [])
  let deferred
  assert.doesNotThrow(() => react.apply({
    inject(required, install) {
      assert.deepEqual(Array.from(required), ['slots'])
      deferred = install
    },
  }))
  assert.equal(typeof deferred, 'function')
  assert.doesNotThrow(() => deferred({ theme: null, layout: null, slots: null }))
  assert.ok(diagnostic.some(record => String(record[0]).includes('Settings mount failed')))
  assert.doesNotThrow(() => react.apply({ inject() { throw new Error('service unavailable') } }))
  assert.ok(diagnostic.some(record => String(record[0]).includes('deferred Settings registration failed')))

  const missingReact = entry.factory(() => { throw new Error('missing react platform module') })
  assert.deepEqual(Array.from(missingReact.inject), [])
  assert.doesNotThrow(() => missingReact.apply({}))
  assert.ok(diagnostic.some(record => String(record[0]).includes('React unavailable')))
})
test('appearance and Settings mount when undeclared locale access is rejected', () => {
  const app = harness()
  assert.deepEqual(app.slots, ['settings.section', 'settings.section.icon', 'plugins.add.actions', 'sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.session.row.hover'])
  assert.equal(typeof app.components.get('settings.section.icon').component, 'function')
  assert.ok(JSON.stringify(app.components.get('sidebar.brand.name').component({})).includes('Delta 桌面'))
  assert.match(JSON.stringify(app.components.get('sidebar.brand.mark').component({})), /Δ/)
  const hover = app.components.get('sidebar.session.row.hover')
  assert.equal(hover.spec.id, 'delta.session.identity')
  assert.match(JSON.stringify(hover.component({ sessionId: '0123456789abcdef' })), /0123456789ab/)
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
  assert.equal(app.components.has('shell.overlay'), false)
  assert.notEqual(app.workspaces.delete, app.originalDelete, 'ZIP adds a default-workspace deletion safeguard')
  const palette = app.layers.get(app.registration.id)
  assert.equal(palette['--dsw-alias-brand-primary'].light, '#286F78')
  assert.equal(palette['--dsw-alias-brand-primary'].dark, '#60B4BF')
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.id, 'delta.personalization')
  assert.equal(entry.spec.label(), '个性设置')
  const controller = entry.spec.inject().controller
  assert.equal(controller.getSnapshot().error, false, 'ZIP palette must be owned before reporting readiness')
  assert.match(JSON.stringify(entry.component({ controller })), /data-delta-personalization/,
    'ZIP settings own the UI and do not reintroduce the removed brand heading')
  assert.match(JSON.stringify(entry.component({ controller })), /dtd-preference-row/)
  controller.setMode('official')
  assert.equal(app.layers.size, 0, 'official mode releases the ZIP theme tokens')
  assert.equal(app.layers.size, 0)
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), undefined)
  assert.equal(app.components.has('sidebar.brand.mark'), false, 'official theme restores the native mark fallback')
  assert.equal(app.components.has('sidebar.brand.name'), false, 'official theme restores the native name fallback')
  assert.equal(hover.component({ sessionId: 'abc' }), null, 'official theme hides Delta hover extras')
  controller.openConversation()
  controller.toggleSidebar()
  assert.deepEqual(app.changes, [null, 'sidebar'])
  controller.setMode('delta')
  assert.equal(controller.getSnapshot().error, false)
  assert.equal(app.layers.size, 1)
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
  assert.equal(app.components.has('sidebar.brand.mark'), true, 'Delta mark returns only in Delta theme')
  assert.equal(app.components.has('sidebar.brand.name'), true, 'Delta name returns only in Delta theme')
  assert.match(JSON.stringify(hover.component({ sessionId: 'abc' })), /abc/)
  assert.match(app.stored, /"mode":"delta"/)
  app.documentElement.lang = 'en'
  app.context.observers.forEach(notify => notify())
  assert.match(JSON.stringify(entry.component({ controller })), /data-delta-personalization/,
    'language changes must preserve the ZIP settings surface')
  assert.equal(entry.spec.label(), 'Personalization')
  app.cleanup(); app.cleanup()
  assert.equal(app.layers.size, 0)
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), undefined)
  assert.ok(app.removed >= 2, 'ZIP theme and isolated feature CSS must both be cleaned up')
  assert.equal(app.workspaces.delete, app.originalDelete, 'Host workspace service remains unchanged')
  controller.setMode('delta')
  assert.equal(app.layers.size, 0)
  assert.equal(app.components.size, 0, 'plugin Settings contribution is removed on disable')
})
test('missing native layout does not report successful no-op actions', () => {
  const app = harness({ failLayout: true })
  const controller = app.components.get('settings.section').spec.inject().controller
  controller.toggleSidebar()
  assert.equal(controller.getSnapshot().error, true)
  controller.openConversation()
  assert.equal(controller.getSnapshot().error, true)
  assert.deepEqual(app.changes, [])
  app.cleanup()
})

test('missing theme keeps the independent Settings entry usable', () => {
  const app = harness({ failTheme: true })
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.label(), '个性设置')
  const controller = entry.spec.inject().controller
  assert.equal(controller.getSnapshot().error, true)
  assert.equal(app.layers.size, 0, 'missing theme must not install a broken palette')
  assert.ok(JSON.stringify(entry.component({ controller })).includes('此版本缺少必要能力'))
  assert.match(JSON.stringify(entry.component({ controller })), /dtd-error/)
  controller.setMode('official')
  assert.equal(controller.getSnapshot().error, false)
  app.cleanup()
  assert.equal(app.components.size, 0)
})

test('invalid persisted values and missing theme services are recoverable', () => {
  const official = harness({ stored: JSON.stringify({ schema: 1, mode: 'official' }) })
  assert.equal(official.layers.size, 0)
  official.cleanup()
  const invalid = harness({ stored: '{"schema":2,"mode":"official"}' })
  assert.equal(invalid.layers.size, 1)
  invalid.cleanup()
  const failed = harness({ failTheme: true })
  const controller = failed.components.get('settings.section').spec.inject().controller
  assert.equal(controller.getSnapshot().error, true)
  controller.setMode('official')
  assert.equal(controller.getSnapshot().mode, 'official')
  failed.cleanup()
})
test('package identity, localization and assets are independent', () => {
  const base = '../packages/dsh-delta-desktop/'
  const json = path => JSON.parse(readFileSync(new URL(base + path, import.meta.url), 'utf8'))
  const pkg = json('package.json')
  assert.equal(pkg.name, '@fongap-labs/dsh-delta-desktop')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, [], 'optional UI dependencies must never block web boot')
  assert.equal(pkg.description, json('locale/en.json').meta.description)
  assert.equal(json('locale/zh.json').meta.title, 'Delta 桌面')
  assert.equal(pkg.dependencies?.['@deepseek-ai/cordis'], undefined)
  const rel = json('../../projects/dsh-delta-desktop/release.manifest.json')
  assert.equal(rel.release_key, 'dsh-delta-desktop')
})

test('obsolete standalone routes and UI packages are excluded from Desktop', () => {
  assert.equal(existsSync(fixture('packages/dsh-ui-delta')), false)
  assert.equal(existsSync(fixture('packages/dsh-theme-delta')), false)
  assert.equal(existsSync(fixture('packages/dsh-delta-desktop/src/host/routes.ts')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-poc-host.mjs')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-suite-ui.mjs')), false)
  assert.match(source, /const settingsModules/)
})

test('workspace deletion remains Host owned regardless of appearance mode', async () => {
  const app = harness()
  assert.notEqual(app.workspaces.delete, app.originalDelete,
    'ZIP protects the default workspace through a guarded Host call')
  await assert.rejects(() => app.workspaces.delete('default'), /delta\/protected-default-workspace/)
  await app.workspaces.delete('other')
  const controller = app.components.get('settings.section').spec.inject().controller
  controller.setMode('official')
  app.cleanup()
  assert.equal(app.workspaces.delete, app.originalDelete, 'the Host method is restored on disposal')
  assert.deepEqual(app.deletedWorkspaces, ['other'])
})

test('ZIP personalization keeps its layout and includes only a collapsed feature extension', () => {
  const app = harness()
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const rendered = JSON.stringify(entry.component({ controller }))
  assert.ok(rendered.includes('data-delta-personalization'), 'ZIP Settings page is retained')
  assert.ok(rendered.includes('dtd-privacy-card'), 'ZIP privacy card is retained')
  assert.ok(rendered.includes('dtd-advanced-features'), 'additions start collapsed inside ZIP Settings')
  const page = entry.component({ controller })
  const advanced = page.children.find(child => child?.type === 'details' && child.props?.className === 'dtd-advanced-features')
  assert.ok(advanced, 'optional settings are appended to the ZIP Settings page')
  assert.ok(advanced.children.some(child => child?.type?.name === 'FeaturePreferencesSection'),
    'the feature settings component is nested rather than replacing the ZIP UI')
  assert.equal(app.deletedWorkspaces.length, 0, 'rendering settings must not mutate Host workspaces')
  const css = readFileSync(fixture('packages/dsh-delta-desktop/src/theme.css'), 'utf8')
  assert.ok(css.includes('dtd-'), 'ZIP design system is preserved')
  controller.setMode('official')
  assert.equal(app.layers.size, 0)
  app.cleanup()
})

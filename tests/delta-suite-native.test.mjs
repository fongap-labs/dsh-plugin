import { test } from 'node:test'
import { buildDesktopClientFixture } from './helpers/build-suite-client.mjs'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Central CI invokes node --test directly, so build the actual client artifact here.
const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
const uiZh = JSON.parse(readFileSync(fixture('packages/delta-suite/locale/zh.json'), 'utf8')).ui
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/delta-suite/tsconfig.json')], { stdio: 'pipe' })
const source = buildDesktopClientFixture()
function harness({ stored = null, failTheme = false, failLayout = false, modelDirectories, fetchImpl, localeService, unavailableService, unavailableSlot, initialAppearance, failThemeRelease = false, supportsSidebarPatch = false, fallbackTheme, nativeMenus = false, rejectWorkspaceMenu = false, rejectSessionMenu = false, rejectStyleMarker, failStyleRemoveOnce, accountServices, failStyleMountOnce } = {}) {
  let registration
  const effects = [], slots = [], layers = new Map(), changes = []
  const menus = new Map()
  const menuReleases = []
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
  if (initialAppearance !== undefined) attributes.set('data-delta-ui', initialAppearance)
  if (fallbackTheme) attributes.set('data-ds-theme-source', 'system')
  let appearanceWrites = 0
  const documentElement = { lang: 'zh-CN',
    setAttribute(key, value) { appearanceWrites++; attributes.set(key, value) },
    removeAttribute(key) { attributes.delete(key) },
    getAttribute(key) { return attributes.get(key) },
  }
  const styles = new Set()
  let didFailStyleRemove = false
  let didFailStyleMount = false
  const head = { appendChild(tag) {
    styles.add(tag)
    tag.parentNode = { removeChild(value) {
      if (failStyleRemoveOnce && failStyleRemoveOnce in value.dataset && !didFailStyleRemove) {
        didFailStyleRemove = true
        throw Error('style removal failed once')
      }
      removed++; styles.delete(value); value.parentNode = null
    } }
    if (failStyleMountOnce && failStyleMountOnce in tag.dataset && !didFailStyleMount) {
      didFailStyleMount = true
      throw Error('style append failed once after attachment')
    }
    if (rejectStyleMarker && rejectStyleMarker in tag.dataset) throw Error('style append failed after attachment')
  } }
  const fallbackDocument = fallbackTheme ? {
    body: {
      hasAttribute(key) { return key === 'data-ds-dark-theme' && fallbackTheme === 'dark' },
      getAttribute() { return null },
      setAttribute() {},
      removeAttribute() {},
    },
    defaultView: { getComputedStyle() {
      return { getPropertyValue(key) {
        if (fallbackTheme === 'blocked') return 'host-value'
        const css = [...styles].find(style => 'deltaThemeFallback' in style.dataset)?.textContent
        const rule = css?.split('\n')[fallbackTheme === 'dark' ? 1 : 0]
        return rule?.split(key + ':')[1]?.split(';')[0] ?? ''
      } }
    } },
  } : {}
  const context = {
    observers: [],
    ...(supportsSidebarPatch ? { CSS: { supports() { return true } } } : {}),
    localeObserverOptions: [],
    localeObserverDisconnects: 0,
    localeListeners: [],
    window: { __ModuleLoader__: { load(entry) { registration = entry } } },
    document: { documentElement, head, ...fallbackDocument, createElement(name) { return { name, dataset: {}, textContent: '', parentNode: null } } },
    navigator: { language: 'en-US' },
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    localStorage: { getItem() { return stored }, setItem(_key, value) { stored = value } },
    MutationObserver: class {
      constructor(callback) { context.observers.push(callback) }
      observe(target, options) { context.localeObserverOptions.push({ target, options }) }
      disconnect() { context.localeObserverDisconnects++ }
    },
  }
  const fixtureEnd = '\n})();\n'
  assert.ok(source.endsWith(fixtureEnd), 'compiled client closure is available for fixture-only instrumentation')
  const fixtureSource = source.slice(0, -fixtureEnd.length) +
    '\n;globalThis.testDeltaFeatures = deltaFeatures\n})();\n'
  vm.runInNewContext(fixtureSource, context)
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
  let localeInjection
  let nativeLocale = localeService === undefined ? {
    getSnapshot() { return { active: documentElement.lang } },
    subscribe(callback) {
      context.localeListeners.push(callback)
      return () => { context.localeListeners = context.localeListeners.filter(item => item !== callback) }
    },
  } : localeService
  const ctx = {
    inject(services, callback) {
      const names = Array.from(services)
      if (names.join(',') === unavailableService) throw new Error('unsupported Host service')
      assert.ok(['slots', 'theme', 'layout', 'workspaces', 'sessions,uiWorkspace', 'remoteAccess',
        'sessions,resources,sidebarRightTabs,sidebarRight', 'configForms,remote',
        'modelDirectories', 'locale', 'contextMenus', 'accountUi,remote,remote.account,remoteAccess'].includes(names.join(',')))
      // Optional model directories may be absent on older Hosts.
      if (names.join(',') === 'modelDirectories' && !modelDirectories) return
      if (names.join(',') === 'locale') {
        localeInjection = callback
        if (!nativeLocale) return
      }
      if (names.join(',') === 'contextMenus' && !nativeMenus) return
      if (names.join(',') === 'accountUi,remote,remote.account,remoteAccess' && !accountServices) return
      // Cordis throws for undeclared services even when optional chaining is used.
      callback(new Proxy(ctx, { get(target, property) {
        if (property === 'contextMenus' && names.join(',') !== 'contextMenus') throw new Error('undeclared contextMenus')
        if (property === 'locale') {
          if (names.join(',') !== 'locale') throw new Error('cannot get property "locale" without inject')
          return nativeLocale
        }
        return Reflect.get(target, property)
      } }))
    },
    effect(create) { effects.push(create()) },
    workspaces,
    modelDirectories,
    ...accountServices,
    contextMenus: nativeMenus ? { register(spec) {
      if (rejectWorkspaceMenu && spec.target === 'workspace') throw new Error('unsupported workspace target')
      if (rejectSessionMenu && spec.id === 'session.delta.lock') throw new Error('failed session contribution')
      menus.set(spec.id, spec)
      return () => { menuReleases.push(spec.id); menus.delete(spec.id) }
    } } : undefined,
    theme: { overrideTokens(id, values) {
      if (failTheme) throw new Error('theme unavailable')
      layers.set(id, values)
      return () => {
        if (failThemeRelease) throw new Error('theme release unavailable')
        layers.delete(id)
      }
    } },
    layout: failLayout ? undefined : { toggleSidebar() { changes.push('sidebar') }, selectPanel(id) { changes.push(id) } },
    slots: {
      inject(name, register) {
        slots.push(name)
        if (name === unavailableSlot) throw new Error('unsupported Host Slot')
        const dispose = register()
        if (typeof dispose === 'function') effects.push(dispose)
      },
      register(spec, component) { components.set(spec.name, { spec, component }); return () => components.delete(spec.name) },
    },
  }
  client.apply(ctx)
  return { registration, context, documentElement, components, slots, layers, changes, styles, nativeTheme: ctx.theme, menus, menuReleases,
    workspaces, deletedWorkspaces, originalDelete, defaultSessions,
    features: context.testDeltaFeatures,
    replaceLocale(service) {
      nativeLocale = service
      if (localeInjection) ctx.inject(['locale'], localeInjection)
    },
    cleanup() { effects.forEach(fn => fn?.()) },
    get removed() { return removed },
    get appearanceWrites() { return appearanceWrites },
    get stored() { return stored } }
}
test('lazy ModuleLoader registration and browser-safe artifact', () => {
  let loaded
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(x) { loaded = x } } } })
  assert.equal(loaded.id, '@fongap-labs/delta-suite')
  assert.equal(typeof loaded.factory, 'function')
  assert.doesNotMatch(source, /__DELTA_SUITE_|process\.env|from\s+['"]/)
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
  assert.deepEqual(app.slots, ['settings.section', 'settings.section.icon', 'settings.plugins.tab', 'plugins.bundle.config', 'conversation.input.model.label', 'sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.session.row.trailing', 'sidebar.session.row.hover'])
  assert.equal(app.components.has('settings.models.footer'), false,
    'unverified Gateway discovery must not register a Models footer')
  assert.equal(typeof app.components.get('settings.section.icon').component, 'function')
  assert.ok(JSON.stringify(app.components.get('sidebar.brand.name').component({})).includes('Delta Suite'))
  assert.match(JSON.stringify(app.components.get('sidebar.brand.mark').component({})), /Δ/)
  const hover = app.components.get('sidebar.session.row.hover')
  assert.equal(hover.spec.id, 'delta.session.identity')
  assert.equal(hover.component({ sessionId: '0123456789abcdef' }), null, 'cold protection state never renders session identity')
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
  assert.equal(app.components.has('shell.overlay'), false)
  assert.equal(app.workspaces.delete, app.originalDelete,
    'Workspace mutation authorization remains Host-owned')
  const palette = app.layers.get(app.registration.id)
  assert.equal(palette['--dsw-alias-brand-primary'].light, '#286F78')
  assert.equal(palette['--dsw-alias-brand-primary'].dark, '#60B4BF')
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.id, 'delta.personalization')
  assert.equal(entry.spec.label(), 'Delta Suite')
  const tab = app.components.get('settings.plugins.tab')
  assert.equal(tab.spec.id, 'delta.suite.configuration')
  assert.equal(tab.spec.label(), 'Delta Suite')
  assert.equal(tab.component, entry.component, 'both Host entries use the same Settings page')
  const bundle = app.components.get('plugins.bundle.config')
  assert.equal(bundle.spec.name, 'plugins.bundle.config')
  assert.equal(bundle.spec.key, '@fongap-labs/delta-suite',
    'installed-bundle configuration is keyed by package name, not the Cordis row id')
  assert.equal(bundle.component({ view: 'summary' }), null, 'bundle configuration does not double-render a summary')
  const controller = entry.spec.inject().controller
  assert.equal(tab.spec.inject().controller, controller, 'both Host entries use the same controller')
  const bundleView = bundle.component({ view: 'page' })
  assert.equal(bundleView.type.name, 'PersonalizationSection',
    'installed bundle uses the same real Settings React component')
  assert.equal(bundleView.props.controller, controller, 'installed bundle shares the same live controller')
  assert.match(JSON.stringify(bundleView.type(bundleView.props)), /data-delta-personalization/,
    'installed bundle renders the actual configuration form')

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
  assert.equal(app.components.has('plugins.bundle.config'), true,
    'installed plugin configuration remains accessible in official theme mode')
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
  assert.equal(hover.component({ sessionId: 'abc' }), null, 'theme change does not authorize a cold session identity')
  assert.match(app.stored, /"mode":"delta"/)
  app.documentElement.lang = 'en'
  app.context.localeListeners.forEach(notify => notify())
  assert.match(JSON.stringify(entry.component({ controller })), /data-delta-personalization/,
    'language changes must preserve the ZIP settings surface')
  assert.equal(entry.spec.label(), 'Delta Suite')
  assert.equal(tab.spec.label(), 'Delta Suite')
  app.cleanup(); app.cleanup()
  assert.equal(app.layers.size, 0)
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), undefined)
  assert.ok(app.removed >= 2, 'ZIP theme and isolated feature CSS must both be cleaned up')
  assert.equal(app.workspaces.delete, app.originalDelete, 'Host workspace service remains unchanged')
  controller.setMode('delta')
  assert.equal(app.layers.size, 0)
  assert.equal(app.components.size, 0, 'plugin Settings contribution is removed on disable')
})


test('Gateway Effort footer stays absent without a verified Host request proxy', () => {
  const app = harness({
    modelDirectories: { directoryFor() { throw Error('no implicit model catalog access') } },
  })
  try {
    app.features.setActiveSessionId('session-one')
    assert.equal(app.components.has('settings.models.footer'), false)
    assert.doesNotMatch(source, /scope\.slots\.inject\('settings\.models\.footer'/)
    const gateway = readFileSync(fixture('packages/delta-suite/src/host-gateway-effort.ts'), 'utf8')
    assert.match(gateway, /export function installHostGatewayEffortSync\(/)
    assert.match(gateway, /return \(\) => \{\}/)
  } finally { app.cleanup() }
})

test('Gateway discovery does not initiate unauthorized network requests', async () => {
  const requests = []
  let directoryReads = 0
  const app = harness({
    modelDirectories: { directoryFor() {
      directoryReads++
      throw Error('unverified catalog must not be read')
    } },
    fetchImpl: async path => {
      requests.push(path)
      throw Error('unexpected Gateway HTTP request')
    },
  })
  try {
    app.features.setActiveSessionId('session-one')
    assert.equal(app.components.has('settings.models.footer'), false)
    await Promise.resolve()
    assert.equal(directoryReads, 0)
    assert.deepEqual(requests.filter(path =>
      String(path).includes('/api/delta-suite/gateway-effort/')), [])
  } finally { app.cleanup() }
})

test('removed network proxy and Vision Bridge have no client manager controls', () => {
  const app = harness()
  try {
    const state = app.features.getSnapshot()
    for (const id of ['proxy', 'effectiveProxy', 'proxyBusy', 'vision', 'visionEngineReady']) {
      assert.equal(Object.prototype.hasOwnProperty.call(state, id), false)
    }
    for (const op of ['saveProxy', 'saveVision', 'testVisionEngine']) assert.equal(op in app.features, false)
  } finally { app.cleanup() }
})

test('Settings identifies unsupported Host contracts without claiming native takeover', () => {
  const app = harness()
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const required = JSON.parse(readFileSync(fixture('projects/delta-suite/feature-readiness.json'), 'utf8')).required
  const contracts = [
    'sidebar_search_placement',
    'sidebar_navigation_order',
    'workspace_initial_collapse',
    'default_workspace_delete_guard',
    'conversation_status_presentation',
  ]
  for (const capability of contracts) {
    assert.equal(required[capability], false, 'unsupported Host contract must remain not-ready: ' + capability)
  }
  const zh = JSON.parse(readFileSync(fixture('packages/delta-suite/locale/zh.json'), 'utf8')).ui
  const en = JSON.parse(readFileSync(fixture('packages/delta-suite/locale/en.json'), 'utf8')).ui
  const serialized = () => JSON.stringify(entry.component({ controller }))
  let markup = serialized()
  assert.match(markup, /data-delta-integration-status/)
  assert.ok(markup.includes(zh.integrationTitle))
  assert.ok(markup.includes(zh.integrationGuidance))
  assert.ok(markup.includes(zh.integrationReasoning))
  assert.equal((markup.match(/dtd-integration-native/g) ?? []).length, 4,
    'all four unsupported native contracts must show a fallback, never fake success')
  for (const label of [zh.integrationSidebar, zh.integrationCollapse,
    zh.integrationDeletion, zh.integrationRunning]) assert.ok(markup.includes(label))
  assert.doesNotMatch(markup, /Host capability ready|Host-side mutation enabled/)

  controller.setMode('official')
  markup = serialized()
  assert.ok(markup.includes(zh.integrationTitle),
    'native fallback explanations remain visible in official appearance')
  assert.equal((markup.match(/dtd-integration-native/g) ?? []).length, 4)

  app.documentElement.lang = 'en'
  app.context.localeListeners.forEach(notify => notify())
  markup = serialized()
  assert.ok(markup.includes(en.integrationTitle))
  assert.ok(markup.includes(en.integrationReasoning))
  assert.ok(markup.includes(en.integrationGuidance))
  assert.equal((markup.match(/dtd-integration-native/g) ?? []).length, 4)
  const pluginEntry = app.components.get('plugins.bundle.config')
  const bundleView = pluginEntry.component({ view: 'page' })
  assert.ok(JSON.stringify(bundleView.type(bundleView.props)).includes('data-delta-integration-status'),
    'installed-bundle config and Settings share the same live Host report')
  app.cleanup()
  assert.equal(app.components.size, 0)
})


test('published Session hover Slot shows only an authorized, path-free identity and safely copies it', async () => {
  const app = harness()
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const hover = app.components.get('sidebar.session.row.hover')
  assert.equal(hover.component({ sessionId: '0123456789abcdef' }), null,
    'unconfirmed protection state must not expose a Session identity')

  let locks = []
  let workspaces = []
  let deleted = []
  const copied = []
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.navigator.clipboard = {
    writeText(id) {
      copied.push(id)
      return new Promise(() => {})
    },
  }
  app.context.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ state: {
      hasPin: true, lockMode: 'pin', lockedSessionIds: locks,
      lockedWorkspaceIds: workspaces, deletedSessionIds: deleted,
      movedSessions: {},
    } }),
  })
  await app.features.refreshState()
  const visible = hover.component({ sessionId: '0123456789abcdef' })
  assert.equal(visible?.type, 'div')
  assert.equal(visible?.props?.role, 'group')
  assert.equal(visible?.props?.hidden, undefined, 'hover content must no longer be permanently hidden')
  assert.equal(visible?.props?.['aria-hidden'], undefined)
  assert.equal(visible.children[1]?.children[0], '0123456789ab…')
  assert.equal(visible.children[1]?.props?.title, undefined,
    'a hover tooltip must not reveal a full raw identifier')
  assert.doesNotMatch(JSON.stringify(visible), /Documents|default-workspace|Users/,
    'Host filesystem paths never enter the Delta-owned hover fragment')
  const copy = visible.children[2]
  assert.equal(copy.type, 'button')
  let stopped = 0
  copy.props.onPointerDown({ stopPropagation() { stopped++ } })
  copy.props.onClick({ stopPropagation() { stopped++ } })
  assert.equal(stopped, 2, 'copy never selects or opens the native Session row')
  assert.deepEqual(copied, ['0123456789abcdef'])

  locks = ['0123456789abcdef']
  await app.features.refreshState()
  assert.equal(hover.component({ sessionId: '0123456789abcdef' }), null,
    'a locked Session loses its hover identity immediately')
  copy.props.onClick({ stopPropagation() { stopped++ } })
  assert.deepEqual(copied, ['0123456789abcdef'],
    'an old button cannot copy after protection revision invalidates it')

  locks = []
  workspaces = ['default']
  await app.features.refreshState()
  assert.equal(hover.component({ sessionId: 'session-one' }), null,
    'the Host workspace membership snapshot excludes inherited locks')
  workspaces = []
  deleted = ['session-one']
  await app.features.refreshState()
  assert.equal(hover.component({ sessionId: 'session-one' }), null,
    'tombstoned Sessions never show identity')

  deleted = []
  await app.features.refreshState()
  controller.setMode('official')
  assert.equal(hover.component({ sessionId: 'session-one' }), null,
    'official appearance retains the native hover card unchanged')
  controller.setMode('delta')
  assert.equal(hover.component({ sessionId: 'session-one' })?.type, 'div')
  app.cleanup()
  assert.equal(app.components.has('sidebar.session.row.hover'), false,
    'disposing the Suite unregisters the public hover contribution')
})


test('hover copy rejects stale actions and suppresses late clipboard feedback across mode changes and unload', async () => {
  const app = harness()
  const controller = app.components.get('settings.section').spec.inject().controller
  const hover = app.components.get('sidebar.session.row.hover')
  const pending = [], copies = [], toasts = new Set(), timers = new Map()
  let serial = 0
  app.context.document.body = {
    getAttribute() { return null },
    setAttribute() {}, removeAttribute() {},
    appendChild(node) { toasts.add(node) },
  }
  const createElement = app.context.document.createElement
  app.context.document.createElement = name => ({
    ...createElement(name), setAttribute() {}, remove() { toasts.delete(this) },
  })
  app.context.window.setTimeout = callback => { timers.set(++serial, callback); return serial }
  app.context.window.clearTimeout = id => { timers.delete(id) }
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.navigator.clipboard = { writeText(id) {
    copies.push(id)
    return new Promise((resolve, reject) => pending.push({ resolve, reject }))
  } }
  let lockedSessionIds = []
  app.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ state: {
    hasPin: true, lockMode: 'pin', lockedSessionIds, lockedWorkspaceIds: [],
    deletedSessionIds: [], movedSessions: {},
  } }) })
  await app.features.refreshState()
  const render = () => hover.component({ sessionId: 'session-one' }).children[2]
  const click = button => button.props.onClick({ stopPropagation() {} })
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve() }
  const old = render()
  click(old)
  controller.setMode('official')
  controller.setMode('delta')
  pending[0].resolve()
  await flush()
  assert.equal(toasts.size, 0)
  click(old)
  assert.equal(copies.length, 1)
  click(render())
  lockedSessionIds = ['session-one']
  await app.features.refreshState()
  pending[1].reject(Error('clipboard denied'))
  await flush()
  assert.equal(toasts.size, 0)
  lockedSessionIds = []
  await app.features.refreshState()
  click(render())
  pending[2].resolve()
  await flush()
  assert.equal(toasts.size, 1)
  click(render())
  pending[3].reject(Error('clipboard denied'))
  await flush()
  assert.equal(toasts.size, 2)
  assert.equal(timers.size, 2)
  const last = render()
  click(last)
  const staleTimers = [...timers.values()]
  app.cleanup()
  assert.equal(toasts.size, 0)
  assert.equal(timers.size, 0)
  pending[4].resolve()
  await flush()
  click(last)
  staleTimers.forEach(callback => callback())
  assert.equal(copies.length, 5)
  assert.equal(toasts.size, 0)
  assert.equal(hover.component({ sessionId: 'session-one' }), null)
})

test('published Session hover renders public catalog time and no record details', async () => {
  const app = harness()
  const hover = app.components.get('sidebar.session.row.hover')
  let records = { 'session-one': { id: 'session-one', workspaceId: 'default',
    updatedAt: '2026-11-18T10:20:00.000Z', hiddenField: 'private value' } }
  app.features.setSessionsApi({ list: { getSnapshot: () => ({ byId: records }) } })
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ state: {
    hasPin: false, lockMode: 'none', lockedSessionIds: [], lockedWorkspaceIds: [],
    deletedSessionIds: [], movedSessions: {},
  } }) })
  try {
    assert.equal(hover.component({ sessionId: 'session-one' }), null)
    await app.features.refreshState()
    let rendered = JSON.stringify(hover.component({ sessionId: 'session-one' }))
    assert.match(rendered, /dtd-session-meta-updated/)
    assert.match(rendered, /2026-11-18T10:20:00.000Z/)
    assert.match(rendered, /\u6700\u8fd1\u66f4\u65b0/)
    assert.doesNotMatch(rendered, /hiddenField|private value/)
    app.documentElement.lang = 'en'
    app.context.localeListeners.forEach(notify => notify())
    rendered = JSON.stringify(hover.component({ sessionId: 'session-one' }))
    assert.match(rendered, /Last updated/)
    records = { 'session-one': { id: 'wrong', updatedAt: '2026-11-18T10:20:00.000Z' } }
    assert.doesNotMatch(JSON.stringify(hover.component({ sessionId: 'session-one' })), /dtd-session-meta-updated/)
    for (const updatedAt of [0, 1730000000, 'invalid']) {
      records = { 'session-one': { id: 'session-one', updatedAt } }
      assert.doesNotMatch(JSON.stringify(hover.component({ sessionId: 'session-one' })), /dtd-session-meta-updated/)
    }
    app.features.setSessionsApi(undefined)
    assert.doesNotMatch(JSON.stringify(hover.component({ sessionId: 'session-one' })), /dtd-session-meta-updated/)
  } finally { app.cleanup() }
})

test('public hover timestamp obeys Session locks, Workspace locks and deletion tombstones', async () => {
  const app = harness()
  const hover = app.components.get('sidebar.session.row.hover')
  app.features.setSessionsApi({ list: { getSnapshot: () => ({ byId: {
    'session-one': { id: 'session-one', workspaceId: 'default', updatedAt: '2026-11-18T10:20:00Z' },
  } }) } })
  let lockedSessionIds = []
  let lockedWorkspaceIds = []
  let deletedSessionIds = []
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ state: {
    hasPin: true, lockMode: 'pin', lockedSessionIds, lockedWorkspaceIds,
    deletedSessionIds, movedSessions: {},
  } }) })
  try {
    await app.features.refreshState()
    assert.match(JSON.stringify(hover.component({ sessionId: 'session-one' })), /dtd-session-meta-updated/)
    lockedSessionIds = ['session-one']
    await app.features.refreshState()
    assert.equal(hover.component({ sessionId: 'session-one' }), null)
    lockedSessionIds = []
    lockedWorkspaceIds = ['default']
    await app.features.refreshState()
    assert.equal(hover.component({ sessionId: 'session-one' }), null)
    lockedWorkspaceIds = []
    deletedSessionIds = ['session-one']
    await app.features.refreshState()
    assert.equal(hover.component({ sessionId: 'session-one' }), null)
    deletedSessionIds = []
    await app.features.refreshState()
    assert.match(JSON.stringify(hover.component({ sessionId: 'session-one' })), /dtd-session-meta-updated/)
  } finally { app.cleanup() }
})


test('native hover revokes ID and stale copy when public catalog changes Workspace ownership', async () => {
  const app = harness()
  const hover = app.components.get('sidebar.session.row.hover')
  const copies = []
  let catalogNotify
  let record = { id: 'unlisted', workspaceId: 'default', updatedAt: '2026-11-18T10:20:00Z' }
  app.features.setSessionsApi({ list: {
    getSnapshot: () => ({ byId: { unlisted: record } }),
    subscribe(fn) { catalogNotify = fn; return () => {} },
  } })
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.navigator.clipboard = { writeText(id) { copies.push(id); return Promise.resolve() } }
  app.context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ state: {
    hasPin: true, lockMode: 'pin', lockedSessionIds: [],
    lockedWorkspaceIds: ['other'], deletedSessionIds: [], movedSessions: {},
  } }) })
  try {
    await app.features.refreshState()
    const visible = hover.component({ sessionId: 'unlisted' })
    assert.equal(visible?.type, 'div')
    assert.match(JSON.stringify(visible), /dtd-session-meta-updated/)
    const oldCopy = visible.children[2]
    assert.equal(oldCopy?.type, 'button')

    // The Host catalog can be newer than the native Workspace member array.
    // A live reparenting event must deny this row even if its time is unchanged.
    record = { ...record, workspaceId: 'other' }
    catalogNotify()
    assert.equal(hover.component({ sessionId: 'unlisted' }), null)
    oldCopy.props.onClick({ stopPropagation() {} })
    assert.deepEqual(copies, [], 'old copy callback rechecks current Host ownership')

    record = { ...record, workspaceId: 'default' }
    catalogNotify()
    assert.equal(hover.component({ sessionId: 'unlisted' })?.type, 'div')

    app.features.setSessionsApi({ list: { getSnapshot() { throw Error('offline') } } })
    assert.equal(hover.component({ sessionId: 'unlisted' }), null,
      'a broken public catalog cannot authorize the previous hover identity')
  } finally { app.cleanup() }
})

test('Client never archives or unarchives Host sessions after state refresh, lock, unlock or unbind', async () => {
  const app = harness()
  const sessionId = 'session-one'
  const nativeMutations = []
  const nativeArchived = []
  app.workspaces.archiveSession = async (id, opts) => { nativeMutations.push(['archive', id, opts]) }
  app.workspaces.unarchiveSession = async id => { nativeMutations.push(['unarchive', id]) }
  app.features.setWorkspacesApi(app.workspaces, () => ({
    items: [{
      workspaceId: 'default', path: '/workspace', title: 'workspace',
      sessionIds: [sessionId],
    }],
    archivedSessionIds: nativeArchived,
  }))
  let isLocked = true
  let hasPin = true
  const state = () => ({
    hasPin, lockMode: hasPin ? 'totp' : 'none',
    lockedSessionIds: isLocked ? [sessionId] : [],
    lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {},
  })
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.fetch = async (path, options = {}) => {
    if (path === '/api/delta-suite/state') {
      return { ok: true, status: 200, json: async () => ({ state: state() }) }
    }
    if (path === '/api/delta-suite/session-lock') {
      const body = JSON.parse(options.body)
      if (body.action === 'unlock') isLocked = false
      if (body.action === 'lock' || body.action === 'setup-confirm') isLocked = true
      if (body.action === 'unbind-2fa') { isLocked = false; hasPin = false }
      return { ok: true, status: 200, json: async () => ({
        ok: true, verified: true, state: state(),
        unarchivedIds: [sessionId], pendingUnarchiveIds: [],
      }) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  try {
    await app.features.refreshState()
    assert.deepEqual(nativeMutations, [],
      'refreshing a locked Session does not retry native archive writes from the Client')
    await app.features.lockSession(sessionId)
    assert.deepEqual(nativeMutations, [],
      'Host lock response already owns native archive mutation')

    // The native archive may predate Delta entirely, or have been made by
    // another plugin. Unlock must honor Host ownership, not infer from UI state.
    nativeArchived.push(sessionId)
    const unlock = await app.features.verifyOrUnlockSession(sessionId, '123456', true)
    assert.equal(unlock.ok, true)
    assert.deepEqual(nativeMutations, [],
      'Client must never unarchive a pre-existing Host record')

    await app.features.lockSession(sessionId)
    const unbind = await app.features.clearPin('123456')
    assert.equal(unbind.ok, true)
    assert.deepEqual(nativeMutations, [],
      'the Host unbind result does not authorize a second Client unarchive')

    isLocked = true
    hasPin = true
    nativeArchived.length = 0
    await app.features.refreshState()
    app.features.setWorkspacesApi(app.workspaces, () => ({
      items: [{ workspaceId: 'default', path: '/workspace', title: 'workspace', sessionIds: [sessionId] }],
      archivedSessionIds: [],
    }))
    assert.deepEqual(nativeMutations, [],
      'Workspace service re-injection does not recreate an archive with no ownership attribution')
  } finally { app.cleanup() }
})

test('public native Session trailing Slot renders only Host-confirmed protected rows', async () => {
  const app = harness()
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const indicator = app.components.get('sidebar.session.row.trailing')
  assert.ok(indicator, 'published Host Session row trailing Slot must be registered')
  assert.equal(indicator.spec.id, 'delta.session.protection')
  assert.equal(indicator.spec.order, 450)
  assert.equal(indicator.component({ sessionId: 'session-one' }), null,
    'an unconfirmed session must not display a claimed lock')
  app.context.window.location = { href: 'https://harness.test/' }
  let locks = ['session-one']
  let workspaces = []
  let deleted = []
  app.context.fetch = async path => ({
    ok: true, status: 200,
    json: async () => path === '/api/delta-suite/state'
      ? { state: {
        hasPin: true, lockMode: 'pin',
        lockedSessionIds: locks, lockedWorkspaceIds: workspaces,
        deletedSessionIds: deleted, movedSessions: {},
      } } : {},
  })
  await app.features.refreshState()
  const direct = indicator.component({ sessionId: 'session-one' })
  assert.equal(direct?.type, 'span')
  assert.equal(direct?.props?.role, 'img')
  assert.match(direct?.props?.className ?? '', /dtd-session-protection-mark/)
  assert.match(direct?.props?.['aria-label'] ?? '', /Locked|\u9501\u5b9a/)
  assert.equal(direct.children[0].type, 'svg')
  assert.equal(indicator.component({ sessionId: 'other' }), null,
    'unprotected Host rows keep their native presentation')

  controller.setMode('official')
  assert.equal(indicator.component({ sessionId: 'session-one' }), null,
    'official mode relinquishes the Delta Slot contribution')
  controller.setMode('delta')

  locks = []
  workspaces = ['default']
  await app.features.refreshState()
  const inherited = indicator.component({ sessionId: 'session-one' })
  assert.match(inherited?.props?.['aria-label'] ?? '', /Workspace|\u5de5\u4f5c\u533a/,
    'native Workspace membership triggers the inherited lock indicator')

  workspaces = []
  deleted = ['session-one']
  await app.features.refreshState()
  assert.equal(indicator.component({ sessionId: 'session-one' }), null,
    'a tombstoned session never receives a visual badge')
  app.cleanup()
  assert.equal(app.components.has('sidebar.session.row.trailing'), false,
    'Slot unregisters on plugin disable without touching native DOM')
})

test('public model route label mounts without optional assistant sidebar services', () => {
  const app = harness()
  const modelSlot = app.components.get('conversation.input.model.label')
  assert.ok(modelSlot, 'model route label must not depend on optional sidebarRight services')
  assert.equal(modelSlot.spec.id, 'delta.model.route-label')
  const account = modelSlot.component({
    provider: { id: 'deepseek-account', name: 'DeepSeek Account' },
    model: { name: 'DeepSeek-V3' }, placement: 'selected',
  })
  assert.match(JSON.stringify(account), /DeepSeek Account/)
  assert.match(JSON.stringify(account), /DeepSeek-V3/)
  const unrelated = modelSlot.component({
    provider: { id: 'openai', name: 'OpenAI' },
    model: { name: 'gpt-4o' }, placement: 'selected',
  })
  assert.doesNotMatch(JSON.stringify(unrelated), /dtd-model-account/)
  assert.match(JSON.stringify(unrelated), /gpt-4o/)
  assert.equal(unrelated?.props?.title, undefined, 'no Host effort metadata means no inferred levels')
  const advertised = modelSlot.component({
    provider: { id: 'openai', name: 'OpenAI' },
    model: { name: 'Gateway Max', reasoning: { efforts: [
      { id: 'off', name: 'Off' }, { id: 'high', name: 'High' },
    ] } }, placement: 'trigger',
  })
  assert.match(advertised.props.title, /Off, High/,
    'Delta only describes the exact reasoning levels in the public Host model catalog')
  assert.ok(advertised.props.title.includes(uiZh.modelReasoningLevels))
  const unsupported = modelSlot.component({
    provider: { id: 'openai', name: 'OpenAI' },
    model: { name: 'Gateway Max', reasoningEfforts: { high: 'high' } }, placement: 'option',
  })
  assert.equal(unsupported.props.title, undefined,
    'unrecognized owner fields cannot promote a Gateway model to supported Effort')
  const option = modelSlot.component({
    provider: { id: 'deepseek-account', name: 'DeepSeek Account' },
    model: { name: 'DeepSeek-V3' }, placement: 'option',
  })
  assert.doesNotMatch(JSON.stringify(option), /dtd-model-account/)
  app.cleanup()
  assert.equal(app.components.has('conversation.input.model.label'), false,
    'disabling the plugin unregisters its model label without changing the native model picker')
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

test('appearance Patch restores the original value and avoids repeated writes on locale updates', () => {
  const app = harness({ initialAppearance: 'host-value' })
  const controller = app.components.get('settings.section').spec.inject().controller
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
  const writes = app.appearanceWrites
  app.documentElement.lang = 'fr'
  app.context.localeListeners.forEach(notify => notify())
  assert.equal(app.appearanceWrites, writes)
  controller.setMode('official')
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'host-value')
  controller.setMode('delta')
  app.documentElement.setAttribute('data-delta-ui', 'other-owner')
  app.cleanup()
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'other-owner')
})

test('sidebar layout Patch is scoped to expanded native structure and Delta mode', () => {
  const app = harness({ supportsSidebarPatch: true })
  const controller = app.components.get('settings.section').spec.inject().controller
  const patches = () => [...app.styles].filter(style => 'deltaSidebarLayout' in style.dataset)
  assert.equal(patches().length, 1)
  const css = patches()[0].textContent
  assert.ok(css.includes(':root[data-delta-ui="delta"] [data-sidebar-scrollport]:has(> nav + div [data-slot="sidebar.workspaces"])'))
  assert.ok(css.includes('grid-template-rows: 8px max-content 2px minmax(0, 1fr)'))
  assert.ok(css.includes('container-type: size'))
  assert.ok(css.includes('div:has(> [data-slot="sidebar.session.action"])'))
  assert.ok(css.includes('grid-area: 4 / 1; position: relative;'))
  assert.ok(css.includes('grid-area: 3 / 1 / 6 / 2; grid-template-rows: subgrid'))
  assert.ok(css.includes('> nav { grid-row: 1; }'))
  assert.ok(css.includes('> nav + div { grid-row: 3; container-type: size;'))
  assert.ok(css.includes(':not([data-sidebar-scrollport]) > nav'))
  assert.doesNotMatch(css, /!important|display:\s*none|\[class\*=/)
  app.context.localeListeners.forEach(notify => notify())
  assert.equal(patches().length, 1)
  controller.setMode('official')
  assert.equal(patches().length, 0)
  controller.setMode('delta')
  assert.equal(patches().length, 1)
  app.cleanup()
  assert.equal(patches().length, 0)
})

test('sidebar ordering retains the basic fixed-layout fallback when subgrid is unavailable', () => {
  const app = harness({ supportsSidebarPatch: true })
  const controller = app.components.get('settings.section').spec.inject().controller
  controller.setMode('official')
  app.context.CSS.supports = (property, value) => value !== 'subgrid'
  controller.setMode('delta')
  const css = [...app.styles].find(style => 'deltaSidebarLayout' in style.dataset).textContent
  assert.ok(css.includes('grid-template-rows: 8px max-content 2px minmax(0, 1fr)'))
  assert.ok(!css.includes('grid-template-rows: subgrid'))
  app.cleanup()
})

test('owned style mount failures roll back only the failed node and preserve public features', () => {
  for (const marker of ['plugin', 'deltaSidebarLayout', 'deltaThemeFallback']) {
    const app = harness({
      supportsSidebarPatch: true,
      rejectStyleMarker: marker,
      ...(marker === 'deltaThemeFallback' ? { unavailableService: 'theme', fallbackTheme: 'light' } : {}),
    })
    assert.ok(app.components.has('settings.section'), marker)
    assert.ok(app.components.has('sidebar.session.row.hover'), marker)
    assert.equal([...app.styles].some(style => marker in style.dataset), false, marker)
    assert.ok([...app.styles].some(style => (marker === 'plugin' ? 'deltaSidebarLayout' : 'plugin') in style.dataset), marker)
    if (marker === 'deltaThemeFallback') {
      assert.equal(app.components.get('settings.section').spec.inject().controller.getSnapshot().error, true)
    }
    app.cleanup()
    assert.equal(app.styles.size, 0, marker)
  }
})

test('a transient sidebar style removal failure does not stack another Patch', () => {
  const app = harness({ supportsSidebarPatch: true, failStyleRemoveOnce: 'deltaSidebarLayout' })
  const controller = app.components.get('settings.section').spec.inject().controller
  const patches = () => [...app.styles].filter(style => 'deltaSidebarLayout' in style.dataset)
  const first = patches()[0]
  controller.setMode('official')
  assert.equal(patches().length, 1)
  controller.setMode('delta')
  assert.equal(patches().length, 1)
  assert.equal(patches()[0], first)
  controller.setMode('official')
  assert.equal(patches().length, 0)
  controller.setMode('delta')
  assert.equal(patches().length, 1)
  app.cleanup()
  assert.equal(app.styles.size, 0)
})

test('sidebar layout Patch retries on a later controller publication after capabilities become available', () => {
  const app = harness()
  const patches = () => [...app.styles].filter(style => 'deltaSidebarLayout' in style.dataset)
  assert.equal(patches().length, 0)
  app.context.CSS = { supports() { return true } }
  app.documentElement.lang = 'en-US'
  app.context.localeListeners.forEach(notify => notify())
  assert.equal(patches().length, 1)
  const first = patches()[0]
  app.documentElement.lang = 'zh-CN'
  app.context.localeListeners.forEach(notify => notify())
  assert.equal(patches().length, 1)
  assert.equal(patches()[0], first)
  app.cleanup()
  assert.equal(patches().length, 0)
})

test('sidebar layout Patch recovers from a transient append failure without a mode toggle', () => {
  const app = harness({ supportsSidebarPatch: true, failStyleMountOnce: 'deltaSidebarLayout' })
  const patches = () => [...app.styles].filter(style => 'deltaSidebarLayout' in style.dataset)
  // A subsequent public theme binding may already have retried during mount.
  // In either case an actual locale publication must restore a single Patch.
  app.documentElement.lang = 'en-US'
  app.context.localeListeners.forEach(notify => notify())
  assert.equal(patches().length, 1)
  assert.ok(app.components.has('settings.section'))
  app.cleanup()
  assert.equal(patches().length, 0)
})

test('sidebar layout Patch leaves native layout alone without browser feature support', () => {
  const app = harness()
  assert.equal([...app.styles].some(style => 'deltaSidebarLayout' in style.dataset), false)
  app.cleanup()
})

test('appearance Patch does not claim an already-present marker', () => {
  const app = harness({ initialAppearance: 'delta' })
  assert.equal(app.appearanceWrites, 0)
  app.cleanup()
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
})

test('a failed Host theme disposer reports failure and does not interrupt other cleanup', () => {
  const app = harness({ failThemeRelease: true, localeService: null })
  const controller = app.components.get('settings.section').spec.inject().controller
  assert.doesNotThrow(() => controller.setMode('official'))
  assert.equal(controller.getSnapshot().error, true)
  assert.equal(controller.getSnapshot().mode, 'delta')
  assert.doesNotThrow(() => app.cleanup())
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), undefined)
  assert.equal(app.context.localeObserverDisconnects, 1)
  assert.ok(app.removed >= 2)
  assert.equal(app.components.size, 0)
})

test('missing public Theme uses one verified CSS palette and restores it on public recovery', () => {
  for (const fallbackTheme of ['light', 'dark']) {
    const app = harness({ unavailableService: 'theme', fallbackTheme })
    const controller = app.components.get('settings.section').spec.inject().controller
    const patches = () => [...app.styles].filter(style => 'deltaThemeFallback' in style.dataset)
    assert.equal(controller.getSnapshot().error, false)
    assert.equal(app.layers.size, 0)
    assert.equal(patches().length, 1)
    const css = patches()[0].textContent
    assert.match(css, /body:not\(\[data-ds-dark-theme\]\)/)
    assert.match(css, /body\[data-ds-dark-theme\]/)
    assert.match(css, /--dsw-menu-surface-fill:#FFFFFF;/)
    assert.match(css, /--dsw-menu-surface-fill:#1E1E20;/)
    assert.doesNotMatch(css, /!important/)
    controller.setMode('delta')
    assert.equal(patches()[0].textContent, css)
    controller.setMode('official')
    assert.equal(patches().length, 0)
    controller.setMode('delta')
    assert.equal(patches().length, 1)
    controller.bindTheme(app.nativeTheme)
    assert.equal(patches().length, 0)
    assert.equal(app.layers.size, 1)
    controller.bindTheme(undefined)
    assert.equal(app.layers.size, 0)
    assert.equal(patches().length, 1)
    app.cleanup()
    assert.equal(patches().length, 0)
  }
})

test('Theme Patch rejects a blocked cascade and never stacks over a throwing public API', () => {
  for (const options of [{ unavailableService: 'theme', fallbackTheme: 'blocked' },
    { failTheme: true, fallbackTheme: 'light' }]) {
    const app = harness(options)
    const controller = app.components.get('settings.section').spec.inject().controller
    assert.equal(controller.getSnapshot().error, true)
    assert.equal([...app.styles].some(style => 'deltaThemeFallback' in style.dataset), false)
    app.cleanup()
  }
  const app = harness({ fallbackTheme: 'light' })
  assert.equal(app.layers.size, 1)
  assert.equal([...app.styles].some(style => 'deltaThemeFallback' in style.dataset), false)
  app.cleanup()
})

test('native session menus use explicit public service injection without Search services', () => {
  const app = harness({ nativeMenus: true, unavailableService: 'sessions,uiWorkspace', rejectWorkspaceMenu: true })
  assert.deepEqual([...app.menus.keys()], ['session.delta.move', 'session.delta.lock', 'session.delta.delete'])
  const target = { sessionId: 'session-one', displayTitle: 'Session' }
  const lock = app.menus.get('session.delta.lock')
  const [source] = lock.observe(target)
  assert.equal(source, app.features)
  assert.equal(typeof source.subscribe, 'function')
  assert.equal(typeof source.getSnapshot, 'function')
  const [action] = lock.resolve(target)
  assert.equal(action.icon.key, 'delta.session.lock')
  assert.equal(app.menus.get('session.delta.delete').resolve(target)[0].danger, true)
  assert.equal(app.menus.get('session.delta.move').resolve(target)[0].id, 'delta-move')
  app.cleanup()
  assert.equal(app.menus.size, 0)
  assert.deepEqual(app.menuReleases, ['session.delta.delete', 'session.delta.lock', 'session.delta.move'])
})

test('native menu actions capture valid targets, follow locale updates, and stop after unload', () => {
  const app = harness({ nativeMenus: true })
  const controller = app.components.get('settings.section').spec.inject().controller
  const move = app.menus.get('session.delta.move')
  const lock = app.menus.get('session.delta.lock')
  const remove = app.menus.get('session.delta.delete')
  const workspace = app.menus.get('workspace.delta.lock')
  for (const contribution of [move, lock, remove]) {
    for (const target of [{}, { sessionId: '' }, { sessionId: '  ' }, { sessionId: 1 }]) {
      assert.equal(contribution.resolve(target).length, 0)
    }
    assert.equal(contribution.observe({})[1], controller)
  }
  assert.equal(workspace.resolve({ workspaceId: 7 }).length, 0)
  const calls = []
  app.features.openMoveDialog = (...args) => calls.push(args)
  app.features.openSetPinDialog = (...args) => calls.push(args)
  app.features.openDeleteDialog = (...args) => calls.push(args)
  app.features.openSetPinWorkspaceDialog = (...args) => calls.push(args)
  const target = { sessionId: 'session-one', displayTitle: 'Original' }
  const first = move.resolve(target)[0]
  target.sessionId = 'other'
  first.run()
  assert.deepEqual(calls, [['session-one', 'Original']])
  const chinese = first.label
  app.documentElement.lang = 'en-US'
  app.context.localeListeners.forEach(notify => notify())
  assert.notEqual(move.resolve(target)[0].label, chinese)
  const stale = [move, lock, remove].map(item => item.resolve(target)[0])
  stale.push(workspace.resolve({ workspaceId: 'default' })[0])
  app.cleanup()
  for (const action of stale) action.run()
  assert.equal(calls.length, 1)
  assert.equal(move.resolve(target).length, 0)
  assert.equal(workspace.resolve({ workspaceId: 'default' }).length, 0)
})

test('native menu service absence or partial registration failure preserves independent Settings', () => {
  for (const options of [{}, { nativeMenus: true, rejectSessionMenu: true }]) {
    const app = harness(options)
    assert.equal(app.menus.size, 0)
    assert.ok(app.components.has('settings.section'))
    app.cleanup()
    assert.equal(app.menus.size, 0)
  }
})

test('workspace menu does not produce actions without a captured workspace identity', () => {
  const app = harness({ nativeMenus: true })
  const workspace = app.menus.get('workspace.delta.lock')
  assert.equal(workspace.resolve({}).length, 0)
  assert.equal(workspace.resolve({ workspaceId: 'default' })[0].id, 'delta-workspace-lock')
  app.cleanup()
})

test('appearance controller preserves healthy same-service palettes and releases before replacement', () => {
  const app = harness()
  const controller = app.components.get('settings.section').spec.inject().controller
  const events = []
  const makeTheme = name => ({
    overrideTokens() {
      events.push(name + ':install')
      return () => events.push(name + ':release')
    },
  })
  const first = makeTheme('first')
  const second = makeTheme('second')
  controller.bindTheme(first)
  const revision = controller.getSnapshot().revision
  controller.bindTheme(first)
  controller.setMode('delta')
  controller.activate()
  assert.deepEqual(events, ['first:install'])
  assert.equal(controller.getSnapshot().revision, revision)
  controller.bindTheme(second)
  assert.deepEqual(events, ['first:install', 'first:release', 'second:install'])
  controller.setMode('official')
  controller.bindTheme(first)
  assert.deepEqual(events, ['first:install', 'first:release', 'second:install', 'second:release'])
  controller.setMode('delta')
  assert.equal(events.at(-1), 'first:install')
  app.cleanup()
  assert.equal(events.at(-1), 'first:release')
  const count = events.length
  controller.bindTheme(second)
  controller.activate()
  controller.setMode('delta')
  assert.equal(events.length, count)
})

test('missing theme keeps the independent Settings entry usable', () => {
  const app = harness({ failTheme: true })
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.label(), 'Delta Suite')
  assert.equal(app.components.get('settings.plugins.tab').spec.label(), 'Delta Suite')
  const controller = entry.spec.inject().controller
  assert.equal(controller.getSnapshot().error, true)
  assert.equal(app.layers.size, 0, 'missing theme must not install a broken palette')
  assert.ok(JSON.stringify(entry.component({ controller })).includes(uiZh.unavailable))
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
  const base = '../packages/delta-suite/'
  const json = path => JSON.parse(readFileSync(new URL(base + path, import.meta.url), 'utf8'))
  const pkg = json('package.json')
  assert.equal(pkg.name, '@fongap-labs/delta-suite')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, [], 'optional UI dependencies must never block web boot')
  assert.equal(pkg.description, json('locale/en.json').meta.description)
  assert.equal(json('locale/en.json').meta.title, 'Delta Suite')
  assert.equal(json('locale/zh.json').meta.title, 'Delta Suite')
  assert.equal(pkg.dependencies?.['@deepseek-ai/cordis'], undefined)
  const rel = json('../../projects/delta-suite/release.manifest.json')
  assert.equal(rel.release_key, 'delta-suite')
  assert.equal(rel.release_name, 'Delta Suite')
})

test('obsolete standalone routes and UI packages are excluded from Desktop', () => {
  assert.equal(existsSync(fixture('packages/dsh-ui-delta')), false)
  assert.equal(existsSync(fixture('packages/dsh-theme-delta')), false)
  assert.equal(existsSync(fixture('packages/delta-suite/src/host/routes.ts')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-poc-host.mjs')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-suite-ui.mjs')), false)
  assert.match(source, /const settingsModules/)
  assert.match(source, /scope\.slots\.inject\('settings\.plugins\.tab'/)
})

test('workspace deletion remains exclusively under native Host authorization', async () => {
  const app = harness()
  try {
    assert.equal(app.workspaces.delete, app.originalDelete,
      'Delta must not wrap the Host deletion method')
    assert.equal(app.workspaces.delete, app.originalDelete,
      'Host authorization is untouched in Delta mode')
    const controller = app.components.get('settings.section').spec.inject().controller
    controller.setMode('official')
    assert.equal(app.workspaces.delete, app.originalDelete)
    assert.deepEqual(app.deletedWorkspaces, [])
  } finally { app.cleanup() }
  assert.equal(app.workspaces.delete, app.originalDelete)
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
  const backup = advanced.children.find(child => child?.type?.name === 'PreferenceBackupSection')
  assert.ok(backup, 'portable preference backup stays within collapsed Suite settings')
  const backupPage = backup.type(backup.props)
  const text = backupPage.children.find(child => child?.type === 'textarea')
  assert.equal(text.props.maxLength, 4096)
  assert.equal(text.props.value, '')
  assert.equal(typeof text.props.onChange, 'function')
  assert.equal(app.deletedWorkspaces.length, 0, 'rendering settings must not mutate Host workspaces')
  const css = readFileSync(fixture('packages/delta-suite/src/theme.css'), 'utf8')
  assert.ok(css.includes('dtd-'), 'ZIP design system is preserved')
  controller.setMode('official')
  assert.equal(app.layers.size, 0)
  app.cleanup()
})

test('compiled account controls reject stale gestures and wallet results across account lifetimes', async () => {
  const opened = [], calls = [], events = new Map()
  let nativeState = { view: { status: 'credential-stored', links: { usageUrl: 'https://platform.deepseek.com/usage' } } }
  const grants = new Map()
  const accountServices = {
    accountUi: {
      getSnapshot: () => nativeState,
      clientMetadata: locale => ({ version: 'fixture', locale, timezoneOffsetSeconds: 0 }),
    },
    remote: { account: { getBalance: metadata => new Promise(resolve => calls.push({ metadata, resolve })) } },
    remoteAccess: { whenAccess(action, install) {
      let release
      const toggle = allowed => {
        if (allowed && !release) release = install()
        else if (!allowed && release) { const stop = release; release = undefined; stop() }
      }
      grants.set(action, toggle)
      return () => { toggle(false); grants.delete(action) }
    } },
    on(event, callback) { events.set(event, callback); return () => events.delete(event) },
  }
  const app = harness({ accountServices })
  app.context.URL = URL
  app.context.window.open = (...args) => opened.push(args)
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const section = () => {
    const page = entry.component({ controller })
    const advanced = page.children.find(child => child?.props?.className === 'dtd-advanced-features')
    const account = advanced.children.find(child => child?.type?.name === 'AccountSummarySection')
    return account.type(account.props)
  }
  const controls = () => section().children[2].children.filter(child => child?.type === 'button')
  assert.equal(section(), null)
  grants.get('account/watch')(true)
  grants.get('account/getBalance')(true)
  const old = controls()
  assert.equal(old.length, 2)
  old[1].props.onClick()
  assert.equal(opened.length, 1)
  old[0].props.onClick()
  assert.equal(calls.length, 1)
  // The native view changes before the event is delivered.
  nativeState = { view: { status: 'credential-stored', links: { usageUrl: 'https://platform.deepseek.com/usage' } } }
  calls[0].resolve({ ok: true, value: { status: 'ready', value: [{ currency: 'CNY', balance: '99' }], bonusWallets: [] } })
  for (let i = 0; i < 5; i++) await Promise.resolve()
  assert.doesNotMatch(JSON.stringify(section()), /CNY 99/)
  old[0].props.onClick()
  old[1].props.onClick()
  assert.equal(calls.length, 1)
  assert.equal(opened.length, 1)
  const next = controls()
  next[1].props.onClick()
  assert.equal(opened.length, 2)
  // Even a currently rendered control cannot act on an unannounced account change.
  nativeState = { view: { status: 'signed-out' } }
  next[1].props.onClick()
  next[0].props.onClick()
  assert.equal(opened.length, 2)
  assert.equal(calls.length, 1)
  grants.get('account/getBalance')(false)
  assert.equal(section(), null)
  app.cleanup()
  assert.equal(events.size, 0)
})

test('Host Locale snapshot updates Suite language and unsubscribes on unload', () => {
  let active = 'ja'
  let notify
  let disposed = 0
  const localeService = {
    getSnapshot() { return { active } },
    subscribe(fn) { notify = fn; return () => { disposed++; notify = undefined } },
  }
  const app = harness({ localeService })
  const controller = app.components.get('settings.section').spec.inject().controller
  assert.equal(controller.getSnapshot().language, 'en')
  active = 'zh-Hans'; notify()
  assert.equal(controller.getSnapshot().language, 'zh')
  active = 'fr'; notify()
  assert.equal(controller.getSnapshot().language, 'en')
  app.cleanup()
  assert.equal(disposed, 1)
  assert.equal(notify, undefined)
})


test('Locale service replacement revokes old subscription and skips unchanged normalized language', () => {
  const makeService = initial => {
    let active = initial
    let notify
    let releases = 0
    return {
      api: { getSnapshot() { return { active } },
        subscribe(fn) { notify = fn; return () => { releases++ } } },
      update(value) { active = value; notify() },
      get releases() { return releases },
    }
  }
  const old = makeService('zh-CN')
  const next = makeService('fr')
  const app = harness({ localeService: old.api })
  const controller = app.components.get('settings.section').spec.inject().controller
  let notifications = 0
  controller.subscribe(() => { notifications++ })
  const revision = controller.getSnapshot().revision
  old.update('zh-Hans')
  old.update(' zh-CN ')
  assert.equal(controller.getSnapshot().revision, revision)
  assert.equal(notifications, 0)
  app.replaceLocale(next.api)
  assert.equal(old.releases, 1)
  assert.equal(controller.getSnapshot().language, 'en')
  assert.equal(notifications, 1)
  old.update('zh-CN')
  assert.equal(controller.getSnapshot().language, 'en')
  assert.equal(notifications, 1)
  next.update('ja')
  assert.equal(notifications, 1)
  next.update('zh-TW')
  assert.equal(controller.getSnapshot().language, 'zh')
  assert.equal(notifications, 2)
  app.cleanup()
  assert.equal(old.releases, 1)
  assert.equal(next.releases, 1)
  next.update('en-US')
  assert.equal(controller.getSnapshot().language, 'zh')
  assert.equal(notifications, 2)
})

test('older Host language Patch observes only root lang and stops on disable', () => {
  const app = harness({ localeService: null })
  const controller = app.components.get('settings.section').spec.inject().controller
  assert.equal(controller.getSnapshot().language, 'zh')
  assert.equal(app.context.observers.length, 1)
  const [{ target, options }] = app.context.localeObserverOptions
  assert.equal(target, app.documentElement)
  assert.equal(options.attributes, true)
  assert.deepEqual(Array.from(options.attributeFilter), ['lang'])
  assert.equal(options.subtree, undefined)
  app.documentElement.lang = 'ja'
  app.context.observers[0]()
  assert.equal(controller.getSnapshot().language, 'en')
  app.cleanup()
  assert.equal(app.context.localeObserverDisconnects, 1)
  app.documentElement.lang = 'zh-CN'
  app.context.observers[0]()
  assert.equal(controller.getSnapshot().language, 'en')
})

test('public Locale takes priority; invalid snapshots use the Patch and recover', () => {
  let active = 'ja'
  let notify
  const app = harness({ localeService: {
    getSnapshot() { return { active } },
    subscribe(fn) { notify = fn; return () => {} },
  } })
  const controller = app.components.get('settings.section').spec.inject().controller
  assert.equal(app.context.observers.length, 0)
  assert.equal(controller.getSnapshot().language, 'en')
  active = undefined
  notify()
  assert.equal(app.context.observers.length, 1)
  assert.equal(controller.getSnapshot().language, 'zh')
  active = 'fr'
  notify()
  assert.equal(app.context.localeObserverDisconnects, 1)
  assert.equal(controller.getSnapshot().language, 'en')
  app.context.observers[0]()
  assert.equal(controller.getSnapshot().language, 'en')
  app.cleanup()
})

test('unsupported optional Host service does not prevent later independent registrations', () => {
  for (const unavailableService of ['workspaces', 'sessions,uiWorkspace', 'theme', 'layout']) {
    const app = harness({ unavailableService })
    const controller = app.components.get('settings.section').spec.inject().controller
    assert.ok(app.components.has('conversation.input.model.label'), unavailableService)
    assert.equal(controller.toggleSidebarSafe(), unavailableService !== 'layout', unavailableService)
    assert.equal(app.layers.size, unavailableService === 'theme' ? 0 : 1, unavailableService)
    app.cleanup()
    assert.equal(app.components.size, 0)
  }
})

test('missing optional Slot leaves other public entrypoints and services usable', () => {
  for (const unavailableSlot of ['settings.section.icon', 'settings.plugins.tab', 'plugins.bundle.config',
    'conversation.input.model.label', 'sidebar.brand.mark', 'sidebar.session.row.trailing']) {
    const app = harness({ unavailableSlot })
    const controller = app.components.get('settings.section').spec.inject().controller
    assert.equal(app.components.has(unavailableSlot), false, unavailableSlot)
    assert.ok(app.components.has('sidebar.session.row.hover'), unavailableSlot)
    assert.equal(app.layers.size, 1, unavailableSlot)
    assert.equal(controller.toggleSidebarSafe(), true, unavailableSlot)
    app.cleanup()
    assert.equal(app.components.size, 0)
  }
})

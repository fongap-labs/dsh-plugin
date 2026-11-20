import { test } from 'node:test'
import { buildDesktopClientFixture } from './helpers/build-suite-client.mjs'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Central CI invokes node --test directly, so build the actual client artifact here.
const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-suite/tsconfig.json')], { stdio: 'pipe' })
const source = buildDesktopClientFixture()
function harness({ stored = null, failTheme = false, failLayout = false, modelDirectories, fetchImpl } = {}) {
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
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    localStorage: { getItem() { return stored }, setItem(_key, value) { stored = value } },
    MutationObserver: class { constructor(callback) { context.observers.push(callback) } observe() {} disconnect() {} },
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
  const ctx = {
    inject(services, callback) {
      const names = Array.from(services)
      assert.ok(['slots', 'theme', 'layout', 'workspaces', 'sessions,uiWorkspace', 'remoteAccess',
        'sessions,resources,sidebarRightTabs,sidebarRight', 'configForms,remote',
        'modelDirectories'].includes(names.join(',')))
      // Optional model directories may be absent on older Hosts.
      if (names.join(',') === 'modelDirectories' && !modelDirectories) return
      // Cordis throws for undeclared services even when optional chaining is used.
      callback(new Proxy(ctx, { get(target, property) {
        if (property === 'locale') throw new Error('cannot get property "locale" without inject')
        return Reflect.get(target, property)
      } }))
    },
    effect(create) { effects.push(create()) },
    workspaces,
    modelDirectories,
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
    features: context.testDeltaFeatures,
    cleanup() { effects.forEach(fn => fn?.()) },
    get removed() { return removed },
    get stored() { return stored } }
}
test('lazy ModuleLoader registration and browser-safe artifact', () => {
  let loaded
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(x) { loaded = x } } } })
  assert.equal(loaded.id, '@fongap-labs/dsh-delta-suite')
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
  assert.deepEqual(app.slots, ['settings.section', 'settings.section.icon', 'settings.plugins.tab', 'plugins.bundle.config', 'settings.models.footer', 'conversation.input.model.label', 'plugins.add.actions', 'sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.session.row.trailing', 'sidebar.session.row.hover'])
  assert.equal(app.components.get('settings.models.footer').spec.id, 'delta.gateway.effort-sync',
    'Host Models footer owns the opt-in Gateway Effort UI without replacing native Settings')
  assert.equal(typeof app.components.get('settings.section.icon').component, 'function')
  assert.ok(JSON.stringify(app.components.get('sidebar.brand.name').component({})).includes('Delta 扩展套件'))
  assert.match(JSON.stringify(app.components.get('sidebar.brand.mark').component({})), /Δ/)
  const hover = app.components.get('sidebar.session.row.hover')
  assert.equal(hover.spec.id, 'delta.session.identity')
  assert.equal(hover.component({ sessionId: '0123456789abcdef' }), null, 'cold protection state never renders session identity')
  assert.equal(app.documentElement.getAttribute('data-delta-ui'), 'delta')
  assert.equal(app.components.has('shell.overlay'), false)
  assert.notEqual(app.workspaces.delete, app.originalDelete, 'ZIP adds a default-workspace deletion safeguard')
  const palette = app.layers.get(app.registration.id)
  assert.equal(palette['--dsw-alias-brand-primary'].light, '#286F78')
  assert.equal(palette['--dsw-alias-brand-primary'].dark, '#60B4BF')
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.id, 'delta.personalization')
  assert.equal(entry.spec.label(), 'Delta 扩展套件')
  const tab = app.components.get('settings.plugins.tab')
  assert.equal(tab.spec.id, 'delta.suite.configuration')
  assert.equal(tab.spec.label(), 'Delta 扩展套件')
  assert.equal(tab.component, entry.component, 'both Host entries use the same Settings page')
  const bundle = app.components.get('plugins.bundle.config')
  assert.equal(bundle.spec.name, 'plugins.bundle.config')
  assert.equal(bundle.spec.key, '@fongap-labs/dsh-delta-suite',
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
  app.context.observers.forEach(notify => notify())
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


test('Gateway Effort footer derives model and effort exclusively from the public active Session', () => {
  const directorySnapshot = {
    current: { provider: 'my-gateway', model: 'Max', reasoningEffort: 'medium' },
    status: 'ready', pending: null, routable: true,
  }
  const directory = {
    store: { getSnapshot: () => directorySnapshot, subscribe: () => () => {} },
    load: async () => directorySnapshot,
  }
  const app = harness({
    modelDirectories: { directoryFor(id) {
      assert.equal(id, 'session-one')
      return directory
    } },
  })
  app.features.setActiveSessionId('session-one')
  const footer = app.components.get('settings.models.footer')
  assert.equal(footer.spec.id, 'delta.gateway.effort-sync')
  const render = () => footer.component({})
  const rendered = render()
  const text = JSON.stringify(rendered)
  assert.match(text, /my-gateway \/ Max \/ medium/)
  assert.doesNotMatch(text, /Gateway 路由 ID|Model ID|Current selected effort/,
    'users cannot forge provider, model or Effort through manual inputs')
  const findNodes = (node, filter) => {
    if (!node || typeof node !== 'object') return []
    return [ ...(filter(node) ? [node] : []),
      ...(Array.isArray(node.children)
        ? node.children.flatMap(child => findNodes(child, filter)) : []) ]
  }
  const preview = findNodes(rendered, node => node.type === 'button' &&
    String(node.children?.[0]).includes('预览'))
  assert.equal(preview.length, 1)
  assert.equal(preview[0].props.disabled, false,
    'active session and official directory authorize user-initiated discovery')
  directorySnapshot.current = { provider: 'my-gateway', model: 'Max', reasoningEffort: 'off' }
  const unsupported = render()
  assert.doesNotMatch(JSON.stringify(unsupported), /my-gateway \/ Max \/ off/,
    'native Off cannot masquerade as supported Gateway Off')
  app.cleanup()
})

test('Gateway preview reads Host Session selection on click, never user-entered model/Effort', async () => {
  const requests = []
  let state = {
    current: { provider: 'native-route', model: 'model-v1', reasoningEffort: 'high' },
    status: 'ready', pending: null, routable: true,
  }
  const app = harness({
    modelDirectories: { directoryFor() {
      return {
        store: { getSnapshot: () => state, subscribe: () => () => {} },
        load: async () => state,
      }
    } },
    fetchImpl: async (path, init) => {
      requests.push({ path, payload: JSON.parse(init.body) })
      return { ok: true, json: async () => ({ ok: true, status: 'unchanged' }) }
    },
  })
  app.features.setActiveSessionId('session-one')
  const footer = app.components.get('settings.models.footer')
  const findPreview = () => {
    const elements = []
    const walk = node => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'button' && String(node.children?.[0]).includes('预览')) elements.push(node)
      for (const child of node.children ?? []) walk(child)
    }
    walk(footer.component({}))
    assert.equal(elements.length, 1)
    return elements[0]
  }
  assert.equal(requests.length, 0, 'a mounted Models panel must not probe Gateway')
  findPreview().props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].path, '/api/delta-suite/gateway-effort/preview')
  assert.deepEqual(requests[0].payload, {
    namespace: 'llm-pi-ai', providerId: 'native-route', modelId: 'model-v1',
    selectedEffort: 'high',
  }, 'preview uses the durable native Session selection, not typed model IDs')

  state = { ...state, current: { ...state.current, reasoningEffort: 'off' } }
  findPreview().props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(requests.length, 1, 'unsupported native Off must not trigger discovery')
  state = { ...state, current: { ...state.current, reasoningEffort: 'low' },
    status: 'selecting', pending: { ...state.current } }
  findPreview().props.onClick()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(requests.length, 1, 'in-flight Host model switching cannot be synced')
  app.cleanup()
})

test('native Settings shows localized Host-unavailable errors without committing fake settings', async () => {
  const app = harness()
  const section = app.components.get('settings.section')
  const controller = section.spec.inject().controller
  const beforeProxy = app.features.getSnapshot().proxy
  const beforeVision = app.features.getSnapshot().vision
  const proxyInput = { mode: 'manual', httpProxy: 'http://127.0.0.1:7890',
    httpsProxy: '', noProxy: 'localhost' }
  const zh = JSON.parse(readFileSync(fixture('packages/dsh-delta-suite/locale/zh.json'), 'utf8'))
  const en = JSON.parse(readFileSync(fixture('packages/dsh-delta-suite/locale/en.json'), 'utf8'))
  try {
    assert.equal(await app.features.saveProxy(proxyInput), false)
    assert.equal(await app.features.saveVision({ enabled: false }), false)
    assert.equal(app.features.getSnapshot().proxy, beforeProxy)
    assert.equal(app.features.getSnapshot().vision, beforeVision)
    const tested = await app.features.testVisionEngine()
    assert.equal(tested.ok, false)
    assert.doesNotMatch(tested.message, /Mock.Local|succeeded/)
    let markup = JSON.stringify(section.component({ controller }))
    assert.ok(markup.includes(zh.networkProxy.hostUnavailable),
      'configuration surface must show that Host proxy writes were not persisted')
    assert.ok(markup.includes(zh.visionBridge.hostUnavailable),
      'vision controls must show that the Host rejected saving')
    assert.ok(markup.includes('alert'), 'failures use accessible role alerts')

    app.documentElement.lang = 'en'
    app.context.observers.forEach(notify => notify())
    await app.features.saveProxy(proxyInput)
    await app.features.saveVision({ enabled: false })
    markup = JSON.stringify(section.component({ controller }))
    assert.ok(markup.includes(en.networkProxy.hostUnavailable))
    assert.ok(markup.includes(en.visionBridge.hostUnavailable))
    assert.equal(app.features.getSnapshot().visionEngineReady, false)
  } finally { app.cleanup() }
})

test('Settings identifies unsupported Host contracts without claiming native takeover', () => {
  const app = harness()
  const entry = app.components.get('settings.section')
  const controller = entry.spec.inject().controller
  const required = JSON.parse(readFileSync(fixture('projects/dsh-delta-suite/feature-readiness.json'), 'utf8')).required
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
  const zh = JSON.parse(readFileSync(fixture('packages/dsh-delta-suite/locale/zh.json'), 'utf8')).ui
  const en = JSON.parse(readFileSync(fixture('packages/dsh-delta-suite/locale/en.json'), 'utf8')).ui
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
  app.context.observers.forEach(notify => notify())
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
    app.context.observers.forEach(notify => notify())
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
  assert.match(advertised.props.title, /\u6a21\u578b\u601d\u8003\u7b49\u7ea7/)
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

test('missing theme keeps the independent Settings entry usable', () => {
  const app = harness({ failTheme: true })
  const entry = app.components.get('settings.section')
  assert.equal(entry.spec.label(), 'Delta 扩展套件')
  assert.equal(app.components.get('settings.plugins.tab').spec.label(), 'Delta 扩展套件')
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
  const base = '../packages/dsh-delta-suite/'
  const json = path => JSON.parse(readFileSync(new URL(base + path, import.meta.url), 'utf8'))
  const pkg = json('package.json')
  assert.equal(pkg.name, '@fongap-labs/dsh-delta-suite')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, [], 'optional UI dependencies must never block web boot')
  assert.equal(pkg.description, json('locale/en.json').meta.description)
  assert.equal(json('locale/zh.json').meta.title, 'Delta 扩展套件')
  assert.equal(pkg.dependencies?.['@deepseek-ai/cordis'], undefined)
  const rel = json('../../projects/dsh-delta-suite/release.manifest.json')
  assert.equal(rel.release_key, 'dsh-delta-suite')
})

test('obsolete standalone routes and UI packages are excluded from Desktop', () => {
  assert.equal(existsSync(fixture('packages/dsh-ui-delta')), false)
  assert.equal(existsSync(fixture('packages/dsh-theme-delta')), false)
  assert.equal(existsSync(fixture('packages/dsh-delta-suite/src/host/routes.ts')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-poc-host.mjs')), false)
  assert.equal(existsSync(fixture('scripts/verify-delta-suite-ui.mjs')), false)
  assert.match(source, /const settingsModules/)
  assert.match(source, /scope\.slots\.inject\('settings\.plugins\.tab'/)
})

test('workspace deletion remains Host owned regardless of appearance mode', async () => {
  const app = harness()
  assert.notEqual(app.workspaces.delete, app.originalDelete,
    'ZIP protects the default workspace through a guarded Host call')
  await assert.rejects(() => app.workspaces.delete('default'), /delta\/workspace-state-unavailable/)
  await assert.rejects(() => app.workspaces.delete('other'), /delta\/workspace-state-unavailable/)
  assert.deepEqual(app.deletedWorkspaces, [], 'no native mutations before Host confirmation')
  app.context.window.location = { href: 'https://harness.test/' }
  app.context.fetch = async path => ({
    ok: true, status: 200,
    json: async () => path === '/api/delta-suite/state'
      ? { state: {
        hasPin: false, lockMode: 'none',
        lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {},
      } } : {},
  })
  await app.features.refreshState()
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
  const css = readFileSync(fixture('packages/dsh-delta-suite/src/theme.css'), 'utf8')
  assert.ok(css.includes('dtd-'), 'ZIP design system is preserved')
  controller.setMode('official')
  assert.equal(app.layers.size, 0)
  app.cleanup()
})

import { test } from 'node:test'
import { buildDesktopClientFixture } from './helpers/build-suite-client.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
const uiEn = JSON.parse(readFileSync(fixture('packages/delta-suite/locale/en.json'), 'utf8')).ui
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/delta-suite/tsconfig.json')], { stdio: 'pipe' })
const clientSource = buildDesktopClientFixture()
const readiness = JSON.parse(readFileSync(fixture('projects/delta-suite/feature-readiness.json'), 'utf8'))
const { EMPTY_COMPACTION_STATUS, foldCompactionStatus, registerCompactionStatusProjection } = await import(pathToFileURL(
  fixture('packages/delta-suite/lib/context-projection.js')).href)

function makeHarness({ draft = 'Please explain the request clearly.', pressure, mainRunning = true,
  compactionStatus, command = async () => ({ matched: true }), persistedStorage = new Map(),
  mcpSnapshot, mcpNamespace = 'mcp-manager', mcpManager, mcpMutate = async () => true, deltaSettingsSnapshot,
  deltaSettingsMutate = async () => true, credentialsRemote, missingAssistantMethod } = {}) {
  let registration
  let nextSessionId = 0
  const components = new Map()
  const effects = []
  const prompts = []
  const commands = []
  const created = []
  const opened = []
  const refCounts = new Map()
  const storage = persistedStorage
  const resources = []
  const tabs = []
  const dialogRoots = []
  const diagnosticMessages = []
  const mcpMutations = []
  const mcpFormQueries = []
  const deltaSettingsMutations = []
  const hookStates = new Map()
  let hookKey = 'default'
  let hookIndex = 0
  let draftValue = draft
  let protectionState = { hasPin: false, lockMode: 'none', lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {} }
  let nextReady
  const hookEffects = new Map()
  const root = { lang: 'en', setAttribute() {}, removeAttribute() {}, getAttribute() { return undefined } }
  const body = { appendChild(node) { node.parentNode = body }, removeChild(node) { node.parentNode = null } }
  const document = {
    documentElement: root,
    body,
    head: { appendChild(tag) { tag.parentNode = { removeChild() {} } } },
    createElement(name) { return { name, dataset: {}, parentNode: null, textContent: '', remove() { this.parentNode = null } } },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null },
  }
  const context = {
    window: { __ModuleLoader__: { load(entry) { registration = entry } }, location: { href: 'https://harness.test/' } },
    fetch: async path => ({ ok: true, json: async () => path === '/api/delta-suite/state' ? { state: protectionState } : {} }),
    document, navigator: { language: 'en-US' }, URL, URLSearchParams, AbortController,
    localStorage: { getItem(key) { return storage.get(key) ?? null }, setItem(key, value) { storage.set(key, value) } },
    MutationObserver: class { observe() {} disconnect() {} },
    console: { error(...values) { diagnosticMessages.push(values.map(String).join(' ')) }, warn(...values) { diagnosticMessages.push(values.map(String).join(' ')) } },
  }
  // The production fixture is wrapped in an IIFE; expose the test hook inside it.
  const testClientSource = clientSource.replace(/\n\}\)\(\);\n$/, '\n;globalThis.testFeatures = deltaFeatures\n})();\n')
  assert.notEqual(testClientSource, clientSource, 'desktop fixture wrapper must be present')
  vm.runInNewContext(testClientSource, context)
  const react = {
    createElement(type, props, ...children) { return { type, props: props || {}, children } },
    useState(initial) {
      const values = hookStates.get(hookKey) || []
      hookStates.set(hookKey, values)
      const index = hookIndex++
      if (!(index in values)) values[index] = initial
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
    },
    useRef(initial) {
      const values = hookStates.get(hookKey) || []
      hookStates.set(hookKey, values)
      const index = hookIndex++
      if (!(index in values)) values[index] = { current: initial }
      return values[index]
    },
    useEffect(effect, deps) {
      const key = hookKey + ':' + hookIndex++
      const prev = hookEffects.get(key)
      if (deps && prev && deps.length === prev.deps?.length && deps.every((value, i) => Object.is(value, prev.deps[i]))) return
      prev?.cleanup?.()
      hookEffects.set(key, { deps, cleanup: effect() })
    },
    useSyncExternalStore(_subscribe, get) { return get() },
  }
  const primitives = { MenuItemButton() {} }
  const reactDom = { createRoot(container) {
    const entry = { container, rendered: undefined, unmounted: false,
      render(value) { this.rendered = value }, unmount() { this.unmounted = true } }
    dialogRoots.push(entry)
    return entry
  } }
  const sessions = {
    list: { getSnapshot() { return { byId: { 'main-1': { workspaceId: 'workspace-1' }, ...Object.fromEntries(created.map(id => [id, {}])) } } } },
    async create(options) { const id = `assistant-${++nextSessionId}`; created.push(id); created.options = options; return id },
    retain(sessionId) {
      refCounts.set(sessionId, (refCounts.get(sessionId) || 0) + 1)
      const session = {
        sessionId,
        async prompt(content, mode) { prompts.push({ sessionId, content, mode }); return { ok: true } },
        async command(line) { commands.push({ sessionId, line }); return command(line) },
        getSnapshot() { return { running: mainRunning && sessionId === 'main-1' } },
      }
      return {
        sessionId, binding: { session }, ready: (() => { const ready = nextReady; nextReady = undefined; return ready ?? Promise.resolve() })(),
        release() { refCounts.set(sessionId, refCounts.get(sessionId) - 1) },
      }
    },
  }
  const slotService = {
    inject(name, register) { const dispose = register(); if (typeof dispose === 'function') effects.push(dispose) },
    register(spec, component) { components.set(spec.name + ':' + (spec.id || spec.key || ''), { spec, component }); return () => components.delete(spec.name + ':' + (spec.id || spec.key || '')) },
  }
  const services = {
    sessions,
    resources: { register(provider) { resources.push(provider); return () => {} } },
    sidebarRightTabs: { register(definition) { tabs.push(definition); return () => {} } },
    sidebarRight: { openResource(address) { opened.push(address) }, closeRightbar() {} },
    slots: slotService,
  }
  if (missingAssistantMethod) {
    const [service, method] = missingAssistantMethod.split('.')
    delete services[service][method]
  }
  const mcpForm = mcpSnapshot ? {
    getSnapshot() { return mcpSnapshot },
    subscribe() { return () => {} },
    async mutate(ops, revision) { mcpMutations.push({ ops, revision }); return mcpMutate(ops, revision) },
  } : undefined
  const deltaForm = deltaSettingsSnapshot ? {
    getSnapshot() { return deltaSettingsSnapshot },
    subscribe() { return () => {} },
    async mutate(ops, revision) {
      deltaSettingsMutations.push({ ops, revision })
      const result = await deltaSettingsMutate(ops, revision)
      if (result !== false && !(result && typeof result === 'object' && result.ok === false)) {
        deltaSettingsSnapshot.value ||= {}
        for (const operation of ops) {
          if (operation.op === 'set') deltaSettingsSnapshot.value[operation.path[0]] = operation.value
          else delete deltaSettingsSnapshot.value[operation.path[0]]
        }
        deltaSettingsSnapshot.revision++
      }
      return result
    },
  } : undefined
  const configForms = mcpForm || deltaForm ? { get(namespace) {
    if (namespace === 'mcp-manager' || namespace === 'mcp') {
      mcpFormQueries.push(namespace)
      return namespace === mcpNamespace ? mcpForm : undefined
    }
    if (namespace === 'delta-suite') return deltaForm
    throw new Error(`Unexpected config namespace ${namespace}`)
  } } : undefined
  const ctx = {
    inject(_names, callback) { callback(ctx) },
    effect(effect) { const cleanup = effect(); if (typeof cleanup === 'function') effects.push(cleanup) },
    slots: slotService,
    sessions,
    resources: services.resources,
    sidebarRightTabs: services.sidebarRightTabs,
    sidebarRight: services.sidebarRight,
    configForms,
    remote: mcpManager || credentialsRemote ? { mcpManager, credentials: credentialsRemote } : undefined,
    workspaces: { list: { getSnapshot() { return { items: [] } } } },
    theme: { overrideTokens() { return () => {} } },
    layout: { toggleSidebar() {}, selectPanel() {} },
  }
  registration.factory(id => {
    if (id === 'react') return react
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    if (id === 'react-dom/client') return reactDom
    throw new Error(`Unexpected module ${id}`)
  }).apply(ctx)
  function render(key, component, props) { hookKey = key; hookIndex = 0; return component(props) }
  const mainChat = {
    legacy: { nodes: [
      { kind: 'user', content: [{ type: 'text', text: "Implement the user's current task." }] },
      { kind: 'assistant', blocks: [{ kind: 'text', text: 'I am working on the requested feature.' }] },
      { kind: 'compaction', summary: '## Primary Request and Intent\n- Preserve the task goal.\n\n## Critical Context\n- Keep user constraints.' },
      { kind: 'user', source: { kind: 'compact-checkpoint', compactionId: 'compact-1' },
        content: [{ type: 'text', text: '## Primary Request and Intent\n- Preserve the task goal.\n\n## Critical Context\n- Keep user constraints.' }] },
    ] },
    timeline: { turnOrder: [1] }, nodes: { values() { return [{ kind: 'assistant-step', data: {
      finalNode: { messageId: 'main-assistant-1' },
    } }] } },
  }
  const mainProps = {
    sessionId: 'main-1',
    messageId: 'main-assistant-1',
    useInput: selector => selector({ draft: draftValue }),
    useSession: selector => selector({ sessionId: 'main-1', running: mainRunning, awaitingFirstTurn: false,
      lastAgentError: null, blank: false, promptAttempted: true }),
    useChat: selector => selector(mainChat),
    useConversation: selector => selector({ activeTargets: new Set(['chat']) }),
    useProjection: key => key === 'contextPressure' ? pressure
      : key === 'deltaContextCompactionStatus' ? compactionStatus : undefined,
    inputActions: { setDraft(value) { draftValue = value }, persistDraft() { prompts.push({ persistedDraft: draftValue }) } },
  }
  return { components, effects, prompts, commands, created, opened, refCounts, storage, resources, tabs,
    dialogRoots, diagnosticMessages, mcpMutations, mcpFormQueries, deltaSettingsMutations, render, mainProps, setDraft(value) { draftValue = value },
    get draft() { return draftValue }, sessions,
    ready: context.testFeatures.refreshState(),
    revision: () => context.testFeatures.getContentProtectionRevision(),
    setProtection: async patch => { protectionState = { ...protectionState, ...patch }; await context.testFeatures.refreshState() },
    deferRetain: () => { let resolve; nextReady = new Promise(done => { resolve = done }); return resolve },
  }
}
function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (!node || typeof node !== 'object') return ''
  return [node.props?.children, ...(node.children || [])].map(textOf).join('')
}
function findButton(tree, label) {
  if (Array.isArray(tree)) return tree.map(child => findButton(child, label)).find(Boolean)
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.type === 'button' && textOf(tree) === label) return tree
  for (const child of tree.children || []) { const found = findButton(child, label); if (found) return found }
  return undefined
}
function findElement(tree, type) {
  if (Array.isArray(tree)) return tree.map(child => findElement(child, type)).find(Boolean)
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.type === type) return tree
  for (const child of tree.children || []) { const found = findElement(child, type); if (found) return found }
  return undefined
}
function findClass(tree, className) {
  if (Array.isArray(tree)) return tree.map(child => findClass(child, className)).find(Boolean)
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.props?.className === className) return tree
  for (const child of tree.children || []) { const found = findClass(child, className); if (found) return found }
  return undefined
}
function findField(tree, labelText) {
  if (Array.isArray(tree)) return tree.map(child => findField(child, labelText)).find(Boolean)
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.type === 'label' && textOf(tree).startsWith(labelText)) {
    return (tree.children || []).find(child => ['input', 'textarea', 'select'].includes(child?.type))
  }
  for (const child of tree.children || []) { const found = findField(child, labelText); if (found) return found }
  return undefined
}
function findSwitch(tree, label) {
  if (!tree || typeof tree !== 'object') return undefined
  if (tree.props?.role === 'switch' && tree.props['aria-label'] === label) return tree
  for (const child of tree.children || []) { const found = findSwitch(child, label); if (found) return found }
  return undefined
}
const turn = () => new Promise(resolve => setTimeout(resolve, 0))

test('Harness keeps native MCP actions and secrets when Suite mounts', () => {
  const app = makeHarness({
    mcpSnapshot: { status: 'ready', value: { servers: { privateServer: {
      env: { API_KEY: 'host-only' }, headers: { Authorization: 'host-only' },
    } } } },
  })
  assert.equal([...app.components.keys()].some(key => key.startsWith('plugins.add.actions:')), false)
  assert.deepEqual(app.mcpFormQueries, [])
  assert.deepEqual(app.mcpMutations, [])
  assert.equal(app.dialogRoots.length, 0)
})

test('the package enables the official automatic compaction backend at Profile level', () => {
  const patch = readFileSync(fixture('packages/delta-suite/cordis.patch.yml'), 'utf8')
  assert.match(patch, /- id: delta-global-compaction\s+name: '@deepseek-ai\/dsh-compaction-basic'\s+config:\s+auto: true/)
  const preset = patch.slice(patch.indexOf('id: delta-context-preset'))
  assert.match(preset, /id: delta-context/)
  assert.doesNotMatch(preset, /@deepseek-ai\/dsh-tool-/)
  assert.doesNotMatch(clientSource, /autoCompaction: boolean|prefs\.autoCompaction/,
    'automatic compaction is a Profile-level backend, not a per-session user toggle')
  assert.match(clientSource, /\], 'queue'\)/)
  assert.doesNotMatch(clientSource, /binding\.session\.cancel\(/)
})

test('the compaction status projection tracks automatic lifecycle and recoverable failures', () => {
  const unchanged = foldCompactionStatus(EMPTY_COMPACTION_STATUS, { type: 'user/message', seq: 0 })
  assert.equal(unchanged, EMPTY_COMPACTION_STATUS)
  const started = foldCompactionStatus(unchanged, { type: 'compaction/start', seq: 3 })
  assert.deepEqual(started, { seq: 3, phase: 'running', failed: false })
  const summarized = foldCompactionStatus(started, { type: 'compaction/summary', seq: 4,
    data: { shadowedTokenCount: 2400 } })
  assert.deepEqual(summarized, { seq: 4, phase: 'running', failed: false, shadowedTokenCount: 2400 })
  const failed = foldCompactionStatus(summarized, { type: 'compaction/end', seq: 5,
    data: { error: 'summary model unavailable' } })
  assert.deepEqual({ seq: failed.seq, phase: failed.phase, failed: failed.failed },
    { seq: 5, phase: 'failed', failed: true })
  const recovered = foldCompactionStatus(failed, { type: 'compaction/start', seq: 8 })
  const completed = foldCompactionStatus(recovered, { type: 'compaction/end', seq: 9, data: {} })
  assert.deepEqual({ seq: completed.seq, phase: completed.phase, failed: completed.failed },
    { seq: 9, phase: 'completed', failed: false })
  const interrupted = foldCompactionStatus(recovered, { type: 'session/end-seed', seq: 10 })
  assert.deepEqual({ seq: interrupted.seq, phase: interrupted.phase, failed: interrupted.failed },
    { seq: 10, phase: 'failed', failed: true })
})

test('the optional session projection registers a client-readable result and disposes with the plugin', async () => {
  let definition
  let disposed = false
  const cleanup = registerCompactionStatusProjection({
    inject(names, callback) {
      assert.deepEqual(names, ['sessionProjections'])
      callback({ sessionProjections: { register(value) {
        definition = value
        return Promise.resolve({ async dispose() { disposed = true } })
      } } })
    },
  })
  await turn()
  assert.equal(definition.key, 'deltaContextCompactionStatus')
  assert.deepEqual(definition.wire.viewSchema.parse({ seq: 4, phase: 'failed', failed: true }),
    { seq: 4, phase: 'failed', failed: true })
  cleanup()
  await turn()
  assert.equal(disposed, true)
})

test('Installed plugins bundle detail mounts the Suite configuration using the same controller', () => {
  const app = makeHarness()
  const section = app.components.get('settings.section:delta.personalization')
  const bundle = app.components.get('plugins.bundle.config:@fongap-labs/delta-suite')
  assert.ok(section, 'Settings still keeps its original Suite page')
  assert.ok(bundle, 'Installed plugins must expose Suite configuration')
  assert.equal(bundle.spec.name, 'plugins.bundle.config')
  assert.equal(bundle.spec.key, '@fongap-labs/delta-suite')
  assert.equal(bundle.component({ view: 'summary' }), null)
  const mounted = app.render('bundle-slot', bundle.component, { view: 'page' })
  assert.equal(mounted.type.name, 'PersonalizationSection')
  const controller = section.spec.inject().controller
  assert.equal(mounted.props.controller, controller,
    'plugin detail and Settings must share state and save behavior')
  const rendered = app.render('bundle-personalization', mounted.type, mounted.props)
  assert.equal(rendered.props['data-delta-personalization'], '')
  assert.match(JSON.stringify(rendered), /dtd-preference-row/)
  assert.ok(rendered.props['aria-label'], 'installed bundle config has an accessible page label')
  controller.setMode('official')
  const official = app.render('bundle-official', mounted.type, mounted.props)
  assert.match(JSON.stringify(official), /data-delta-personalization/,
    'configuration must remain visible in native appearance mode')
})

test('DeepSeek Account and model display preferences persist independently', () => {
  const app = makeHarness()
  const setting = app.components.get('settings.section:delta.personalization')
  assert.ok(setting)
  const controller = setting.spec.inject().controller
  const page = app.render('settings', setting.component, { controller })
  const preferenceSection = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(page)
  })()
  let preferences = app.render('preference-settings', preferenceSection.type, preferenceSection.props)
  assert.equal(findSwitch(preferences, 'Show DeepSeek Account route').props['aria-checked'], true)
  assert.equal(findSwitch(preferences, 'Show model names').props['aria-checked'], true)
  findSwitch(preferences, 'Show DeepSeek Account route').props.onClick()
  preferences = app.render('preference-settings', preferenceSection.type, preferenceSection.props)
  assert.equal(findSwitch(preferences, 'Show DeepSeek Account route').props['aria-checked'], false)
  assert.equal(findSwitch(preferences, 'Show model names').props['aria-checked'], true)
  findSwitch(preferences, 'Show model names').props.onClick()
  preferences = app.render('preference-settings', preferenceSection.type, preferenceSection.props)
  assert.equal(findSwitch(preferences, 'Show model names').props['aria-checked'], false)
  const rebooted = makeHarness({ persistedStorage: app.storage })
  const reloadedSetting = rebooted.components.get('settings.section:delta.personalization')
  const reloadedController = reloadedSetting.spec.inject().controller
  const reloadedPage = rebooted.render('settings', reloadedSetting.component, { controller: reloadedController })
  const reloadedSection = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(reloadedPage)
  })()
  const restored = rebooted.render('preferences', reloadedSection.type, reloadedSection.props)
  assert.equal(findSwitch(restored, 'Show DeepSeek Account route').props['aria-checked'], false)
  assert.equal(findSwitch(restored, 'Show model names').props['aria-checked'], false)
})

test('model label shows only the DeepSeek Account route name under its separate preference', () => {
  assert.equal(readiness.required.generic_model_label_preference, true)
  const app = makeHarness()
  const label = app.components.get('conversation.input.model.label:delta.model.route-label').component
  const renderLabel = props => app.render('model-label', label, props)
  const account = renderLabel({ provider: { id: 'deepseek-account', name: 'DeepSeek Account' },
    model: { name: 'DeepSeek Flash' }, placement: 'trigger' })
  assert.equal(textOf(account), 'DeepSeek AccountDeepSeek Flash')
  const otherRoute = renderLabel({ provider: { id: 'custom-gateway', name: 'Private Gateway' },
    model: { name: 'Vision Model' }, placement: 'trigger' })
  assert.equal(textOf(otherRoute), 'Vision Model', 'third-party provider labels are not surfaced')
  const setting = app.components.get('settings.section:delta.personalization')
  const controller = setting.spec.inject().controller
  const page = app.render('settings', setting.component, { controller })
  const section = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(page)
  })()
  const preferences = app.render('preference-settings', section.type, section.props)
  findSwitch(preferences, 'Show DeepSeek Account route').props.onClick()
  assert.equal(textOf(renderLabel({ provider: { id: 'deepseek-account', name: 'DeepSeek Account' },
    model: { name: 'DeepSeek Flash' }, placement: 'trigger' })), 'DeepSeek Flash')
})

test('retired display preference fields are removed while supported preferences are preserved', () => {
  const storage = new Map([['fongap.delta-suite.features.v1', JSON.stringify({
    showDeepSeekAccountInfo: false, showModelInfo: false, inputOptimization: true, retiredPreference: false,
  })]])
  makeHarness({ persistedStorage: storage })
  assert.deepEqual(JSON.parse(storage.get('fongap.delta-suite.features.v1')),
    { showDeepSeekAccountInfo: false, showModelInfo: false, inputOptimization: true })
})

test('independent discussion and input optimization use a separate tool-free session', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  assert.ok(input)
  let tree = app.render('input', input.component, app.mainProps)
  await findButton(tree, 'Discuss independently').props.onClick()
  await turn()
  assert.equal(app.created.options.agentPreset, 'delta-context')
  assert.equal(app.created.options.workspaceId, 'workspace-1')
  assert.equal(app.prompts[0].mode, 'queue')
  assert.match(app.prompts[0].content[0].text, /Implement the user's current task/)
  assert.match(app.opened[0], /purpose=discussion/)
  assert.equal(app.commands.length, 0, 'opening a discussion never sends a command to the main session')

  tree = app.render('input', input.component, app.mainProps)
  await findButton(tree, 'Optimize input').props.onClick()
  await turn()
  assert.equal(app.created.at(-1), 'assistant-2')
  assert.match(app.prompts[1].content[0].text, /<original-user-input>/)
  assert.match(app.prompts[1].content[0].text, /Please explain the request clearly/)
  const action = app.components.get('conversation.chat.assistant-actions:delta.context.optimizer-apply')
  const outputChat = { nodes: { values: () => [{ kind: 'assistant-step', data: {
    finalNode: { messageId: 'message-2' }, blocks: [{ kind: 'text', text: 'Explain the request clearly.' }],
  } }] } }
  const actionProps = { ...app.mainProps, sessionId: 'assistant-2', messageId: 'message-2', useChat: selector => selector(outputChat) }
  tree = app.render('optimizer', action.component, actionProps)
  await findButton(tree, 'Optimization preview').props.onClick()
  tree = app.render('optimizer', action.component, actionProps)
  assert.equal(findElement(tree, 'textarea').props.value, 'Explain the request clearly.')
  await findButton(tree, 'Use this version').props.onClick()
  assert.equal(app.draft, 'Explain the request clearly.')
  assert.ok(app.prompts.some(value => value.persistedDraft === app.draft))
})

test('main-task corrections require a review step and are queued without steering', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  findButton(app.render('input', input.component, app.mainProps), 'Discuss independently').props.onClick()
  await turn()
  const address = app.opened[0]
  const tab = [...app.components.values()].find(value => value.spec.name === 'sidebar.right.pane.tab' && value.spec.key === '@fongap-labs/delta-suite')
  assert.ok(tab)
  const props = {
    ...app.mainProps,
    useTabInfo: () => ({ tab: { contentId: address } }),
    useResource: () => ({ value: { parentSessionId: 'main-1', assistantSessionId: 'assistant-1', purpose: 'discussion', reference: {}, protectionRevision: app.revision() } }),
    SessionProvider: () => null,
    renderSlot: () => null,
  }
  let tree = app.render('sidebar', tab.component, props)
  assert.ok(findElement(tree, 'details'), 'main task status stays available in a collapsed summary')
  assert.ok(findClass(tree, 'dtd-assistant-conversation'), 'the main area remains the independent conversation')
  assert.equal(findClass(tree, 'dtd-correction-box'), undefined, 'correction entry is opened only on request')
  assert.equal(findElement(tree, 'textarea'), undefined, 'correction editor stays out of the conversation until requested')
  await findButton(tree, uiEn.queueCorrection).props.onClick()
  tree = app.render('sidebar', tab.component, props)
  const textarea = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : node.type === 'textarea' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(tree)
  })()
  textarea.props.onChange({ currentTarget: { value: 'Change the task direction and prioritize security.' } })
  tree = app.render('sidebar', tab.component, props)
  await findButton(tree, uiEn.reviewCorrection).props.onClick()
  tree = app.render('sidebar', tab.component, props)
  await findButton(tree, uiEn.confirmQueue).props.onClick()
  await turn()
  const mainPrompt = app.prompts.find(value => value.sessionId === 'main-1')
  assert.equal(mainPrompt.mode, 'queue')
  assert.match(mainPrompt.content[0].text, /prioritize security/)
  assert.equal(app.commands.length, 0)
})

test('automatic compaction activity appears in the chat and not in the composer', async () => {
  const app = makeHarness({ pressure: { projectedTokens: 8_600, contextWindow: 10_000 },
    compactionStatus: { seq: 4, phase: 'running', failed: false } })
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  const tree = app.render('input', input.component, app.mainProps)
  assert.doesNotMatch(textOf(tree), /86%|Compact now|Latest structured summary|Condensing earlier conversation/)
  assert.equal(app.commands.length, 0)
  assert.equal(app.draft, 'Please explain the request clearly.')
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  const notice = app.render('compaction', activity.component, app.mainProps)
  assert.match(textOf(notice), /Condensing earlier conversation/)
  assert.equal(findClass(notice, 'dtd-compaction-event is-running')?.props.role, 'status')
})

test('a completed compaction shows its structured checkpoint in the chat activity row', async () => {
  const app = makeHarness({ compactionStatus: { seq: 12, phase: 'completed', failed: false } })
  await app.ready
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  const tree = app.render('compaction', activity.component, app.mainProps)
  assert.ok(textOf(tree).includes(uiEn.compactionCompleted))
  assert.match(textOf(tree), /View summary/)
  assert.match(textOf(tree), /Primary Request and Intent/)
  assert.match(textOf(tree), /Keep user constraints/)
})

test('a failed automatic compaction reports in the chat and preserves the draft', async () => {
  const app = makeHarness({ pressure: { projectedTokens: 9_100, contextWindow: 10_000 },
    compactionStatus: { seq: 12, phase: 'failed', failed: true } })
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  const composer = app.render('input', input.component, app.mainProps)
  assert.ok(!textOf(composer).includes(uiEn.automaticCompactionFailed))
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  const notice = app.render('compaction', activity.component, app.mainProps)
  assert.ok(textOf(notice).includes(uiEn.automaticCompactionFailed))
  assert.equal(findClass(notice, 'dtd-compaction-event is-failed')?.props.role, 'alert')
  assert.equal(app.draft, 'Please explain the request clearly.')
  assert.equal(app.commands.length, 0)
})

test('input optimization refuses to replace a draft edited while the result was being prepared', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  await findButton(app.render('input', input.component, app.mainProps), 'Optimize input').props.onClick()
  await turn()
  app.setDraft('A newer instruction typed after optimization started.')
  app.render('input', input.component, app.mainProps)
  const action = app.components.get('conversation.chat.assistant-actions:delta.context.optimizer-apply')
  const outputChat = { nodes: { values: () => [{ kind: 'assistant-step', data: {
    finalNode: { messageId: 'message-1' }, blocks: [{ kind: 'text', text: 'Rewritten text.' }],
  } }] } }
  const props = { ...app.mainProps, sessionId: 'assistant-1', messageId: 'message-1', useChat: selector => selector(outputChat) }
  await findButton(app.render('result', action.component, props), 'Optimization preview').props.onClick()
  const preview = app.render('result', action.component, props)
  await findButton(preview, 'Use this version').props.onClick()
  const after = app.render('result', action.component, props)
  assert.ok(textOf(after).includes(uiEn.draftChanged))
  assert.equal(app.draft, 'A newer instruction typed after optimization started.')
})

test('restoring optimized text does not overwrite a newer main draft', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  await findButton(app.render('input', input.component, app.mainProps), 'Optimize input').props.onClick()
  await turn()
  const action = app.components.get('conversation.chat.assistant-actions:delta.context.optimizer-apply')
  const outputChat = { nodes: { values: () => [{ kind: 'assistant-step', data: {
    finalNode: { messageId: 'message-restore' }, blocks: [{ kind: 'text', text: 'Rewritten text.' }],
  } }] } }
  const props = { ...app.mainProps, sessionId: 'assistant-1', messageId: 'message-restore', useChat: selector => selector(outputChat) }
  await findButton(app.render('result', action.component, props), 'Optimization preview').props.onClick()
  await findButton(app.render('result', action.component, props), 'Use this version').props.onClick()
  app.setDraft('A newer user draft.')
  app.render('input', input.component, app.mainProps)
  const preview = app.render('result', action.component, props)
  await findButton(preview, 'Restore original').props.onClick()
  const after = app.render('result', action.component, props)
  assert.ok(textOf(after).includes(uiEn.draftChanged))
  assert.equal(app.draft, 'A newer user draft.')
})


test('locked parent suppresses assistant controls, hover copy and checkpoint activity', async () => {
  const app = makeHarness({ compactionStatus: { seq: 12, phase: 'completed', failed: false } })
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  const before = app.render('input', input.component, app.mainProps)
  const old = findButton(before, 'Discuss independently')
  const hover = app.components.get('sidebar.session.row.hover:delta.session.identity')
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  assert.ok(hover)
  assert.ok(app.render('hover', hover.component, { sessionId: 'main-1' }), 'confirmed ordinary session can display its ID')
  await app.setProtection({ hasPin: true, lockMode: 'totp', lockedSessionIds: ['session-main-1'] })
  assert.equal(app.render('input', input.component, app.mainProps), null)
  assert.equal(app.render('hover', hover.component, { sessionId: 'main-1' }), null)
  assert.equal(app.render('activity', activity.component, app.mainProps), null)
  await app.setProtection({ hasPin: false, lockMode: 'none', lockedSessionIds: [] })
  old.props.onClick()
  await turn()
  assert.equal(app.created.length, 0, 'previous protection revision never regains permission')
})

test('protection change during assistant retain prevents queued context, resource opening and leaks', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  const release = app.deferRetain()
  findButton(app.render('input', input.component, app.mainProps), 'Discuss independently').props.onClick()
  await turn()
  assert.equal(app.refCounts.get('assistant-1'), 1)
  await app.setProtection({ hasPin: true, lockMode: 'totp', lockedSessionIds: ['main-1'] })
  assert.equal(app.refCounts.get('assistant-1'), 0, 'not-yet-ready reference releases immediately')
  release()
  await turn()
  assert.equal(app.prompts.length, 0)
  assert.equal(app.opened.length, 0)
  assert.equal(app.refCounts.get('assistant-1'), 0)
})

test('assistant resource validates association and revokes its retained reference on protection change', async () => {
  const app = makeHarness()
  await app.ready
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  findButton(app.render('input', input.component, app.mainProps), 'Discuss independently').props.onClick()
  await turn()
  const provider = app.resources.find(row => row.protocol === 'dtdelta')
  const address = app.opened[0]
  assert.ok(provider && address)
  const forged = 'dsh-resource://dtdelta/session/main-1?parent=main-1&purpose=discussion'
  const signal = new AbortController().signal
  await assert.rejects(provider.open(forged, { signal }).next(), /protected or invalid resource/)
  const iterator = provider.open(address, { signal })
  const opened = await iterator.next()
  assert.equal(opened.value.value.parentSessionId, 'main-1')
  assert.equal(app.refCounts.get('assistant-1'), 1)
  await app.setProtection({ hasPin: true, lockMode: 'totp', lockedSessionIds: ['main-1'] })
  assert.equal(app.refCounts.get('assistant-1'), 0)
  assert.equal((await iterator.next()).done, true)
  await assert.rejects(provider.open(address, { signal }).next(), /protected or invalid resource/)
})


test('incomplete public Assistant services do not mount a partial surface or block personalization', () => {
  for (const missingAssistantMethod of [
    'sessions.create', 'sessions.retain', 'resources.register',
    'sidebarRightTabs.register', 'sidebarRight.openResource',
  ]) {
    const app = makeHarness({ missingAssistantMethod })
    assert.equal(app.resources.length, 0, missingAssistantMethod)
    assert.equal(app.tabs.length, 0, missingAssistantMethod)
    assert.equal(app.components.has('conversation.input.left:delta.context.assistant-actions'), false, missingAssistantMethod)
    assert.ok(app.components.has('settings.section:delta.personalization'), missingAssistantMethod)
    app.effects.reverse().forEach(cleanup => cleanup())
  }
})

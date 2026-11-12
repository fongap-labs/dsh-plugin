import { test } from 'node:test'
import { buildDesktopClientFixture } from './helpers/build-desktop-client.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const clientSource = buildDesktopClientFixture()
const { EMPTY_COMPACTION_STATUS, foldCompactionStatus, registerCompactionStatusProjection } = await import(pathToFileURL(
  fixture('packages/dsh-delta-desktop/lib/context-projection.js')).href)

function makeHarness({ draft = 'Please explain the request clearly.', pressure, mainRunning = true,
  compactionStatus, command = async () => ({ matched: true }), persistedStorage = new Map(),
  mcpSnapshot, mcpNamespace = 'mcp-manager', mcpManager, mcpMutate = async () => true, deltaSettingsSnapshot,
  deltaSettingsMutate = async () => true, credentialsRemote } = {}) {
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
    window: { __ModuleLoader__: { load(entry) { registration = entry } } },
    document, navigator: { language: 'en-US' }, URL, URLSearchParams, AbortController,
    localStorage: { getItem(key) { return storage.get(key) ?? null }, setItem(key, value) { storage.set(key, value) } },
    MutationObserver: class { observe() {} disconnect() {} },
    console: { error(...values) { diagnosticMessages.push(values.map(String).join(' ')) }, warn(...values) { diagnosticMessages.push(values.map(String).join(' ')) } },
  }
  vm.runInNewContext(clientSource, context)
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
    useEffect(effect) { effect() },
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
        sessionId, binding: { session }, ready: Promise.resolve(),
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
    if (namespace === 'dsh-delta-desktop') return deltaForm
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
    get draft() { return draftValue }, sessions }
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

function openMcpDialog(app) {
  const action = app.components.get('plugins.add.actions:delta.mcp.add-server')
  assert.ok(action, 'MCP entry is contributed to the official Add plugin menu')
  const menuItem = action.component({ onDismiss() {} })
  menuItem.props.onSelect()
  const rendered = app.dialogRoots.at(-1)?.rendered
  assert.ok(rendered)
  return () => app.render('mcp-dialog', rendered.type, rendered.props)
}

test('MCP manager entry follows the built-in install action and handles missing Host services', () => {
  const app = makeHarness()
  const action = app.components.get('plugins.add.actions:delta.mcp.add-server')
  assert.ok(action, 'MCP slot missing; registered: ' + [...app.components.keys()].join(', ') + '; diagnostic: ' + app.diagnosticMessages.join(' | '))
  assert.equal(action.spec.order, -100)
  let dismissed = false
  const menuItem = action.component({ onDismiss() { dismissed = true } })
  menuItem.props.onSelect()
  assert.equal(dismissed, true)
  const rendered = app.dialogRoots[0].rendered
  const dialog = app.render('mcp-unavailable', rendered.type, rendered.props)
  assert.match(textOf(dialog), /does not expose the MCP settings form/i)
})

test('MCP settings use the current Desktop entry id and retain a custom Profile fallback', () => {
  const snapshot = { status: 'ready', revision: 1, writable: true,
    value: { servers: {} }, base: { servers: {} }, user: { servers: {} } }
  const desktop = makeHarness({ mcpSnapshot: snapshot })
  const desktopTree = openMcpDialog(desktop)()
  assert.ok(findButton(desktopTree, 'Add server'))
  assert.deepEqual(desktop.mcpFormQueries, ['mcp-manager'])

  const custom = makeHarness({ mcpSnapshot: snapshot, mcpNamespace: 'mcp' })
  const customTree = openMcpDialog(custom)()
  assert.ok(findButton(customTree, 'Add server'))
  assert.deepEqual(custom.mcpFormQueries, ['mcp-manager', 'mcp'])
})

test('MCP server form writes one revision-fenced server path and preserves failures', async () => {
  const snapshot = { status: 'ready', revision: 7, writable: true,
    value: { servers: {} }, base: { servers: {} }, user: { servers: {} } }
  const app = makeHarness({ mcpSnapshot: snapshot })
  let tree = openMcpDialog(app)()
  findButton(tree, 'Add server').props.onClick()
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findField(tree, 'Server name').props.onChange({ currentTarget: { value: 'docs_server' } })
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findField(tree, 'Executable command').props.onChange({ currentTarget: { value: 'npx' } })
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findField(tree, 'Command arguments').props.onChange({ currentTarget: { value: '-y\n@acme/docs-mcp' } })
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findField(tree, 'Environment variables').props.onChange({ currentTarget: { value: 'TOKEN=${credential:DOCS_TOKEN}' } })
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findElement(tree, 'form').props.onSubmit({ preventDefault() {} })
  await turn()
  assert.equal(app.mcpMutations.length, 1)
  assert.equal(app.mcpMutations[0].revision, 7)
  assert.equal(JSON.stringify(app.mcpMutations[0].ops), JSON.stringify([{ op: 'set', path: ['servers', 'docs_server'], value: {
    transport: 'stdio', enabled: true, command: 'npx', args: ['-y', '@acme/docs-mcp'], env: { TOKEN: '${credential:DOCS_TOKEN}' },
  } }]))

  const http = makeHarness({ mcpSnapshot: snapshot })
  tree = openMcpDialog(http)()
  findButton(tree, 'Add server').props.onClick()
  tree = http.render('mcp-dialog', http.dialogRoots[0].rendered.type, http.dialogRoots[0].rendered.props)
  findField(tree, 'Transport').props.onChange({ currentTarget: { value: 'streamable-http' } })
  tree = http.render('mcp-dialog', http.dialogRoots[0].rendered.type, http.dialogRoots[0].rendered.props)
  findField(tree, 'Server name').props.onChange({ currentTarget: { value: 'remote_docs' } })
  tree = http.render('mcp-dialog', http.dialogRoots[0].rendered.type, http.dialogRoots[0].rendered.props)
  findField(tree, 'Service URL').props.onChange({ currentTarget: { value: 'https://mcp.example.com/mcp' } })
  tree = http.render('mcp-dialog', http.dialogRoots[0].rendered.type, http.dialogRoots[0].rendered.props)
  findField(tree, 'Request headers').props.onChange({ currentTarget: { value: 'Authorization=Bearer ${credential:REMOTE_TOKEN}' } })
  tree = http.render('mcp-dialog', http.dialogRoots[0].rendered.type, http.dialogRoots[0].rendered.props)
  findElement(tree, 'form').props.onSubmit({ preventDefault() {} })
  await turn()
  assert.equal(JSON.stringify(http.mcpMutations[0].ops), JSON.stringify([{ op: 'set', path: ['servers', 'remote_docs'], value: {
    transport: 'streamable-http', enabled: true, url: 'https://mcp.example.com/mcp',
    headers: { Authorization: 'Bearer ${credential:REMOTE_TOKEN}' },
  } }]))

  const failing = makeHarness({ mcpSnapshot: snapshot, mcpMutate: async () => false })
  tree = openMcpDialog(failing)()
  findButton(tree, 'Add server').props.onClick()
  tree = failing.render('mcp-dialog', failing.dialogRoots[0].rendered.type, failing.dialogRoots[0].rendered.props)
  findField(tree, 'Server name').props.onChange({ currentTarget: { value: 'bad_write' } })
  tree = failing.render('mcp-dialog', failing.dialogRoots[0].rendered.type, failing.dialogRoots[0].rendered.props)
  findField(tree, 'Executable command').props.onChange({ currentTarget: { value: 'npx' } })
  tree = failing.render('mcp-dialog', failing.dialogRoots[0].rendered.type, failing.dialogRoots[0].rendered.props)
  findElement(tree, 'form').props.onSubmit({ preventDefault() {} })
  await turn()
  tree = failing.render('mcp-dialog', failing.dialogRoots[0].rendered.type, failing.dialogRoots[0].rendered.props)
  assert.match(textOf(tree), /Save failed and configuration was not changed/i)
})

test('MCP list observes live status and exposes probe and restart actions', async () => {
  const snapshot = { status: 'ready', revision: 2, writable: true,
    value: { servers: { docs: { transport: 'stdio', command: 'npx', args: [], env: {}, enabled: true } } },
    base: { servers: {} }, user: { servers: { docs: { transport: 'stdio', command: 'npx', args: [], env: {}, enabled: true } } } }
  const calls = []
  const manager = {
    async *watch() { yield [{ name: 'docs', configured: true, status: { state: 'connected' } }] },
    async probe(name) { calls.push(['probe', name]); return {} },
    async restart(name) { calls.push(['restart', name]); return {} },
  }
  const app = makeHarness({ mcpSnapshot: snapshot, mcpManager: manager })
  let tree = openMcpDialog(app)()
  await turn()
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  assert.match(textOf(tree), /Connected/)
  await findButton(tree, 'Test connection').props.onClick()
  await turn()
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  assert.deepEqual(calls, [['probe', 'docs']])
  assert.match(textOf(tree), /Connection test completed/)
  await findButton(tree, 'Restart connection').props.onClick()
  await turn()
  assert.deepEqual(calls, [['probe', 'docs'], ['restart', 'docs']])
})

test('MCP enablement changes only one field and inherited removal requires confirmation', async () => {
  const snapshot = { status: 'ready', revision: 5, writable: true,
    value: { servers: { inherited: { transport: 'stdio', command: 'npx', args: [], env: {}, enabled: true } } },
    base: { servers: { inherited: { transport: 'stdio', command: 'npx', args: [], env: {}, enabled: true } } },
    user: { servers: { inherited: { transport: 'stdio', command: 'npx', args: [], env: {}, enabled: true } } } }
  const app = makeHarness({ mcpSnapshot: snapshot })
  let tree = openMcpDialog(app)()
  await findButton(tree, 'Enabled').props.onClick()
  await turn()
  assert.equal(JSON.stringify(app.mcpMutations[0].ops), JSON.stringify([
    { op: 'set', path: ['servers', 'inherited', 'enabled'], value: false },
  ]))
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findButton(tree, 'Restore inherited configuration').props.onClick()
  tree = app.render('mcp-dialog', app.dialogRoots[0].rendered.type, app.dialogRoots[0].rendered.props)
  findButton(tree, 'Confirm removal').props.onClick()
  await turn()
  assert.equal(JSON.stringify(app.mcpMutations[1].ops), JSON.stringify([
    { op: 'unset', path: ['servers', 'inherited'] },
  ]))
})

test('the package enables the official automatic compaction backend at Profile level', () => {
  const patch = readFileSync(fixture('packages/dsh-delta-desktop/cordis.patch.yml'), 'utf8')
  assert.match(patch, /- id: dsh-delta-global-compaction\s+name: '@deepseek-ai\/dsh-compaction-basic'\s+config:\s+auto: true/)
  const preset = patch.slice(patch.indexOf('id: dsh-delta-context-preset'))
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
  const app = makeHarness()
  const label = app.components.get('conversation.input.model.label:').component
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
  const storage = new Map([['fongap.dsh-delta-desktop.features.v1', JSON.stringify({
    showDeepSeekAccountInfo: false, showModelInfo: false, inputOptimization: true, retiredPreference: false,
  })]])
  makeHarness({ persistedStorage: storage })
  assert.deepEqual(JSON.parse(storage.get('fongap.dsh-delta-desktop.features.v1')),
    { showDeepSeekAccountInfo: false, showModelInfo: false, inputOptimization: true })
})

test('redaction and vision bridge settings persist through Host forms while credentials stay out of config', async () => {
  const snapshot = { status: 'ready', revision: 12, writable: true, value: {}, base: {}, user: {} }
  const credentialWrites = []
  const app = makeHarness({ deltaSettingsSnapshot: snapshot, credentialsRemote: {
    async set(value) { credentialWrites.push(value); return { ok: true } },
    async unset(value) { credentialWrites.push({ unset: value }); return { ok: true } },
  } })
  const setting = app.components.get('settings.section:delta.personalization')
  const controller = setting.spec.inject().controller
  const page = app.render('settings', setting.component, { controller })
  const section = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(page)
  })()
  const settingsTree = app.render('preferences', section.type, section.props)
  const privacy = settingsTree.children.find(child => child?.type?.name === 'PrivacyVisionSettings')
  assert.ok(privacy)
  let tree = app.render('privacy', privacy.type, privacy.props)
  assert.equal(findSwitch(tree, 'Enable DeepSeek model routes').props['aria-checked'], true)
  assert.equal(findSwitch(tree, 'Enable request redaction').props['aria-checked'], true)
  assert.equal(findSwitch(tree, 'Enable vision bridge').props['aria-checked'], true)
  findSwitch(tree, 'Enable DeepSeek model routes').props.onClick()
  tree = app.render('privacy', privacy.type, privacy.props)
  findSwitch(tree, 'Enable request redaction').props.onClick()
  tree = app.render('privacy', privacy.type, privacy.props)
  findField(tree, 'Vision model source').props.onChange({ target: { value: 'custom' } })
  tree = app.render('privacy', privacy.type, privacy.props)
  findField(tree, 'Endpoint base URL').props.onChange({ target: { value: 'https://vision.example/v1' } })
  tree = app.render('privacy', privacy.type, privacy.props)
  findField(tree, 'Vision model ID').props.onChange({ target: { value: 'vision-model' } })
  tree = app.render('privacy', privacy.type, privacy.props)
  findField(tree, 'API key (leave empty if not required)').props.onChange({ target: { value: 'secret-never-in-config' } })
  tree = app.render('privacy', privacy.type, privacy.props)
  await findButton(tree, 'Save settings').props.onClick()
  await turn()
  assert.equal(app.deltaSettingsMutations.length, 1)
  assert.equal(app.deltaSettingsMutations[0].revision, 12)
  const serializedConfig = JSON.stringify(app.deltaSettingsMutations[0].ops)
  assert.match(serializedConfig, /redactionEnabled/)
  assert.match(serializedConfig, /deepSeekModelsEnabled/)
  assert.doesNotMatch(serializedConfig, /secret-never-in-config/)
  assert.equal(JSON.stringify(credentialWrites), JSON.stringify([{ ref: 'DELTA_VISION_API_KEY', value: 'secret-never-in-config' }]))
  const rebooted = makeHarness({ deltaSettingsSnapshot: snapshot })
  const reopenedSetting = rebooted.components.get('settings.section:delta.personalization')
  const reopenedPage = rebooted.render('settings-reboot', reopenedSetting.component,
    { controller: reopenedSetting.spec.inject().controller })
  const reopenedSection = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(reopenedPage)
  })()
  const reopenedTree = rebooted.render('preferences-reboot', reopenedSection.type, reopenedSection.props)
  const reopenedPrivacy = reopenedTree.children.find(child => child?.type?.name === 'PrivacyVisionSettings')
  const privacyTree = rebooted.render('privacy-reboot', reopenedPrivacy.type, reopenedPrivacy.props)
  assert.equal(findSwitch(privacyTree, 'Enable DeepSeek model routes').props['aria-checked'], false)
  assert.equal(findSwitch(privacyTree, 'Enable request redaction').props['aria-checked'], false)
  assert.equal(findField(privacyTree, 'Vision model source').props.value, 'custom')
})

test('failed privacy settings writes keep credentials out of the Host form and show a recoverable error', async () => {
  const snapshot = { status: 'ready', revision: 3, writable: true, value: {}, base: {}, user: {} }
  const credentialWrites = []
  const app = makeHarness({ deltaSettingsSnapshot: snapshot, deltaSettingsMutate: async () => false,
    credentialsRemote: { async set(value) { credentialWrites.push(value); return { ok: true } } } })
  const setting = app.components.get('settings.section:delta.personalization')
  const page = app.render('settings-failed', setting.component, { controller: setting.spec.inject().controller })
  const section = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : typeof node.type === 'function' && node.type.name === 'FeaturePreferencesSection' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(page)
  })()
  const preferences = app.render('preferences-failed', section.type, section.props)
  const privacy = preferences.children.find(child => child?.type?.name === 'PrivacyVisionSettings')
  let tree = app.render('privacy-failed', privacy.type, privacy.props)
  await findButton(tree, 'Save settings').props.onClick()
  await turn()
  tree = app.render('privacy-failed', privacy.type, privacy.props)
  assert.match(textOf(tree), /Save failed or settings are invalid/i)
  assert.deepEqual(credentialWrites, [])
})

test('independent discussion and input optimization use a separate tool-free session', async () => {
  const app = makeHarness()
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
  const address = 'dsh-resource://dtdelta/session/assistant-1?parent=main-1&purpose=discussion'
  const tab = [...app.components.values()].find(value => value.spec.name === 'sidebar.right.pane.tab' && value.spec.key === '@fongap-labs/dsh-delta-desktop')
  assert.ok(tab)
  const props = {
    ...app.mainProps,
    useTabInfo: () => ({ tab: { contentId: address } }),
    useResource: () => ({ value: { parentSessionId: 'main-1', assistantSessionId: 'assistant-1', purpose: 'discussion', reference: {} } }),
    SessionProvider: () => null,
    renderSlot: () => null,
  }
  let tree = app.render('sidebar', tab.component, props)
  assert.ok(findElement(tree, 'details'), 'main task status stays available in a collapsed summary')
  assert.ok(findClass(tree, 'dtd-assistant-conversation'), 'the main area remains the independent conversation')
  assert.equal(findClass(tree, 'dtd-correction-box'), undefined, 'correction entry is opened only on request')
  assert.equal(findElement(tree, 'textarea'), undefined, 'correction editor stays out of the conversation until requested')
  await findButton(tree, 'Send guidance').props.onClick()
  tree = app.render('sidebar', tab.component, props)
  const textarea = (() => {
    const walk = node => !node || typeof node !== 'object' ? undefined
      : node.type === 'textarea' ? node
        : (node.children || []).map(walk).find(Boolean)
    return walk(tree)
  })()
  textarea.props.onChange({ currentTarget: { value: 'Change the task direction and prioritize security.' } })
  tree = app.render('sidebar', tab.component, props)
  await findButton(tree, 'Review the content to queue for the main task').props.onClick()
  tree = app.render('sidebar', tab.component, props)
  await findButton(tree, 'Confirm and queue').props.onClick()
  await turn()
  const mainPrompt = app.prompts.find(value => value.sessionId === 'main-1')
  assert.equal(mainPrompt.mode, 'queue')
  assert.match(mainPrompt.content[0].text, /prioritize security/)
  assert.equal(app.commands.length, 0)
})

test('automatic compaction activity appears in the chat and not in the composer', () => {
  const app = makeHarness({ pressure: { projectedTokens: 8_600, contextWindow: 10_000 },
    compactionStatus: { seq: 4, phase: 'running', failed: false } })
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

test('a completed compaction shows its structured checkpoint in the chat activity row', () => {
  const app = makeHarness({ compactionStatus: { seq: 12, phase: 'completed', failed: false } })
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  const tree = app.render('compaction', activity.component, app.mainProps)
  assert.match(textOf(tree), /Earlier conversation condensed/)
  assert.match(textOf(tree), /View summary/)
  assert.match(textOf(tree), /Primary Request and Intent/)
  assert.match(textOf(tree), /Keep user constraints/)
})

test('a failed automatic compaction reports in the chat and preserves the draft', () => {
  const app = makeHarness({ pressure: { projectedTokens: 9_100, contextWindow: 10_000 },
    compactionStatus: { seq: 12, phase: 'failed', failed: true } })
  const input = app.components.get('conversation.input.left:delta.context.assistant-actions')
  const composer = app.render('input', input.component, app.mainProps)
  assert.doesNotMatch(textOf(composer), /compression failed/i)
  const activity = app.components.get('conversation.chat.assistant-actions:delta.context.compaction-activity')
  const notice = app.render('compaction', activity.component, app.mainProps)
  assert.match(textOf(notice), /Context compression failed/)
  assert.equal(findClass(notice, 'dtd-compaction-event is-failed')?.props.role, 'alert')
  assert.equal(app.draft, 'Please explain the request clearly.')
  assert.equal(app.commands.length, 0)
})

test('input optimization refuses to replace a draft edited while the result was being prepared', async () => {
  const app = makeHarness()
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
  assert.match(textOf(after), /main draft changed/i)
  assert.equal(app.draft, 'A newer instruction typed after optimization started.')
})

test('restoring optimized text does not overwrite a newer main draft', async () => {
  const app = makeHarness()
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
  assert.match(textOf(after), /main draft changed/i)
  assert.equal(app.draft, 'A newer user draft.')
})

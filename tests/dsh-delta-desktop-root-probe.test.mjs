import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { buildDesktopClientFixture } from './helpers/build-desktop-client.mjs'

const repoFile = name => readFileSync(fileURLToPath(new URL('../' + name, import.meta.url)), 'utf8')
const client = repoFile('packages/dsh-delta-desktop/src/client.ts')
const bundle = buildDesktopClientFixture()

function createProbe({ occupied = false, contract = true } = {}) {
  let entry
  const log = { info: [], error: [] }
  const registrations = [], disposed = [], provided = []
  const active = occupied ? [{ options: { key: 'native' } }] : []
  vm.runInNewContext(bundle, {
    window: { __ModuleLoader__: { load(plugin) { entry = plugin } } },
    localStorage: { getItem(key) {
      return key === 'fongap.delta.root-probe.v1' ? 'enabled' : null
    } },
    console: { info(...a) { log.info.push(a.map(String).join(' ')) },
      error(...a) { log.error.push(a.map(String).join(' ')) } },
  })
  assert.ok(entry, 'the existing Delta Desktop client must register its factory')
  const React = {
    createElement(type, props, ...children) { return { type, props, children } },
    useSyncExternalStore(_subscribe, snapshot) { return snapshot() },
    useState(v) { return [v, () => {}] }, useRef(v) { return { current: v } }, useEffect() {},
  }
  const plugin = entry.factory(name => {
    if (name === 'react') return React
    throw new Error('optional Host module not present: ' + name)
  })
  const slots = {
    entries(key) { return key === 'root' ? active : [] },
    provideRoot(value) {
      provided.push(value)
      return () => disposed.push('hooks')
    },
    register(options, component) {
      registrations.push({ options, component })
      if (options.name !== 'root') throw new Error('wrong slot')
      active.push({ options })
      return () => { active.pop(); disposed.push('root') }
    },
  }
  if (!contract) delete slots.provideRoot
  const scope = {
    slots,
    reflect: {
      provide(key, value) {
        provided.push({ key, value })
        return () => disposed.push('layout')
      },
    },
    effect(cb) { this.cleanup = cb() },
  }
  plugin.apply({ inject(keys, install) {
    assert.deepEqual(Array.from(keys), ['slots'])
    install(scope)
  } })
  return { registrations, disposed, provided, scope, log, active }
}

test('Root probe is explicit opt-in and absent from the normal package patch', () => {
  assert.match(client, /localStorage\.getItem\(DELTA_ROOT_PROBE_STORAGE_KEY\) === 'enabled'/)
  assert.match(client, /if \(deltaRootProbeEnabled\(\)\)/)
  assert.doesNotMatch(repoFile('packages/dsh-delta-desktop/cordis.patch.yml'), /disabled: true/)
  const overlay = repoFile('experiments/root-probe/cordis.patch.yml')
  assert.match(overlay, /- id: ui-layout\n  disabled: true/)
  assert.match(overlay, /- id: ui-sidebar\n  disabled: true/)
  assert.match(overlay, /- id: ui-conversation\n  disabled: true/)
  assert.match(overlay, /- id: message-quotes\n  disabled: true/)
  assert.match(overlay, /- id: entry-customization\n  disabled: true/)
  assert.doesNotMatch(overlay, /- id: ui-renderer\n  disabled: true/)
  assert.doesNotMatch(overlay, /- id: ui-session\n  disabled: true/)
})

test('isolated mode claims one Root, publishes layout, and releases both on teardown', () => {
  const run = createProbe()
  assert.equal(run.registrations.length, 1)
  assert.equal(run.registrations[0].options.name, 'root')
  const children = run.registrations[0].options.children
  assert.deepEqual(Object.keys(children).sort(), [
    'main', 'rightbar', 'shell.bottom', 'shell.leading', 'shell.overlay', 'sidebar',
  ])
  assert.equal(children.main.kind, 'keyed')
  const provider = run.provided.find(entry => entry.key === 'layout')?.value
  assert.ok(provider)
  assert.equal(typeof provider.toggleSidebar, 'function')
  assert.equal(typeof provider.selectPanel, 'function')
  assert.equal(typeof provider.beginNavigation, 'function')
  assert.equal(typeof provider.openRightbar, 'function')
  assert.equal(typeof provider.closeRightbar, 'function')
  const rootView = run.registrations[0].component({ renderSlot(_id) { return null } })
  assert.match(JSON.stringify(rootView), /data-delta-root-probe/)
  assert.match(JSON.stringify(rootView), /Root ownership: Delta/)
  provider.toggleSidebar()
  assert.equal(provider.panelInfo.getSnapshot().activePanelId, null)
  assert.throws(() => provider.selectPanel('missing'), /unregistered panel/)
  run.scope.cleanup()
  assert.deepEqual(run.disposed, ['root', 'layout', 'hooks'])
  assert.equal(run.active.length, 0)
})

test('Root already owned rejects takeover without modifying the official occupant', () => {
  const run = createProbe({ occupied: true })
  assert.equal(run.registrations.length, 0)
  assert.equal(run.provided.length, 0)
  assert.equal(run.active.length, 1)
  assert.match(run.log.error.join('\n'), /root is already occupied/)
})

test('missing formal service contracts fail closed without publishing a partial Root', () => {
  const run = createProbe({ contract: false })
  assert.equal(run.registrations.length, 0)
  assert.equal(run.provided.length, 0)
  assert.match(run.log.error.join('\n'), /missing public slots/)
})

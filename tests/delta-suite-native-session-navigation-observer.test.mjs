import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const file = path => fileURLToPath(new URL('../' + path, import.meta.url))
const source = readFileSync(file('packages/delta-ui/src/client.ts'), 'utf8')
const compileDir = mkdtempSync(join(tmpdir(), 'delta-native-main-session-'))
let compiled, lifecycle
try {
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
    file('packages/delta-ui/tsconfig.client.json'), '--outDir', compileDir], { stdio: 'pipe' })
  compiled = readFileSync(join(compileDir, 'client.js'), 'utf8')
  lifecycle = readFileSync(join(compileDir, 'client-registration-lifecycle.js'), 'utf8')
} finally { rmSync(compileDir, { recursive: true, force: true }) }
const begin = compiled.indexOf('function readConfirmedMainSessionId(')
const end = compiled.indexOf('function createClientFeatureManager(', begin)
assert.ok(begin >= 0 && end > begin)
const { readConfirmedMainSessionId, observeConfirmedMainSession } = vm.runInNewContext(
  compiled.slice(begin, end) + '\n({ readConfirmedMainSessionId, observeConfirmedMainSession })',
)

test('native session navigation method remains Host-owned', () => {
  // Reject assignment, not the public capability check using strict equality.
  const nativeNavigationAssignment = /navApi\.openSession\s*=(?!=)|const wrappedOpen\s*=/
  assert.match('navApi.openSession = wrapped', nativeNavigationAssignment)
  assert.doesNotMatch("typeof navApi.openSession === 'function'", nativeNavigationAssignment)
  assert.doesNotMatch(source, nativeNavigationAssignment)
  assert.match(source, /observeConfirmedMainSession\(\s*sessionsApi\.list, id => \{\s*if \(binding\.isCurrent\(\)\) deltaFeatures\.setActiveSessionId\(id\)/)
  assert.match(source, /readConfirmedMainSessionId\(api\.list\)/)
  assert.doesNotMatch(source, /deltaFeatures\.syncLockShieldOverlay\(centerCol\)/)
  assert.doesNotMatch(source, /if \(selectedSid\) deltaFeatures\.setActiveSessionId\(selectedSid\)/,
    'native Sidebar DOM fallback must remain retired')
})

test('only one confirmed native mainView is eligible', () => {
  const row = (id, mainView) => ({ id, retainedBy: { mainView } })
  const list = (...rows) => ({ getSnapshot: () => ({ byId: Object.fromEntries(rows.map(r => [r.id, r])) }) })
  assert.equal(readConfirmedMainSessionId(list(row('sidebar', 0), row('main', 1))), 'main')
  assert.equal(readConfirmedMainSessionId(list(row('a', 1), row('b', 1))), undefined)
  assert.equal(readConfirmedMainSessionId(list(row('a', 0))), undefined)
  assert.equal(readConfirmedMainSessionId(list({ id: 'legacy' })), undefined)
  assert.equal(readConfirmedMainSessionId(list()), undefined)
  assert.equal(readConfirmedMainSessionId({ getSnapshot() { throw new Error('reconnecting') } }), undefined)
})

test('observer follows confirmed retention, ignores uncertain transitions, and disposes once', () => {
  const rows = id => ({ byId: { [id]: { id, retainedBy: { mainView: 1 } } } })
  let snapshot = rows('initial')
  let notify
  let releases = 0
  const observed = []
  const list = {
    getSnapshot: () => snapshot,
    subscribe(callback) { notify = callback; return () => { releases += 1 } },
  }
  const dispose = observeConfirmedMainSession(list, id => observed.push(id))
  assert.deepEqual(observed, ['initial'])
  snapshot = { byId: {} }
  notify()
  snapshot = { byId: { ...rows('old').byId, ...rows('new').byId } }
  notify()
  assert.deepEqual(observed, ['initial'])
  snapshot = rows('new')
  notify()
  assert.deepEqual(observed, ['initial', 'new'])
  dispose()
  dispose()
  snapshot = rows('after-dispose')
  notify()
  assert.equal(releases, 1)
  assert.deepEqual(observed, ['initial', 'new'])
})

test('missing or failed subscription still permits initial read-only confirmation', () => {
  const getSnapshot = () => ({ byId: { main: { id: 'main', retainedBy: { mainView: 1 } } } })
  for (const list of [{ getSnapshot }, { getSnapshot, subscribe() { throw new Error('not available') } }]) {
    const observed = []
    const dispose = observeConfirmedMainSession(list, id => observed.push(id))
    assert.deepEqual(observed, ['main'])
    dispose()
  }
})


const registerClientFeatureGroup = vm.runInNewContext(lifecycle + '\nregisterClientFeatureGroup')

test('client feature registration rolls back partial public menu installation in reverse order', () => {
  const events = []
  assert.throws(() => registerClientFeatureGroup(track => {
    track(() => events.push('icon'))
    track(() => { events.push('menu'); throw new Error('cleanup failure') })
    throw new Error('unsupported menu')
  }), /unsupported menu/)
  assert.deepEqual(events, ['menu', 'icon'])
})

test('client group cleanup is idempotent, isolated and supports remount', () => {
  const events = []
  const mount = () => registerClientFeatureGroup(track => {
    track(undefined) // Some older public Slot implementations return no disposer.
    track(() => events.push('icon'))
    track(() => { events.push('menu'); throw new Error('cleanup failure') })
  })
  const first = mount()
  first()
  first()
  assert.deepEqual(events, ['menu', 'icon'])
  mount()()
  assert.deepEqual(events, ['menu', 'icon', 'menu', 'icon'])
})

test('menu group and service bindings each have a Cordis-owned lifetime', () => {
  assert.match(source, /menuScope\.effect\(\(\) => \{\s*try \{\s*return registerClientFeatureGroup\(track => \{/)
  assert.match(source, /scope\.inject\(\['contextMenus'\], menuScope =>/)
  assert.doesNotMatch(source, /searchScope\.effect\(\(\) => \{\s*try \{\s*return registerClientFeatureGroup\(track => \{/)
  assert.equal((source.match(/track\(scope\.slots\.register\(\{ name: 'contextMenu\.icon'/g) ?? []).length, 4)
  assert.equal((source.match(/track\(registerMenu\(\{/g) ?? []).length, 4)
  assert.match(source, /searchScope\.effect\(\(\) => registerClientFeatureGroup\(track => \{\s*const binding = bindSessionReferences\(/)
  assert.match(source, /try \{ deltaFeatures\.setSessionsApi\(undefined\) \}\s*finally \{ deltaFeatures\.setNavigationApi\(undefined\) \}/)
  assert.match(source, /track\(binding\.dispose\)/)
})


const createClientBindingLifetime = vm.runInNewContext(lifecycle + '\ncreateClientBindingLifetime')

test('old Host scope cleanup cannot clear a new binding, even with the same service object', () => {
  const bind = createClientBindingLifetime()
  const service = {}
  let current
  let clears = 0
  const mount = () => bind(() => { current = service }, () => { current = undefined; clears++ })
  const old = mount()
  const next = mount()
  assert.equal(old.isCurrent(), false)
  old.dispose()
  old.dispose()
  assert.equal(current, service)
  assert.equal(next.isCurrent(), true)
  assert.equal(clears, 0)
  next.dispose()
  next.dispose()
  assert.equal(current, undefined)
  assert.equal(clears, 1)
})

test('failed Host binding rolls back only its own generation and preserves original error', () => {
  const bind = createClientBindingLifetime()
  let current
  const prior = bind(() => { current = 'prior' }, () => { current = undefined })
  assert.throws(() => bind(() => {
    current = 'partial'
    throw new Error('binding failed')
  }, () => { current = undefined; throw new Error('release failed') }), /binding failed/)
  assert.equal(current, undefined)
  assert.equal(prior.isCurrent(), false)
  const next = bind(() => { current = 'next' }, () => { current = undefined })
  prior.dispose()
  assert.equal(current, 'next')
  next.dispose()
  assert.equal(current, undefined)
})

test('public workspace membership ignores callbacks retained by a superseded subscription', () => {
  assert.match(source, /const binding = \+\+workspaceMembershipBinding/)
  assert.match(source, /workspacesApi === api && binding === workspaceMembershipBinding/)
  assert.match(source, /workspaceScope\.effect\(\(\) => bindWorkspaceReferences\(/)
  for (const name of ['bindThemeReference', 'bindLayoutReference', 'bindRightReference']) {
    assert.ok(source.includes('.effect(() => ' + name + '('))
  }
})

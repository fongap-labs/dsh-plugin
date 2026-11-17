import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'

const file = path => fileURLToPath(new URL('../' + path, import.meta.url))
const source = readFileSync(file('packages/dsh-delta-desktop/src/client.ts'), 'utf8')
const compileDir = mkdtempSync(join(tmpdir(), 'delta-native-main-session-'))
let compiled
try {
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
    file('packages/dsh-delta-desktop/tsconfig.client.json'), '--outDir', compileDir], { stdio: 'pipe' })
  compiled = readFileSync(join(compileDir, 'client.js'), 'utf8')
} finally { rmSync(compileDir, { recursive: true, force: true }) }
const begin = compiled.indexOf('function readConfirmedMainSessionId(')
const end = compiled.indexOf('function createClientFeatureManager(', begin)
assert.ok(begin >= 0 && end > begin)
const { readConfirmedMainSessionId, observeConfirmedMainSession } = vm.runInNewContext(
  compiled.slice(begin, end) + '\n({ readConfirmedMainSessionId, observeConfirmedMainSession })',
)

test('native session navigation method remains Host-owned', () => {
  assert.doesNotMatch(source, /navApi\.openSession\s*=|const wrappedOpen\s*=/)
  assert.match(source, /observeConfirmedMainSession\(\s*sessionsApi\.list, id => deltaFeatures\.setActiveSessionId\(id\)/)
  assert.match(source, /readConfirmedMainSessionId\(api\.list\)/)
  assert.match(source, /deltaFeatures\.syncLockShieldOverlay\(centerCol\)/)
  assert.match(source, /if \(selectedSid\) deltaFeatures\.setActiveSessionId\(selectedSid\)/,
    'remaining lock-compatible DOM fallback is not dropped in this change')
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

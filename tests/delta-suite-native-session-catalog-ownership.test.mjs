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
const dir = mkdtempSync(join(tmpdir(), 'delta-session-catalog-'))
let compiled
try {
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
    file('packages/dsh-delta-desktop/tsconfig.client.json'), '--outDir', dir], { stdio: 'pipe' })
  compiled = readFileSync(join(dir, 'client.js'), 'utf8')
} finally { rmSync(dir, { recursive: true, force: true }) }
const start = compiled.indexOf('function canCallHostHttp(')
const end = compiled.indexOf('const deltaFeatures = createClientFeatureManager()', start)
assert.ok(start >= 0 && end > start)
const managerSource = compiled.slice(start, end) + '\ncreateClientFeatureManager()'

function fixture({ initial = {}, response, unavailable = false, rejectRefresh = false } = {}) {
  const calls = []
  const snapshot = Object.freeze({ byId: Object.freeze({
    target: Object.freeze({ id: 'target' }), locked: Object.freeze({ id: 'locked' }),
    other: Object.freeze({ id: 'other' }),
  }) })
  const state = deletedSessionIds => ({
    lockedSessionIds: [], lockedWorkspaceIds: [], movedSessions: {}, deletedSessionIds, ...initial,
  })
  const env = {
    console, window: unavailable ? {} : { location: { href: 'https://harness.test/' } },
    fetch: async (path, options) => {
      if (options?.method === 'POST') {
        calls.push(['post', path, JSON.parse(options.body)])
        if (response instanceof Error) throw response
        return { ok: response.status === 200, status: response.status, json: async () => response.data }
      }
      return { ok: true, status: 200, json: async () =>
        path === '/api/delta-desktop/state' ? { state: state([]) } : {} }
    },
  }
  const manager = vm.runInNewContext(managerSource, env)
  const list = Object.freeze({ getSnapshot: () => snapshot, subscribe: () => () => {} })
  manager.setSessionsApi({
    list, cancel: id => calls.push(['cancel', id]),
    refresh: async () => { calls.push(['refresh']); if (rejectRefresh) throw new Error('offline') },
  })
  manager.setNavigationApi({ startSession: () => calls.push(['new']) })
  return { manager, calls, state, list, snapshot }
}

test('unavailable, rejected or unacknowledged deletion never synthesizes a tombstone', async () => {
  for (const options of [
    { unavailable: true },
    { response: new Error('transport failure') },
    { response: { status: 500, data: { ok: false, error: 'failed' } } },
    { response: { status: 200, data: { ok: true, state: { deletedSessionIds: [] } } } },
  ]) {
    const f = fixture(options)
    await f.manager.refreshState()
    f.manager.setActiveSessionId('target')
    const result = await f.manager.deleteSession('target')
    assert.equal(result.ok, false)
    assert.equal(f.manager.isDeleted('target'), false)
    assert.equal(f.manager.getActiveSessionId(), 'target')
    assert.equal(f.calls.some(call => ['cancel', 'refresh', 'new'].includes(call[0])), false)
    assert.equal(f.list.getSnapshot(), f.snapshot)
  }
})

test('confirmed deletion keeps Host snapshot untouched and invokes public refresh', async () => {
  const f = fixture({ response: { status: 200, data: { ok: true, state: {
    lockedSessionIds: [], lockedWorkspaceIds: [], movedSessions: {}, deletedSessionIds: ['target'],
  } } }, rejectRefresh: true })
  await f.manager.refreshState()
  f.manager.setActiveSessionId('target')
  assert.equal((await f.manager.deleteSession('target')).ok, true)
  assert.equal(f.manager.isDeleted('target'), true)
  assert.equal(f.list.getSnapshot(), f.snapshot)
  assert.ok(f.snapshot.byId.target, 'Host owns stale catalog until refresh succeeds')
  assert.deepEqual(f.calls.map(call => call[0]), ['post', 'new', 'refresh'])
})

test('bulk deletion sends only unlocked IDs and accepts only explicitly confirmed subset', async () => {
  const f = fixture({
    initial: { lockedSessionIds: ['locked'] },
    response: { status: 200, data: { ok: true, deletedIds: ['target'], state: {
      lockedSessionIds: ['locked'], lockedWorkspaceIds: [], movedSessions: {}, deletedSessionIds: ['target'],
    } } },
  })
  await f.manager.refreshState()
  assert.equal((await f.manager.deleteSession('locked')).error, 'SESSION_LOCKED')
  const result = await f.manager.deleteUngroupedSessions(['target', 'locked', 'other'])
  assert.equal(result.ok, false)
  assert.equal(result.error, 'PARTIAL_DELETE')
  assert.equal(JSON.stringify(result.deletedIds), '["target"]')
  assert.deepEqual(f.calls[0][2].sessionIds, ['target', 'other'])
  assert.equal(f.manager.isDeleted('target'), true)
  assert.equal(f.manager.isDeleted('other'), false)
  assert.equal(f.manager.isLocked('locked'), true)
  assert.deepEqual(f.calls.map(call => call[0]), ['post', 'refresh'])
})

test('unexpected bulk acknowledgement is not applied', async () => {
  const f = fixture({ response: { status: 200, data: { ok: true, deletedIds: ['other'], state: {
    deletedSessionIds: ['other'],
  } } } })
  await f.manager.refreshState()
  const result = await f.manager.deleteUngroupedSessions(['target'])
  assert.equal(result.ok, false)
  assert.equal(f.manager.isDeleted('other'), false)
  assert.deepEqual(f.calls.map(call => call[0]), ['post'])
})

test('session list stays native-owned; workspace compatibility scope remains explicit', () => {
  assert.doesNotMatch(source, /installProjectedList(?:<[^>]*>)?\(\s*sessionsApi\.list/)
  assert.match(source, /installProjectedList<WorkspaceSnapshot>\(workspaces\.list/)
  assert.match(source, /await sessionsApi\?\.refresh\?\.\(\)/)
  assert.match(source, /if \(deltaFeatures\.isDeleted\(sessionId\)\) return/)
  assert.match(source, /if \(deltaFeatures\.isDeleted\(item\.id\)\) continue/)
  assert.match(source, /if \(deltaFeatures\.isDeleted\(item\.sessionId\) \|\| seen\.has/)
})

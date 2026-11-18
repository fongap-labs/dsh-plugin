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
const createProjection = () => vm.runInNewContext(
  compiled.slice(start, end) + '\ncreateWorkspaceCompatibilityProjection()',
)

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

test('workspace overlay retains native identities and ignores unrelated state revisions', () => {
  const project = createProjection()
  const base = Object.freeze({
    items: Object.freeze([
      Object.freeze({ workspaceId: 'a', title: 'A', path: '/a', sessionIds: Object.freeze(['target']) }),
      Object.freeze({ workspaceId: 'b', title: 'B', path: '/b', sessionIds: Object.freeze([]) }),
      Object.freeze({ workspaceId: 'c', title: 'C', path: '/c', sessionIds: Object.freeze(['other']) }),
    ]),
    archivedSessionIds: Object.freeze([]),
    pinnedSessionIds: Object.freeze(['target']),
  })
  const empty = { deletedSessionIds: [], lockedSessionIds: [], movedSessions: {} }
  assert.equal(project(base, empty), base)
  assert.equal(project(base, { ...empty, movedSessions: { target: 'a' } }), base)
  assert.equal(project(base, { ...empty, movedSessions: { target: 'missing' } }), base)
  const state = { ...empty, movedSessions: { target: 'b' } }
  const moved = project(base, state)
  assert.notEqual(moved, base)
  assert.equal(moved.items[2], base.items[2], 'unaffected row stays native')
  assert.equal(moved.archivedSessionIds, base.archivedSessionIds)
  assert.equal(moved.pinnedSessionIds, base.pinnedSessionIds)
  assert.equal(JSON.stringify(moved.items[0].sessionIds), '[]')
  assert.equal(JSON.stringify(moved.items[1].sessionIds), '["target"]')
  assert.equal(project(base, { ...state, revision: 999 }), moved)
  assert.equal(JSON.stringify(base.items[0].sessionIds), '["target"]')
  const locked = project(base, { ...empty, lockedSessionIds: ['target'] })
  assert.equal(JSON.stringify(locked.archivedSessionIds), '["target"]')
  assert.equal(JSON.stringify(locked.pinnedSessionIds), '[]')
  const nativeArchived = { ...base, archivedSessionIds: ['target'], pinnedSessionIds: [] }
  assert.equal(project(nativeArchived, { ...empty, lockedSessionIds: ['target'] }), nativeArchived)
})

test('native archive reconciliation ignores projected membership and coalesces in-flight requests', async () => {
  const f = fixture({ initial: { lockedSessionIds: ['locked'] } })
  await f.manager.refreshState()
  let release
  let raw = { items: [], archivedSessionIds: [] }
  const api = {
    list: { getSnapshot: () => ({ items: [], archivedSessionIds: ['locked'] }) },
    archiveSession(id) {
      f.calls.push(['archive', id])
      return new Promise(resolve => { release = resolve })
    },
  }
  f.manager.setWorkspacesApi(api, () => raw)
  await Promise.resolve()
  assert.deepEqual(f.calls, [['archive', 'locked']])
  await f.manager.refreshState()
  assert.deepEqual(f.calls, [['archive', 'locked']], 'pending archive is not duplicated')
  raw = { items: [], archivedSessionIds: ['locked'] }
  release()
  await Promise.resolve()
  await Promise.resolve()
  await f.manager.refreshState()
  assert.deepEqual(f.calls, [['archive', 'locked']], 'confirmed native archive needs no mutation')
  f.manager.setWorkspacesApi(undefined)
})

test('workspace move requires a known native target and explicit durable acknowledgement', async () => {
  for (const options of [
    { unavailable: true },
    { response: { status: 200, data: { ok: true, state: { movedSessions: {} } } } },
    { response: { status: 500, data: { ok: false } } },
  ]) {
    const f = fixture(options)
    const raw = { items: [{ workspaceId: 'b', path: '/b', title: 'B', sessionIds: [] }] }
    f.manager.setWorkspacesApi({ list: { getSnapshot: () => raw } }, () => raw)
    await f.manager.refreshState()
    assert.equal((await f.manager.moveSession('target', 'missing')).ok, false)
    assert.equal((await f.manager.moveSession('target', 'b')).ok, false)
    assert.equal(f.manager.getSnapshot().movedSessions.target, undefined)
  }
  const f = fixture({ response: { status: 200, data: { ok: true, state: {
    lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: { target: 'b' },
  } } } })
  const raw = { items: [{ workspaceId: 'b', path: '/b', title: 'B', sessionIds: [] }] }
  f.manager.setWorkspacesApi({ list: { getSnapshot: () => raw } }, () => raw)
  await f.manager.refreshState()
  assert.equal((await f.manager.moveSession('target', 'b')).ok, true)
  assert.equal(f.manager.getSnapshot().movedSessions.target, 'b')
  assert.deepEqual(f.calls.map(call => call[0]), ['post'])
  assert.equal(f.calls[0][2].targetPath, '/b')
})

test('move never posts from a locked session or into a locked workspace', async () => {
  const f = fixture({ initial: { lockedSessionIds: ['locked'], lockedWorkspaceIds: ['b'] } })
  const raw = { items: [
    { workspaceId: 'a', path: '/a', title: 'A', sessionIds: ['locked', 'target'] },
    { workspaceId: 'b', path: '/b', title: 'B', sessionIds: [] },
  ] }
  f.manager.setWorkspacesApi({ list: { getSnapshot: () => raw } }, () => raw)
  await f.manager.refreshState()
  assert.equal((await f.manager.moveSession('locked', 'a')).error, 'SESSION_LOCKED')
  assert.equal((await f.manager.moveSession('target', 'b')).error, 'SESSION_LOCKED')
  assert.equal(f.calls.length, 0)
})

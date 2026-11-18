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
  const state = deletedSessionIds => {
    const combined = {
      lockedSessionIds: [], lockedWorkspaceIds: [], movedSessions: {}, deletedSessionIds, ...initial,
    }
    const hasPin = initial.hasPin ?? (combined.lockedSessionIds.length > 0 || combined.lockedWorkspaceIds.length > 0)
    return {
      hasPin, lockMode: initial.lockMode ?? (hasPin ? 'totp' : 'none'), ...combined,
    }
  }
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
  return { manager, calls, state, list, snapshot, env }
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
    hasPin: false, lockMode: 'none',
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
      hasPin: true, lockMode: 'totp',
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

test('native workspace and session list method ownership is preserved', () => {
  assert.doesNotMatch(source, /function installProjectedList/)
  assert.doesNotMatch(source, /workspaces\.list\.(?:getSnapshot|subscribe)\s*=/)
  assert.match(source, /getWorkspaces: \(\) => readDeltaWorkspaceSnapshot\(\)\?\.items \?\? \[\]/)
  assert.match(source, /await sessionsApi\?\.refresh\?\.\(\)/)
  assert.match(source, /!readSearchProtection\(\)\.allowsSession\(sessionId, workspaceId\)/)
  assert.match(source, /if \(!policy\.allowsSession\(item\.id, item\.workspaceId\)\) continue/)
  assert.match(source, /if \(!policy\.allowsSession\(item\.sessionId, item\.workspaceId\) \|\| seen\.has/)
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
    hasPin: false, lockMode: 'none',
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

test('Delta scoped list projection preserves frozen native methods, subscribers and rows', async () => {
  const f = fixture({ initial: {
    deletedSessionIds: ['other'], lockedSessionIds: ['locked'], movedSessions: { target: 'b' },
  } })
  const native = Object.freeze({ items: Object.freeze([
    Object.freeze({ workspaceId: 'a', path: '/a', title: 'A',
      sessionIds: Object.freeze(['target', 'locked', 'other']) }),
    Object.freeze({ workspaceId: 'b', path: '/b', title: 'B', sessionIds: Object.freeze([]) }),
  ]), archivedSessionIds: Object.freeze([]), pinnedSessionIds: Object.freeze(['target']) })
  const listeners = new Set()
  const read = () => native
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn) }
  const list = Object.freeze({ getSnapshot: read, subscribe })
  let events = 0
  const stop = list.subscribe(() => { events++ })
  f.manager.setWorkspacesApi({ list })
  await f.manager.refreshState()
  assert.equal(list.getSnapshot, read)
  assert.equal(list.subscribe, subscribe)
  assert.equal(list.getSnapshot(), native)
  assert.equal(JSON.stringify(f.manager.getWorkspaces()[0].sessionIds), '["locked"]')
  assert.equal(JSON.stringify(f.manager.getWorkspaces()[1].sessionIds), '["target"]')
  assert.equal(JSON.stringify(native.items[0].sessionIds), '["target","locked","other"]')
  assert.equal(events, 0, 'Delta overlay did not publish a native event')
  for (const fn of listeners) fn()
  assert.equal(events, 1)
  f.manager.setWorkspacesApi(undefined)
  assert.equal(f.manager.getWorkspaces().length, 0)
  assert.equal(list.getSnapshot, read)
  assert.equal(list.subscribe, subscribe)
  stop()
  assert.equal(listeners.size, 0)
})

test('Delta local projection reuses rows after unrelated state updates', async () => {
  const f = fixture({ initial: { movedSessions: { target: 'b' } } })
  const native = Object.freeze({ items: Object.freeze([
    Object.freeze({ workspaceId: 'a', path: '/a', title: 'A', sessionIds: Object.freeze(['target']) }),
    Object.freeze({ workspaceId: 'b', path: '/b', title: 'B', sessionIds: Object.freeze([]) }),
  ]) })
  const list = Object.freeze({ getSnapshot: () => native, subscribe: () => () => {} })
  f.manager.setWorkspacesApi({ list })
  await f.manager.refreshState()
  const first = f.manager.getWorkspaces()
  assert.equal(JSON.stringify(first[1].sessionIds), '["target"]')
  f.manager.setActiveSessionId('other')
  assert.equal(f.manager.getWorkspaces(), first)
  assert.equal(list.getSnapshot(), native)
  f.manager.setWorkspacesApi(undefined)
})

test('equal Host membership payloads retain identity across refreshes', async () => {
  const f = fixture({ initial: { lockedSessionIds: ['locked'], lockedWorkspaceIds: ['a'], movedSessions: { target: 'b' } } })
  await f.manager.refreshState()
  const before = f.manager.getSnapshot()
  await f.manager.refreshState()
  const after = f.manager.getSnapshot()
  for (const key of ['lockedSessionIds', 'lockedWorkspaceIds', 'movedSessions', 'deletedSessionIds']) {
    assert.equal(after[key], before[key], key)
  }
})

const lockedState = {
  hasPin: true, lockMode: 'totp', lockedSessionIds: ['target'], lockedWorkspaceIds: ['b'],
  deletedSessionIds: [], movedSessions: {},
}
const clearedState = {
  ...lockedState, hasPin: false, lockMode: 'none', lockedSessionIds: [], lockedWorkspaceIds: [],
}

test('lock controls fail closed without Host transport, including temporary unlock and unbind', async () => {
  const f = fixture({ initial: lockedState })
  await f.manager.refreshState()
  f.env.window.location = undefined
  const before = f.manager.getSnapshot()
  for (const result of [
    await f.manager.beginTotpSetup(),
    await f.manager.confirmTotpSetup('other', 'token', '123456'),
    await f.manager.confirmTotpSetupWorkspace('a', 'token', '123456'),
    await f.manager.lockSession('other'),
    await f.manager.lockWorkspace('a'),
    await f.manager.verifyOrUnlockSession('target', '123456', false),
    await f.manager.verifyOrUnlockSession('target', '123456', true),
    await f.manager.verifyOrUnlockWorkspace('b', '123456', false),
    await f.manager.verifyOrUnlockWorkspace('b', '123456', true),
    await f.manager.clearPin('123456'),
  ]) assert.equal(result.ok, false)
  assert.equal(f.manager.getSnapshot(), before)
  assert.equal(f.manager.isProtectedView('target'), true)
  assert.equal(f.manager.isWorkspaceProtected('b'), true)
  assert.equal(f.calls.length, 0)
})

test('HTTP success or partial verification cannot release a protected view', async () => {
  for (const data of [
    { ok: false, verified: true, state: lockedState },
    { ok: true, state: lockedState },
    { ok: true, verified: true, state: { lockedSessionIds: [] } },
    { ok: true, verified: true, state: clearedState },
  ]) {
    const f = fixture({ initial: lockedState, response: { status: 200, data } })
    await f.manager.refreshState()
    const before = f.manager.getSnapshot()
    assert.equal((await f.manager.verifyOrUnlockSession('target', '123456', false)).ok, false)
    assert.equal((await f.manager.verifyOrUnlockWorkspace('b', '123456', false)).ok, false)
    assert.equal(f.manager.getSnapshot(), before)
    assert.equal(f.manager.isProtectedView('target'), true)
    assert.equal(f.manager.isWorkspaceProtected('b'), true)
  }
})

test('confirmed temporary verification preserves the durable lock; permanent unlock needs removal', async () => {
  const temporary = fixture({ initial: lockedState, response: {
    status: 200, data: { ok: true, verified: true, state: lockedState },
  } })
  await temporary.manager.refreshState()
  assert.equal((await temporary.manager.verifyOrUnlockSession('target', '123456', true)).ok, false)
  assert.equal((await temporary.manager.verifyOrUnlockSession('target', '123456', false)).ok, true)
  assert.equal(temporary.manager.isLocked('target'), true)
  assert.equal(temporary.manager.isProtectedView('target'), false)
  const durable = fixture({ initial: lockedState, response: {
    status: 200, data: { ok: true, verified: true, state: { ...lockedState, lockedSessionIds: [] } },
  } })
  await durable.manager.refreshState()
  const raw = { items: [], archivedSessionIds: ['target'] }
  const workspace = { list: { getSnapshot: () => raw }, unarchiveSession: () => assert.fail('stale method') }
  durable.manager.setWorkspacesApi(workspace)
  workspace.unarchiveSession = id => {
    assert.equal(durable.manager.isLocked(id), false, 'must apply confirmed state first')
    durable.calls.push(['unarchive', id])
  }
  assert.equal((await durable.manager.verifyOrUnlockSession('target', '123456', true)).ok, true)
  assert.equal(durable.manager.isLocked('target'), false)
  assert.deepEqual(durable.calls.map(call => call[0]), ['post', 'unarchive'])
})

test('unbind applies confirmed state before restoring only previously locked rows', async () => {
  const f = fixture({ initial: lockedState, response: {
    status: 200, data: { ok: true, state: clearedState, unarchivedIds: ['target', 'other'] },
  } })
  await f.manager.refreshState()
  const raw = { items: [], archivedSessionIds: ['target', 'other'] }
  f.manager.setWorkspacesApi({
    list: { getSnapshot: () => raw },
    unarchiveSession(id) {
      assert.equal(f.manager.isLocked(id), false)
      f.calls.push(['unarchive', id])
    },
  })
  assert.equal((await f.manager.clearPin('123456')).ok, true)
  assert.equal(f.manager.getSnapshot().hasPin, false)
  assert.equal(f.manager.isWorkspaceLocked('b'), false)
  assert.deepEqual(f.calls.filter(call => call[0] === 'unarchive'), [['unarchive', 'target']])
})

test('archive reconciliation never turns a failure into a stop-activity request', async () => {
  const f = fixture({ initial: lockedState })
  await f.manager.refreshState()
  const raw = { items: [], archivedSessionIds: [] }
  f.manager.setWorkspacesApi({
    list: { getSnapshot: () => raw },
    async archiveSession(id, options) {
      f.calls.push(['archive', id, options])
      throw new Error('transport or active-session refusal')
    },
  })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(f.calls, [['archive', 'target', undefined]])
  assert.equal(f.manager.isLocked('target'), true)
})

const makeMutationPolicy = vm.runInNewContext(
  compiled.slice(start, end) + '\nreadWorkspaceMutationPolicy',
)
const installMutationGuards = vm.runInNewContext(
  compiled.slice(start, end) + '\ninstallWorkspaceMutationGuards',
)
const mutationRows = [
  { workspaceId: 'a', path: '/protected', sessionIds: ['session-member', 'moved-away'] },
  { workspaceId: 'b', path: '/ordinary', sessionIds: ['ordinary', 'moved-in'] },
  { workspaceId: 'default', path: 'C:\\deepseek-harness\\default-workspace', sessionIds: [] },
]
const mutationState = {
  isSearchProtectionReady: true,
  lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {},
  tempUnlockedIds: [], tempUnlockedWorkspaceIds: [],
}

test('native mutation policy protects durable workspace membership, aliases and moves despite temporary viewing grants', () => {
  const state = {
    ...mutationState, lockedSessionIds: ['direct'], lockedWorkspaceIds: ['/protected'],
    deletedSessionIds: ['gone'], movedSessions: { 'moved-away': 'b', 'moved-in': 'a' },
    tempUnlockedIds: ['direct'], tempUnlockedWorkspaceIds: ['a', '/protected'],
  }
  const policy = makeMutationPolicy(state, () => ({ items: mutationRows }))
  for (const id of ['member', 'session-member', 'moved-away', 'moved-in']) {
    assert.equal(policy.unarchive(id).reason, 'workspace-locked')
  }
  assert.equal(policy.unarchive('session-direct').lockId, 'direct')
  assert.equal(policy.unarchive('session-gone').reason, 'session-deleted')
  assert.equal(policy.unarchive('ordinary'), undefined)
  assert.equal(policy.deleteWorkspace('a', false), 'workspace-locked')
  assert.equal(policy.deleteWorkspace('b', false), undefined)
})

test('workspace deletion respects native and mapped direct locks and preserves default protection', () => {
  const read = () => ({ items: mutationRows })
  const direct = makeMutationPolicy({ ...mutationState, lockedSessionIds: ['member'] }, read)
  assert.equal(direct.deleteWorkspace('a', true), 'session-locked')
  const moved = makeMutationPolicy({
    ...mutationState, lockedSessionIds: ['incoming'], movedSessions: { incoming: 'b' },
  }, read)
  assert.equal(moved.deleteWorkspace('b', false), 'session-locked')
  const defaultPolicy = makeMutationPolicy({
    ...mutationState, movedSessions: { incoming: 'default' },
  }, read)
  assert.equal(defaultPolicy.deleteWorkspace('default', true), 'protected-default-workspace')
  assert.equal(defaultPolicy.deleteWorkspace('default', false), undefined)
  assert.equal(makeMutationPolicy(mutationState, () => ({ items: mutationRows.slice(0, 1) }))
    .deleteWorkspace('a', false), 'sole-workspace-protected')
})

test('uncertain workspace membership cannot authorize guarded mutations', () => {
  for (const read of [
    () => { throw new Error('offline') },
    () => ({ items: [] }),
    () => ({ items: [{ workspaceId: 'a', path: '/protected' }] }),
    () => ({ items: [{ workspaceId: 'a', path: '/protected', sessionIds: [] },
      { workspaceId: 'b', path: '/ordinary' }] }),
  ]) {
    const policy = makeMutationPolicy({ ...mutationState, lockedWorkspaceIds: ['a'] }, read)
    assert.equal(policy.unarchive('other').reason, 'workspace-state-unavailable')
    assert.ok(policy.deleteWorkspace('b', false))
  }
})

test('guard lifecycle preserves native receivers, rejects stale callbacks and does not overwrite third-party methods', async () => {
  const calls = [], notices = []
  let state = { ...mutationState, lockedWorkspaceIds: ['a'] }
  const list = { getSnapshot: () => ({ items: mutationRows }) }
  const api = {
    list,
    delete(id) { assert.equal(this, api); calls.push(['delete', id]); return Promise.resolve('deleted') },
    unarchiveSession(id) { assert.equal(this, api); calls.push(['unarchive', id]); return Promise.resolve('restored') },
  }
  const nativeDelete = api.delete
  const nativeUnarchive = api.unarchiveSession
  const stop = installMutationGuards(api, list.getSnapshot, () => state, () => true,
    (reason, lockId) => notices.push([reason, lockId]))
  const stale = api.delete
  await assert.rejects(api.delete('a'), /workspace-locked/)
  await assert.rejects(api.unarchiveSession('member'), /workspace-locked/)
  assert.equal(calls.length, 0)
  state = { ...mutationState }
  assert.equal(await api.delete('b'), 'deleted')
  assert.equal(await api.unarchiveSession('ordinary'), 'restored')
  const later = () => Promise.resolve('other plugin')
  api.unarchiveSession = later
  stop()
  stop()
  assert.equal(api.delete, nativeDelete)
  assert.notEqual(api.unarchiveSession, nativeUnarchive)
  assert.equal(api.unarchiveSession, later)
  await assert.rejects(stale('b'), /workspace-guard-disposed/)
  assert.deepEqual(calls, [['delete', 'b'], ['unarchive', 'ordinary']])
  assert.equal(notices.length, 3)
})

const makeSearchProtection = vm.runInNewContext(compiled.slice(start, end) + '\ncreateSearchContentProtection')
test('client search excludes durable protection independently of temporary viewing grants', () => {
  const empty = { isSearchProtectionReady: true, lockedSessionIds: [], deletedSessionIds: [], lockedWorkspaceIds: [], movedSessions: {} }
  const raw = { items: [
    { workspaceId: 'a', path: '/locked', sessionIds: ['session-native', 'away'] },
    { workspaceId: 'b', path: '/ordinary', sessionIds: ['incoming', 'ordinary'] },
  ] }
  const protectedState = { ...empty, lockedSessionIds: ['direct'], deletedSessionIds: ['gone'],
    lockedWorkspaceIds: ['/locked'], movedSessions: { away: 'b', incoming: 'a' }, tempUnlockedIds: ['direct'] }
  const policy = makeSearchProtection(protectedState, () => raw)
  for (const id of ['session-direct', 'session-gone', 'native', 'away', 'incoming']) assert.equal(policy.allowsSession(id), false, id)
  assert.equal(policy.allowsSession('ordinary'), true)
  assert.equal(policy.allowsSession('not-in-list', 'a'), false)
  assert.equal(policy.allowsWorkspace('a'), false)
  assert.equal(policy.allowsWorkspace('b'), true)
  assert.equal(policy.canUseNativeFallback, false)
  const unavailable = makeSearchProtection(protectedState, () => { throw new Error('offline') })
  assert.equal(unavailable.canQuery, false)
  assert.equal(unavailable.allowsSession('ordinary'), false)
  const cold = makeSearchProtection({ ...empty, isSearchProtectionReady: false }, () => raw)
  assert.equal(cold.allowsSession('ordinary'), false)
  assert.equal(cold.allowsWorkspace('b'), false)
  assert.equal(cold.canUseNativeFallback, false)
  assert.equal(makeSearchProtection(empty, () => { throw new Error('not needed') }).canUseNativeFallback, true)
})


test('workspace mutation hooks never trust a cold or revoked Host protection snapshot', async () => {
  const calls = []
  let current = { ...mutationState, isSearchProtectionReady: false }
  const list = { getSnapshot: () => ({ items: mutationRows }) }
  const api = {
    list,
    async delete(id) { calls.push(['delete', id]); return 'deleted' },
    async unarchiveSession(id) { calls.push(['unarchive', id]); return 'unarchived' },
  }
  const messages = []
  const stop = installMutationGuards(api, list.getSnapshot, () => current, () => true,
    reason => messages.push(reason))
  try {
    await assert.rejects(api.delete('b'), /workspace-state-unavailable/)
    await assert.rejects(api.unarchiveSession('ordinary'), /workspace-state-unavailable/)
    assert.equal(calls.length, 0)
    current = { ...mutationState }
    assert.equal(await api.delete('b'), 'deleted')
    assert.equal(await api.unarchiveSession('ordinary'), 'unarchived')
    current = { ...mutationState, isSearchProtectionReady: false }
    await assert.rejects(api.delete('b'), /workspace-state-unavailable/)
    await assert.rejects(api.unarchiveSession('ordinary'), /workspace-state-unavailable/)
    assert.deepEqual(calls, [['delete', 'b'], ['unarchive', 'ordinary']])
    assert.deepEqual(messages, Array(4).fill('workspace-state-unavailable'))
  } finally { stop() }
})

test('incomplete Host refresh preserves previously confirmed durable locks and revokes mutation readiness', async () => {
  const f = fixture({ initial: { lockedSessionIds: ['locked'] } })
  await f.manager.refreshState()
  assert.equal(f.manager.isLocked('locked'), true)
  assert.equal(f.manager.getSnapshot().isSearchProtectionReady, true)
  f.env.fetch = async path => ({
    ok: true, status: 200, json: async () => path === '/api/delta-desktop/state'
      ? { state: { lockedSessionIds: [], deletedSessionIds: [] } } : {},
  })
  await f.manager.refreshState()
  assert.equal(f.manager.isLocked('locked'), true)
  assert.equal(f.manager.getSnapshot().isSearchProtectionReady, false)
  const api = { list: { getSnapshot: () => ({ items: mutationRows }) },
    async delete() { assert.fail('native destructive mutation must not run') } }
  const stop = installMutationGuards(api, api.list.getSnapshot, f.manager.getSnapshot, () => true, () => {})
  try { await assert.rejects(api.delete('b'), /workspace-state-unavailable/) }
  finally { stop() }
})

test('partial move and delete acknowledgements do not erase confirmed lock membership', async () => {
  for (const operation of ['move', 'delete', 'bulk']) {
    const f = fixture({
      initial: { lockedSessionIds: ['locked'] },
      response: { status: 200, data: { ok: true,
        ...(operation === 'bulk' ? { deletedIds: ['target'] } : {}),
        state: operation === 'move' ? { movedSessions: { target: 'b' } }
          : { deletedSessionIds: ['target'] },
      } },
    })
    const snapshot = { items: [
      { workspaceId: 'a', title: 'A', path: '/a', sessionIds: ['locked', 'target'] },
      { workspaceId: 'b', title: 'B', path: '/b', sessionIds: [] },
    ] }
    f.manager.setWorkspacesApi({ list: { getSnapshot: () => snapshot } }, () => snapshot)
    await f.manager.refreshState()
    const result = operation === 'move'
      ? await f.manager.moveSession('target', 'b')
      : operation === 'delete'
        ? await f.manager.deleteSession('target')
        : await f.manager.deleteUngroupedSessions(['target'])
    assert.equal(result.ok, false)
    assert.equal(f.manager.isLocked('locked'), true)
    assert.equal(f.manager.isDeleted('target'), false)
    assert.equal(f.manager.getSnapshot().movedSessions.target, undefined)
  }
})

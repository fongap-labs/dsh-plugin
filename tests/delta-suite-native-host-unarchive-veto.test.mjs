import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const file = path => fileURLToPath(new URL('../' + path, import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'delta-native-unarchive-guard-'))
let ops, state
try {
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n')
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'),
    '--target', 'ES2022', '--module', 'node16', '--moduleResolution', 'node16',
    '--lib', 'ES2022,DOM', '--strict', '--skipLibCheck', '--outDir', dir,
    file('packages/dsh-delta-desktop/src/host-state.ts'),
    file('packages/dsh-delta-desktop/src/host-sessions.ts')], { stdio: 'pipe' })
  ops = await import(pathToFileURL(join(dir, 'host-sessions.js')).href)
  state = await import(pathToFileURL(join(dir, 'host-state.js')).href)
} finally { rmSync(dir, { recursive: true, force: true }) }

const secret = 'JBSWY3DPEHPK3PXP'

function fixture({ initial = {}, registry, readFails = false } = {}) {
  let current = state.normalizeDeltaState(initial)
  let listener
  let releases = 0
  const routes = new Map()
  const store = {
    async read() { if (readFails) throw new Error('unreadable state'); return current },
    getCached: () => current,
    async update(mutator) { current = state.normalizeDeltaState(await mutator(current)); return current },
  }
  const hostRegistry = registry ?? {
    archivedSessionIds: ['locked', 'ordinary'],
    async unarchiveSession(id) {
      // Match the public event contract: await before updating native state.
      await listener({ sessionId: id })
      this.archivedSessionIds = this.archivedSessionIds.filter(value => value !== id)
    },
  }
  const ctx = {
    get: name => name === 'workspaceRegistry' ? hostRegistry : undefined,
    on(event, cb) {
      assert.equal(event, 'workspace/session-unarchiving')
      listener = cb
      return () => { releases += 1 }
    },
    inject(deps, mount) {
      if (deps[0] === 'connection') return mount({
        connection: { fetch: { register(spec) { routes.set(spec.path, spec.fetch); return () => routes.delete(spec.path) } } },
      })
      return () => {}
    },
  }
  const dispose = ops.installHostSessionOps(ctx, store)
  const request = async (path, body) => {
    const response = await routes.get(path)({ json: async () => body })
    return { status: response.status, data: await response.json() }
  }
  const call = body => request(ops.DELTA_SESSION_LOCK_PATH, body)
  return { store, dispose, call, request, registry: hostRegistry, event: value => listener(value), releases: () => releases }
}

test('public Host event rejects native unarchive of a directly locked session but allows other sessions', async () => {
  const f = fixture({ initial: { totpSecret: secret, lockedSessionIds: ['locked'] } })
  try {
    await assert.rejects(f.registry.unarchiveSession('locked'), /DELTA_SESSION_LOCKED/)
    assert.deepEqual(f.registry.archivedSessionIds, ['locked', 'ordinary'])
    await f.registry.unarchiveSession('ordinary')
    assert.deepEqual(f.registry.archivedSessionIds, ['locked'])
    assert.deepEqual(f.store.getCached().lockedSessionIds, ['locked'])
  } finally { f.dispose() }
})

test('verified durable unlock can pass native event without acquiring its own mutation queue', async () => {
  const f = fixture({ initial: { totpSecret: secret, lockedSessionIds: ['locked'] } })
  try {
    const result = await f.call({ action: 'unlock', sessionId: 'locked', code: await state.generateTotpCode(secret) })
    assert.equal(result.status, 200)
    assert.equal(result.data.unarchived, true)
    assert.deepEqual(f.registry.archivedSessionIds, ['ordinary'])
  } finally { f.dispose() }
})

test('unreadable state and invalid native event targets cannot authorize unarchive; dispose releases listener', async () => {
  const f = fixture({ readFails: true })
  try {
    await assert.rejects(f.event({ sessionId: 'locked' }), /unreadable state/)
    await assert.rejects(f.event({}), /DELTA_SESSION_TARGET_INVALID/)
  } finally { f.dispose(); f.dispose() }
  assert.equal(f.releases(), 1)
  await f.event({ sessionId: 'locked' })
})

test('method resolution alone is not evidence of native archive membership', async () => {
  const f = fixture({
    initial: { totpSecret: secret },
    registry: { async archiveSession() {}, async unarchiveSession() {} },
  })
  try {
    const locked = await f.call({ action: 'lock', sessionId: 'locked' })
    assert.equal(locked.data.archived, false)
    const unlocked = await f.call({ action: 'unlock', sessionId: 'locked', code: await state.generateTotpCode(secret) })
    assert.equal(unlocked.data.unarchived, false)
  } finally { f.dispose() }
})

test('corrupt state file is not an empty profile and failed read permits later recovery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'delta-state-read-'))
  const path = join(root, 'state.json')
  const previous = process.env.DELTA_DESKTOP_STATE_FILE
  process.env.DELTA_DESKTOP_STATE_FILE = path
  try {
    writeFileSync(path, '{broken')
    const store = state.createHostStateStore({})
    await assert.rejects(store.read(), SyntaxError)
    await assert.rejects(store.update(cur => ({ ...cur, lockedSessionIds: [] })), SyntaxError)
    writeFileSync(path, JSON.stringify(state.normalizeDeltaState({ totpSecret: secret, lockedSessionIds: ['locked'] })))
    assert.deepEqual((await store.read()).lockedSessionIds, ['locked'])
  } finally {
    if (previous === undefined) delete process.env.DELTA_DESKTOP_STATE_FILE
    else process.env.DELTA_DESKTOP_STATE_FILE = previous
    rmSync(root, { recursive: true, force: true })
  }
})

test('workspace lock protects the union of native membership and confirmed relocation mappings', async () => {
  const rows = [
    { id: 'protected', path: '/protected', sessionIds: ['session-native', 'moved-away'] },
    { id: 'ordinary', path: '/ordinary', sessionIds: ['ordinary', 'moved-in'] },
  ]
  const f = fixture({
    initial: {
      totpSecret: secret, lockedWorkspaceIds: ['protected'],
      movedSessions: { 'moved-away': 'ordinary', 'moved-in': 'protected' },
    },
    registry: { list: () => rows },
  })
  try {
    for (const id of ['native', 'session-native', 'moved-away', 'moved-in']) {
      await assert.rejects(f.event({ sessionId: id }), /DELTA_SESSION_LOCKED/)
      assert.equal((await f.request(ops.DELTA_SESSION_DELETE_PATH, { sessionId: id })).status, 403)
      assert.equal((await f.request(ops.DELTA_SESSION_MOVE_PATH, { sessionId: id, targetWorkspaceId: 'ordinary' })).status, 403)
    }
    const bulk = await f.request(ops.DELTA_SESSION_DELETE_UNGROUPED_PATH, { sessionIds: ['native', 'moved-in'] })
    assert.equal(bulk.status, 403)
    assert.deepEqual(bulk.data.skippedLockedIds, ['native', 'moved-in'])
    for (const destination of [
      { targetWorkspaceId: 'protected' },
      { targetWorkspaceId: 'ordinary', targetPath: '/protected' },
    ]) {
      const result = await f.request(ops.DELTA_SESSION_MOVE_PATH, { sessionId: 'ordinary', ...destination })
      assert.equal(result.status, 403)
    }
    await f.event({ sessionId: 'ordinary' })
    assert.deepEqual(f.store.getCached().deletedSessionIds, [])
    assert.deepEqual(f.store.getCached().movedSessions, { 'moved-away': 'ordinary', 'moved-in': 'protected' })
  } finally { f.dispose() }
})

test('path lock is resolved through public workspace membership, not private records', async () => {
  const f = fixture({
    initial: { totpSecret: secret, lockedWorkspaceIds: ['/protected'] },
    registry: { list: () => [
      { id: 'protected', path: '/protected', sessionIds: ['member'], record: { sessionIds: [] } },
      { id: 'ordinary', path: '/ordinary', sessionIds: [] },
    ] },
  })
  try {
    await assert.rejects(f.event({ sessionId: 'member' }), /DELTA_SESSION_LOCKED/)
    assert.equal((await f.request(ops.DELTA_SESSION_MOVE_PATH, {
      sessionId: 'other', targetWorkspaceId: 'protected',
    })).status, 403)
    const mismatch = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
      sessionId: 'other', targetWorkspaceId: 'ordinary', targetPath: '/unverified',
    })
    assert.equal(mismatch.status, 503)
    await f.event({ sessionId: 'other' })
  } finally { f.dispose() }
})

test('missing or incomplete public workspace membership blocks destructive operations before side effects', async () => {
  for (const registry of [
    {},
    { list: () => [] },
    { list: () => { throw new Error('unavailable') } },
    { list: () => [{ id: 'protected', path: '/protected', record: { sessionIds: ['member'] } }] },
  ]) {
    const f = fixture({ initial: { totpSecret: secret, lockedWorkspaceIds: ['protected'] }, registry })
    try {
      await assert.rejects(f.event({ sessionId: 'member' }), /DELTA_WORKSPACE_PROTECTION_UNAVAILABLE/)
      for (const [path, body] of [
        [ops.DELTA_SESSION_DELETE_PATH, { sessionId: 'member' }],
        [ops.DELTA_SESSION_DELETE_UNGROUPED_PATH, { sessionIds: ['member', 'other'] }],
        [ops.DELTA_SESSION_MOVE_PATH, { sessionId: 'member', targetWorkspaceId: 'ordinary' }],
      ]) {
        const result = await f.request(path, body)
        assert.equal(result.status, 503)
        assert.equal(result.data.error, 'WORKSPACE_PROTECTION_UNAVAILABLE')
      }
      assert.deepEqual(f.store.getCached().deletedSessionIds, [])
      assert.deepEqual(f.store.getCached().movedSessions, {})
    } finally { f.dispose() }
  }
})

test('direct session unlock does not unarchive a member of a still locked workspace', async () => {
  const calls = []
  const f = fixture({
    initial: { totpSecret: secret, lockedSessionIds: ['member'], lockedWorkspaceIds: ['protected'] },
    registry: {
      list: () => [{ id: 'protected', path: '/protected', sessionIds: ['member'] }],
      archivedSessionIds: ['member'],
      async unarchiveSession(id) { calls.push(id); this.archivedSessionIds = [] },
    },
  })
  try {
    const result = await f.call({ action: 'unlock', sessionId: 'member', code: await state.generateTotpCode(secret) })
    assert.equal(result.status, 200)
    assert.equal(result.data.unarchived, false)
    assert.deepEqual(calls, [])
    assert.deepEqual(result.data.state.lockedSessionIds, [])
    assert.deepEqual(result.data.state.lockedWorkspaceIds, ['protected'])
    await assert.rejects(f.event({ sessionId: 'member' }), /DELTA_SESSION_LOCKED/)
  } finally { f.dispose() }
})


test('native unarchive veto rejects tombstoned sessions and both public ID aliases', async () => {
  for (const tombstone of ['deleted', 'session-deleted']) {
    const blocked = tombstone === 'deleted' ? 'session-deleted' : 'deleted'
    const registry = {
      archivedSessionIds: [blocked, 'ordinary'],
      async unarchiveSession(id) {
        await f.event({ sessionId: id })
        this.archivedSessionIds = this.archivedSessionIds.filter(row => row !== id)
      },
    }
    const f = fixture({ initial: { deletedSessionIds: [tombstone] }, registry })
    try {
      await assert.rejects(f.event({ sessionId: blocked }), /DELTA_SESSION_DELETED/)
      await assert.rejects(registry.unarchiveSession(blocked), /DELTA_SESSION_DELETED/)
      assert.deepEqual(registry.archivedSessionIds, [blocked, 'ordinary'],
        'native archived membership stays unchanged on rejected event')
      await registry.unarchiveSession('ordinary')
      assert.deepEqual(registry.archivedSessionIds, [blocked])
      assert.deepEqual(f.store.getCached().deletedSessionIds, [tombstone])
    } finally { f.dispose() }
  }
})

test('startup tombstone reconciliation detaches native membership without any unarchive call', async () => {
  const calls = []
  const registry = {
    archivedSessionIds: ['gone'],
    unarchiveSession(id) { calls.push(['unarchive', id]); this.archivedSessionIds = [] },
    unpinSession(id) { calls.push(['unpin', id]) },
    list: () => [{ id: 'a', path: '/a', sessionIds: ['gone'],
      detachSession(id) { calls.push(['detach', id]) } }],
  }
  const f = fixture({ initial: { deletedSessionIds: ['session-gone'] }, registry })
  try {
    // Host routes share a queue with the startup reconciliation.
    assert.equal((await f.call({ action: 'not-a-mutation' })).status, 400)
    assert.equal(calls.some(([kind]) => kind === 'unarchive'), false,
      'a legacy Host without the pre-unarchive event must not resurrect a tombstone')
    assert.equal(calls.some(([kind]) => kind === 'detach'), true)
    assert.equal(calls.some(([kind]) => kind === 'unpin'), true)
    assert.deepEqual(registry.archivedSessionIds, ['gone'])
    assert.deepEqual(f.store.getCached().deletedSessionIds, ['session-gone'])
  } finally { f.dispose() }
})

test('unbinding cannot restore deleted-and-locked sessions through direct Host unarchive', async () => {
  const calls = []
  const registry = {
    archivedSessionIds: ['deleted'],
    async unarchiveSession(id) {
      calls.push(id)
      this.archivedSessionIds = []
    },
  }
  const f = fixture({
    initial: { totpSecret: secret, lockedSessionIds: ['deleted'],
      deletedSessionIds: ['session-deleted'] },
    registry,
  })
  try {
    const response = await f.call({
      action: 'unbind-2fa', code: await state.generateTotpCode(secret),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(response.data.unarchivedIds, [])
    assert.deepEqual(response.data.pendingUnarchiveIds, ['deleted'])
    assert.deepEqual(registry.archivedSessionIds, ['deleted'])
    assert.deepEqual(calls, [], 'no native unarchive is attempted for a tombstoned ID')
    assert.deepEqual(response.data.state.deletedSessionIds, ['session-deleted'])
  } finally { f.dispose() }
})

test('Host event, restoration and content search agree on deleted/locked/unknown protection precedence', async () => {
  const snapshot = state.normalizeDeltaState({
    lockedSessionIds: ['direct'], deletedSessionIds: ['session-direct', 'deleted'],
    lockedWorkspaceIds: ['missing'],
  })
  const decide = ops.readHostUnarchiveProtection(snapshot, () => undefined)
  const excluded = ops.readHostSearchExclusion(snapshot, () => undefined)
  assert.equal(decide('direct'), 'deleted')
  assert.equal(decide('session-deleted'), 'deleted')
  assert.equal(decide('other'), 'unknown')
  for (const sessionId of ['direct', 'session-direct', 'deleted', 'session-deleted', 'other']) {
    assert.equal(excluded(sessionId), decide(sessionId) !== 'clear')
  }
})

test('tombstoned aliases cannot be re-enrolled or re-locked through Host routes', async () => {
  for (const [tombstone, alias] of [
    ['deleted', 'session-deleted'],
    ['session-deleted', 'deleted'],
    ['deleted', 'session-session-deleted'],
  ]) {
    const enrolling = fixture({ initial: { deletedSessionIds: [tombstone] } })
    try {
      const begin = await enrolling.call({ action: 'setup-begin' })
      assert.equal(begin.status, 200)
      const confirm = await enrolling.call({
        action: 'setup-confirm', setupToken: begin.data.setupToken,
        sessionId: alias, code: await state.generateTotpCode(begin.data.secret),
      })
      assert.equal(confirm.status, 404)
      assert.equal(confirm.data.error, 'SESSION_DELETED')
      assert.equal(enrolling.store.getCached().totpSecret, undefined,
        'a rejected enrollment must not commit credentials')
      assert.deepEqual(enrolling.store.getCached().lockedSessionIds, [])
    } finally { enrolling.dispose() }

    const configured = fixture({ initial: { totpSecret: secret, deletedSessionIds: [tombstone] } })
    try {
      const locked = await configured.call({ action: 'lock', sessionId: alias })
      assert.equal(locked.status, 404)
      assert.equal(locked.data.error, 'SESSION_DELETED')
      assert.deepEqual(configured.store.getCached().lockedSessionIds, [])
    } finally { configured.dispose() }
  }
})

test('tombstone aliases reject move, single delete and mixed bulk delete before side effects', async () => {
  for (const [tombstone, alias] of [
    ['deleted', 'session-deleted'],
    ['session-deleted', 'deleted'],
    ['deleted', 'session-session-deleted'],
  ]) {
    const f = fixture({ initial: { deletedSessionIds: [tombstone] } })
    try {
      const before = f.store.getCached()
      for (const [path, body] of [
        [ops.DELTA_SESSION_MOVE_PATH, { sessionId: alias, targetWorkspaceId: 'ordinary' }],
        [ops.DELTA_SESSION_DELETE_PATH, { sessionId: alias }],
        [ops.DELTA_SESSION_DELETE_UNGROUPED_PATH, { sessionIds: ['ordinary', alias] }],
      ]) {
        const response = await f.request(path, body)
        assert.equal(response.status, 404)
        assert.equal(response.data.error, 'SESSION_DELETED')
        assert.deepEqual(f.store.getCached(), before,
          'mixed bulk deletion and alias mutations must not change durable state')
      }
      const ordinary = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
        sessionId: 'ordinary', targetWorkspaceId: 'ordinary',
      })
      assert.equal(ordinary.status, 200, 'unrelated native sessions remain usable')
      assert.equal(f.store.getCached().movedSessions.ordinary, 'ordinary')
      assert.deepEqual(f.store.getCached().deletedSessionIds, [tombstone])
    } finally { f.dispose() }
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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

function fixture({ initial = {}, registry, readFails = false, writeFails = false, persistence, sessions, profileContext } = {}) {
  let current = state.normalizeDeltaState(initial)
  let listener
  let releases = 0
  const routes = new Map()
  const store = {
    async read() { if (readFails) throw new Error('unreadable state'); return current },
    getCached: () => current,
    async update(mutator) {
      if (writeFails) throw new Error('durable write failed')
      current = state.normalizeDeltaState(await mutator(current))
      return current
    },
  }
  const hostRegistry = registry ?? {
    archivedSessionIds: ['locked', 'ordinary'],
    list: () => [
      { id: 'ordinary', path: '/ordinary', sessionIds: ['ordinary'] },
      { id: 'new-workspace', path: '/new', sessionIds: [] },
    ],
    async unarchiveSession(id) {
      // Match the public event contract: await before updating native state.
      await listener({ sessionId: id })
      this.archivedSessionIds = this.archivedSessionIds.filter(value => value !== id)
    },
  }
  const ctx = {
    get: name => name === 'workspaceRegistry' ? hostRegistry
      : name === 'sessionPersistence' ? persistence
        : name === 'sessions' ? sessions
          : name === 'profileContext' ? profileContext : undefined,
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

test('logical workspace moves never rewrite native session files, including on failed state writes', async () => {
  for (const writeFails of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'delta-native-move-files-'))
    const sourceDir = join(root, 'original', 'session-demo')
    const sourceFile = join(sourceDir, 'session.jsonl')
    const targetFile = join(root, 'replacement', 'session-demo', 'session.jsonl')
    const original = '{"id":"demo","cwd":"/old"}\n{"kind":"message","text":"preserve me"}\n'
    mkdirSync(sourceDir, { recursive: true })
    writeFileSync(sourceFile, original, 'utf8')
    let persistenceReads = 0
    const persistence = {
      root,
      listGenerations() {
        persistenceReads++
        return Promise.resolve([{ sessionId: 'demo', sourcePath: sourceFile }])
      },
      locate(meta) {
        persistenceReads++
        return { path: meta.cwd === '/new' ? targetFile : sourceFile }
      },
    }
    const f = fixture({ writeFails, persistence })
    try {
      const result = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
        sessionId: 'demo',
        targetWorkspaceId: 'new-workspace',
        sourceCwd: '/old',
        targetPath: '/new',
      })
      assert.equal(result.status, writeFails ? 500 : 200)
      assert.deepEqual(f.store.getCached().movedSessions,
        writeFails ? {} : { demo: 'new-workspace' })
      assert.equal(persistenceReads, 0,
        'a logical move must not invoke low-level persistence or relocation')
      assert.equal(readFileSync(sourceFile, 'utf8'), original,
        'native log header and messages are preserved byte-for-byte')
      assert.equal(existsSync(targetFile), false, 'no unowned native target log was created')
    } finally { f.dispose(); rmSync(root, { recursive: true, force: true }) }
  }
})

test('logical moves reject missing, malformed or mismatched public Host destinations', async () => {
  const valid = [
    { id: 'ordinary', path: '/ordinary', sessionIds: ['source'] },
    { id: 'target', path: '/target', sessionIds: [] },
  ]
  const invalidCases = [
    ['no public workspace list', {}, 'target', '/target'],
    ['empty catalog', { list: () => [] }, 'target', '/target'],
    ['unknown workspace id', { list: () => valid }, 'ghost', '/target'],
    ['mismatched path hint', { list: () => valid }, 'target', '/wrong'],
    ['incomplete row', { list: () => [{ id: 'target', path: '/target' }] }, 'target', '/target'],
    ['duplicate workspace ID', { list: () => [...valid, valid[1]] }, 'target', '/target'],
    ['unreadable catalog', { list: () => { throw new Error('offline') } }, 'target', '/target'],
  ]
  for (const [name, registry, targetWorkspaceId, targetPath] of invalidCases) {
    const f = fixture({ registry, initial: { movedSessions: { existing: 'ordinary' } } })
    try {
      const result = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
        sessionId: 'source', targetWorkspaceId, targetPath,
      })
      assert.equal(result.status, 503, name)
      assert.equal(result.data.error, 'WORKSPACE_DESTINATION_UNAVAILABLE', name)
      assert.deepEqual(f.store.getCached().movedSessions, { existing: 'ordinary' }, name)
    } finally { f.dispose() }
  }

  const f = fixture({ registry: { list: () => valid } })
  try {
    const result = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
      sessionId: 'source', targetWorkspaceId: 'target', targetPath: '/target',
    })
    assert.equal(result.status, 200)
    assert.deepEqual(f.store.getCached().movedSessions, { source: 'target' })
    const withoutHint = await f.request(ops.DELTA_SESSION_MOVE_PATH, {
      sessionId: 'another', targetWorkspaceId: 'target',
    })
    assert.equal(withoutHint.status, 200, 'a proven workspace ID is sufficient without a path hint')
    assert.deepEqual(f.store.getCached().movedSessions, { source: 'target', another: 'target' })
  } finally { f.dispose() }
})

test('failed tombstone writes stop all destructive Host delete actions', async () => {
  const observed = []
  const registry = {
    list: () => [{ id: 'ordinary', path: '/ordinary', sessionIds: ['one', 'two'] }],
    unarchiveSession(id) { observed.push(['unarchive', id]) },
    unpinSession(id) { observed.push(['unpin', id]) },
  }
  const sessions = { cancel(id) { observed.push(['cancel', id]) } }
  const persistence = {
    listGenerations() { observed.push(['read-generations']); return Promise.resolve([]) },
  }
  const f = fixture({
    registry, sessions, persistence, writeFails: true,
    initial: { movedSessions: { one: 'ordinary', two: 'ordinary' } },
  })
  try {
    const original = f.store.getCached()
    for (const [path, body] of [
      [ops.DELTA_SESSION_DELETE_PATH, { sessionId: 'one' }],
      [ops.DELTA_SESSION_DELETE_UNGROUPED_PATH, { sessionIds: ['one', 'two'] }],
    ]) {
      const response = await f.request(path, body)
      assert.equal(response.status, 500, 'the failure is a storage write, not a successful deletion')
      assert.deepEqual(f.store.getCached(), original,
        'failed persistence leaves the previous state visible')
      assert.deepEqual(observed, [],
        'native registry, session cancel and persistence must not run before tombstone commit')
    }
  } finally { f.dispose() }
})

test('single and bulk deletes make tombstones visible before native side effects', async () => {
  for (const bulk of [false, true]) {
    const observed = []
    let f
    const registry = {
      list: () => [{ id: 'ordinary', path: '/ordinary', sessionIds: ['free', 'locked'] }],
      archivedSessionIds: ['free'],
      unarchiveSession(id) { observed.push(['unarchive', id]) },
      unpinSession(id) {
        observed.push(['unpin', id, [...f.store.getCached().deletedSessionIds]])
      },
    }
    const sessions = {
      cancel(id) { observed.push(['cancel', id, [...f.store.getCached().deletedSessionIds]]) },
    }
    f = fixture({
      registry, sessions,
      initial: {
        lockedSessionIds: bulk ? ['locked'] : [],
        movedSessions: { free: 'ordinary', locked: 'ordinary' },
      },
    })
    try {
      const result = await f.request(
        bulk ? ops.DELTA_SESSION_DELETE_UNGROUPED_PATH : ops.DELTA_SESSION_DELETE_PATH,
        bulk ? { sessionIds: ['free', 'locked'] } : { sessionId: 'free' },
      )
      assert.equal(result.status, 200)
      assert.deepEqual(f.store.getCached().deletedSessionIds, ['free'])
      assert.equal(Object.hasOwn(f.store.getCached().movedSessions, 'free'), false)
      assert.equal(f.store.getCached().movedSessions.locked, 'ordinary')
      assert.equal(observed.some(([kind]) => kind === 'unarchive'), false,
        'deleting a tombstoned session must never invoke legacy unarchive')
      const cancels = observed.filter(([kind]) => kind === 'cancel')
      assert.equal(cancels.length, 1)
      assert.deepEqual(cancels[0], ['cancel', 'free', ['free']])
      assert.ok(observed.some(([kind, , tombstones]) =>
        kind === 'unpin' && tombstones.includes('free')))
      assert.equal(observed.some(([, sid]) => sid === 'locked'), false,
        'protected members are not part of the durable delete batch')
      if (bulk) assert.deepEqual(result.data.skippedLockedIds, ['locked'])
    } finally { f.dispose() }
  }
})

test('late workspaceRegistry injection replays durable tombstones without reviving native sessions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'delta-late-registry-'))
  let liveRegistry
  let mountRegistry
  let current = state.normalizeDeltaState({
    deletedSessionIds: ['session-gone'], lockedSessionIds: ['locked'],
  })
  const routes = new Map()
  const calls = []
  const makeRegistry = label => ({
    archivedSessionIds: [],
    list() {
      return [{ id: 'workspace', path: '/workspace', sessionIds: ['gone', 'locked'],
        detachSession(id) { calls.push([label, 'detach', id]) } }]
    },
    unpinSession(id) { calls.push([label, 'unpin', id]) },
    unarchiveSession(id) { calls.push([label, 'unarchive', id]) },
    archiveSession(id) {
      calls.push([label, 'archive', id])
      this.archivedSessionIds.push(id)
    },
  })
  const ctx = {
    get(name) {
      if (name === 'workspaceRegistry') return liveRegistry
      if (name === 'profileContext') return { home }
      if (name === 'sessionPersistence') return { root: join(home, 'sessions') }
      return undefined
    },
    inject(deps, callback) {
      if (deps[0] === 'workspaceRegistry') {
        mountRegistry = callback
        return () => {}
      }
      if (deps[0] === 'connection') {
        return callback({ connection: { fetch: { register(spec) {
          routes.set(spec.path, spec.fetch)
          return () => routes.delete(spec.path)
        } } } })
      }
      return () => {}
    },
  }
  const store = {
    read: async () => current,
    getCached: () => current,
    update: async mutator => {
      current = state.normalizeDeltaState(await mutator(current))
      return current
    },
  }
  const stop = ops.installHostSessionOps(ctx, store)
  const flush = async () => {
    const response = await routes.get(ops.DELTA_SESSION_LOCK_PATH)({
      json: async () => ({ action: 'noop' }),
    })
    assert.equal(response.status, 400)
  }
  try {
    await flush()
    assert.deepEqual(calls, [], 'startup cannot detach before registry is injected')

    const stale = makeRegistry('stale')
    liveRegistry = stale
    const disposeStale = mountRegistry({ workspaceRegistry: stale })
    disposeStale()
    liveRegistry = undefined

    const active = makeRegistry('active')
    liveRegistry = active
    const disposeActive = mountRegistry({ workspaceRegistry: active })
    await flush()
    assert.equal(calls.some(([label]) => label === 'stale'), false,
      'a detached registry callback must not mutate a replaced service')
    assert.ok(calls.some(([label, action, id]) =>
      label === 'active' && action === 'detach' && id === 'gone'))
    assert.ok(calls.some(([label, action, id]) =>
      label === 'active' && action === 'unpin' && id === 'session-gone'))
    assert.ok(calls.some(([label, action, id]) =>
      label === 'active' && action === 'archive' && id === 'locked'))
    assert.equal(calls.some(([, action]) => action === 'unarchive'), false)
    assert.deepEqual(current.deletedSessionIds, ['session-gone'],
      'recovery retains the durable tombstone')

    disposeActive()
    liveRegistry = undefined
    const remounted = makeRegistry('remounted')
    liveRegistry = remounted
    const disposeRemounted = mountRegistry({ workspaceRegistry: remounted })
    await flush()
    assert.ok(calls.some(([label, action, id]) =>
      label === 'remounted' && action === 'detach' && id === 'gone'),
    'a new native service instance receives the existing tombstone')
    disposeRemounted()

    stop()
    const afterDispose = makeRegistry('disposed')
    liveRegistry = afterDispose
    mountRegistry({ workspaceRegistry: afterDispose })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls.some(([label]) => label === 'disposed'), false,
      'disposed plugins must not replay against a late native registry')
  } finally {
    stop()
    rmSync(home, { recursive: true, force: true })
  }
})

test('disposal during the startup state read prevents subsequent native reconciliation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'delta-disposed-recovery-'))
  const observed = []
  let notifyRead
  let finishRead
  const reading = new Promise(resolve => { notifyRead = resolve })
  const pending = new Promise(resolve => { finishRead = resolve })
  const store = {
    async read() {
      notifyRead()
      await pending
      return {
        get deletedSessionIds() { observed.push('enumerate deleted'); return ['gone'] },
        get lockedSessionIds() { observed.push('enumerate locked'); return ['locked'] },
      }
    },
  }
  const registry = {
    unpinSession(id) { observed.push(['unpin', id]) },
    archiveSession(id) { observed.push(['archive', id]) },
  }
  const ctx = {
    get(name) {
      if (name === 'workspaceRegistry') return registry
      if (name === 'profileContext') return { home }
      if (name === 'sessionPersistence') { observed.push('read persistence'); return { root: join(home, 'sessions') } }
      return undefined
    },
    inject() { return () => {} },
  }
  const stop = ops.installHostSessionOps(ctx, store)
  try {
    await reading
    stop()
    finishRead()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(observed, [],
      'a disposed plugin must not inspect tombstones or begin native cleanup after read finishes')
  } finally {
    stop()
    finishRead()
    rmSync(home, { recursive: true, force: true })
  }
})

test('stale connection routes reject state reads and folder requests after plugin disposal', async () => {
  const registered = new Map()
  let reads = 0
  const current = state.normalizeDeltaState({ lockedSessionIds: ['locked'] })
  const store = {
    async read() { reads++; return current },
    getCached: () => current,
    async update(mutator) { return state.normalizeDeltaState(await mutator(current)) },
  }
  const ctx = {
    get() { return undefined },
    inject(deps, callback) {
      if (deps[0] === 'connection') return callback({
        connection: { fetch: { register(route) {
          registered.set(route.path, route.fetch)
          return () => registered.delete(route.path)
        } } },
      })
      return () => {}
    },
  }
  const stop = ops.installHostSessionOps(ctx, store)
  const stateRoute = registered.get(ops.DELTA_STATE_PATH)
  const folderRoute = registered.get(ops.DELTA_OPEN_FOLDER_PATH)
  try {
    assert.equal((await stateRoute()).status, 200)
    assert.equal((await folderRoute({ json: async () => ({ path: '' }) })).status, 400)
    stop()
    const readsBeforeStaleCall = reads
    const staleState = await stateRoute()
    const staleFolder = await folderRoute({ json: async () => ({ path: '' }) })
    assert.equal(staleState.status, 503)
    assert.equal((await staleState.json()).error, 'SESSION_OPS_UNAVAILABLE')
    assert.equal(staleFolder.status, 503)
    assert.equal((await staleFolder.json()).error, 'SESSION_OPS_UNAVAILABLE')
    assert.equal(reads, readsBeforeStaleCall, 'no additional durable state reads after disposal')
  } finally { stop() }
})

test('stale webServer fallback routes also fail closed after plugin disposal', async () => {
  const registered = new Map()
  const current = state.normalizeDeltaState(undefined)
  const store = {
    read: async () => current,
    getCached: () => current,
    update: async mutator => state.normalizeDeltaState(await mutator(current)),
  }
  const ctx = {
    get() { return undefined },
    inject(deps, callback) {
      if (deps[0] === 'webServer') return callback({
        webServer: { register(route) {
          registered.set(route.path, route.handler)
          return () => registered.delete(route.path)
        } },
      })
      return () => {}
    },
  }
  const stop = ops.installHostSessionOps(ctx, store)
  const stateRoute = registered.get(ops.DELTA_STATE_PATH)
  const folderRoute = registered.get(ops.DELTA_OPEN_FOLDER_PATH)
  const invoke = async handler => {
    let status
    let payload
    await handler({ json: async () => ({ path: '' }) }, {
      writeHead(value) { status = value },
      end(value) { payload = JSON.parse(value) },
    })
    return { status, payload }
  }
  try {
    assert.equal((await invoke(stateRoute)).status, 200)
    assert.equal((await invoke(folderRoute)).status, 400)
    stop()
    assert.deepEqual(await invoke(stateRoute), {
      status: 503, payload: { ok: false, error: 'SESSION_OPS_UNAVAILABLE' },
    })
    assert.deepEqual(await invoke(folderRoute), {
      status: 503, payload: { ok: false, error: 'SESSION_OPS_UNAVAILABLE' },
    })
  } finally { stop() }
})

test('late Host dependency injection after disposal does not re-register any routes', async () => {
  const callbacks = new Map()
  const registered = []
  const store = {
    read: async () => state.normalizeDeltaState(undefined),
    getCached: () => state.normalizeDeltaState(undefined),
    update: async mutator => state.normalizeDeltaState(await mutator(state.normalizeDeltaState(undefined))),
  }
  const stop = ops.installHostSessionOps({
    get() { return undefined },
    inject(deps, callback) {
      callbacks.set(deps[0], callback)
      return () => {}
    },
  }, store)
  try {
    stop()
    const connCleanup = callbacks.get('connection')({
      connection: { fetch: { register(spec) {
        registered.push(['connection', spec.path])
        return () => {}
      } } },
    })
    const webCleanup = callbacks.get('webServer')({
      webServer: { register(spec) {
        registered.push(['webServer', spec.path])
        return () => {}
      } },
    })
    const registryCleanup = callbacks.get('workspaceRegistry')({ workspaceRegistry: {
      archiveSession() { registered.push(['registry', 'archive']) },
    } })
    connCleanup?.()
    webCleanup?.()
    registryCleanup?.()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(registered, [],
      'Host services mounted after Delta shutdown must not re-register stale endpoints')
  } finally { stop() }
})

test('session artifact cleanup checks real paths and refuses linked directories outside the Host root', async t => {
  const home = mkdtempSync(join(tmpdir(), 'delta-cleanup-realpath-'))
  const root = join(home, 'sessions')
  const normalDir = join(root, '..project', 'victim')
  const normalFile = join(normalDir, 'session.jsonl')
  const externalDir = join(home, 'outside', 'victim')
  const externalFile = join(externalDir, 'session.jsonl')
  const linkParent = join(root, 'linked')
  const linkedFile = join(linkParent, 'victim', 'session.jsonl')
  mkdirSync(normalDir, { recursive: true })
  mkdirSync(externalDir, { recursive: true })
  writeFileSync(normalFile, 'native session under safe root', 'utf8')
  writeFileSync(externalFile, 'unrelated external session - do not touch', 'utf8')

  let linked = false
  try {
    try {
      symlinkSync(join(home, 'outside'), linkParent,
        process.platform === 'win32' ? 'junction' : 'dir')
      linked = true
    } catch (err) {
      if (!['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(err?.code)) throw err
      t.diagnostic('Host OS does not permit test directory links; normal containment is still checked')
    }

    const generations = [{ sessionId: 'victim', sourcePath: normalFile },
      { sessionId: 'victim', sourcePath: externalFile }]
    if (linked) generations.push({ sessionId: 'victim', sourcePath: linkedFile })
    const f = fixture({
      profileContext: { home },
      persistence: { root, listGenerations: async () => generations },
    })
    try {
      const response = await f.request(ops.DELTA_SESSION_DELETE_PATH, { sessionId: 'victim' })
      assert.equal(response.status, 200)
      assert.deepEqual(f.store.getCached().deletedSessionIds, ['victim'])
      assert.equal(existsSync(normalDir), false,
        'ordinary artifacts inside a project named ..project must still be deleted')
      assert.equal(readFileSync(externalFile, 'utf8'),
        'unrelated external session - do not touch',
        'external files must survive direct and symlinked persistence paths')
    } finally { f.dispose() }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('project-cache cleanup removes in-profile aliases but never follows a linked cache directory outside DSH_HOME', async t => {
  const home = mkdtempSync(join(tmpdir(), 'delta-project-cache-root-'))
  const outside = mkdtempSync(join(tmpdir(), 'delta-project-cache-outside-'))
  const cacheParent = join(home, 'storages', 'session_projcache')
  const cacheDir = join(cacheParent, 'sessions')
  try {
    mkdirSync(cacheDir, { recursive: true })
    for (const name of ['victim.json', 'session-victim.json']) {
      writeFileSync(join(cacheDir, name), 'in-profile cache', 'utf8')
    }
    const normal = fixture({ profileContext: { home } })
    try {
      const result = await normal.request(ops.DELTA_SESSION_DELETE_PATH, { sessionId: 'victim' })
      assert.equal(result.status, 200)
      assert.equal(existsSync(join(cacheDir, 'victim.json')), false)
      assert.equal(existsSync(join(cacheDir, 'session-victim.json')), false)
    } finally { normal.dispose() }

    rmSync(cacheDir, { recursive: true, force: true })
    writeFileSync(join(outside, 'victim.json'), 'outside cache belongs to another owner', 'utf8')
    writeFileSync(join(outside, 'session-victim.json'), 'second outside cache', 'utf8')
    try {
      symlinkSync(outside, cacheDir, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) throw error
      t.diagnostic('Host OS does not allow cache directory symlinks; in-profile cleanup was verified')
      return
    }

    const linked = fixture({ profileContext: { home } })
    try {
      const result = await linked.request(ops.DELTA_SESSION_DELETE_PATH, { sessionId: 'victim' })
      assert.equal(result.status, 200)
      assert.deepEqual(linked.store.getCached().deletedSessionIds, ['victim'],
        'the durable tombstone is retained even when unsafe cache cleanup is rejected')
      assert.equal(readFileSync(join(outside, 'victim.json'), 'utf8'),
        'outside cache belongs to another owner')
      assert.equal(readFileSync(join(outside, 'session-victim.json'), 'utf8'),
        'second outside cache')
    } finally { linked.dispose() }
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})

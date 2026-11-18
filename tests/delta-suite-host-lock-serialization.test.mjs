import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const file = name => fileURLToPath(new URL('../' + name, import.meta.url))
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-host-lock-'))
let ops, state
try {
  execFileSync(process.execPath, [file('node_modules/typescript/bin/tsc'), '-p',
    file('packages/dsh-delta-desktop/tsconfig.json'), '--outDir', dir], { stdio: 'pipe' })
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  ops = await import(pathToFileURL(path.join(dir, 'host-sessions.js')).href)
  state = await import(pathToFileURL(path.join(dir, 'host-state.js')).href)
} finally { await fs.rm(dir, { recursive: true, force: true }) }

const secret = 'JBSWY3DPEHPK3PXP'
function fixture(initial = {}, registry = {}) {
  let current = state.normalizeDeltaState(initial)
  const routes = new Map()
  const store = {
    read: async () => current,
    getCached: () => current,
    update: async fn => { current = state.normalizeDeltaState(await fn(current)); return current },
  }
  const dispose = ops.installHostSessionOps({
    get: name => name === 'workspaceRegistry' ? registry : undefined,
    inject(deps, callback) {
      if (deps[0] === 'connection') return callback({
        connection: { fetch: { register(spec) {
          routes.set(spec.path, spec.fetch)
          return () => routes.delete(spec.path)
        } } },
      })
      return () => {}
    },
  }, store)
  const route = routes.get(ops.DELTA_SESSION_LOCK_PATH)
  const call = async body => {
    const response = await route({ body })
    return { status: response.status, data: await response.json() }
  }
  return { call, store, dispose, registry }
}

test('concurrent enrollments cannot replace credentials or a confirmed lock', async () => {
  const f = fixture()
  try {
    const a = (await f.call({ action: 'setup-begin' })).data
    const b = (await f.call({ action: 'setup-begin' })).data
    const [one, two] = await Promise.all([
      f.call({ action: 'setup-confirm', sessionId: 'first', setupToken: a.setupToken, code: await state.generateTotpCode(a.secret) }),
      f.call({ action: 'setup-confirm', sessionId: 'second', setupToken: b.setupToken, code: await state.generateTotpCode(b.secret) }),
    ])
    assert.equal(one.status, 200)
    assert.equal(two.status, 409)
    assert.equal((await f.store.read()).totpSecret, a.secret)
    assert.deepEqual((await f.store.read()).lockedSessionIds, ['first'])
  } finally { f.dispose() }
})

test('configured legacy PIN prevents unauthenticated enrollment; missing credentials cannot verify', async () => {
  const legacy = fixture({ pinHash: { salt: 'test', hash: 'test' } })
  const empty = fixture()
  try {
    assert.equal((await legacy.call({ action: 'setup-begin' })).status, 409)
    assert.equal((await empty.call({ action: 'verify', sessionId: 'a', code: '123456' })).status, 403)
    assert.equal((await empty.call({ action: 'unbind-2fa', code: '123456' })).status, 403)
  } finally { legacy.dispose(); empty.dispose() }
})

test('archive refusal preserves durable lock and never forces activity to stop', async () => {
  const calls = []
  const f = fixture({ totpSecret: secret }, {
    archivedSessionIds: [],
    async archiveSession(id, options) { calls.push([id, options]); throw new Error('active') },
  })
  try {
    const locked = await f.call({ action: 'lock', sessionId: 'a' })
    assert.equal(locked.data.ok, true)
    assert.equal(locked.data.archived, false)
    assert.deepEqual(locked.data.state.lockedSessionIds, ['a'])
    assert.deepEqual(calls, [['a', {}]])
  } finally { f.dispose() }
})

test('lock and unlock effects are serialized and report actual archive membership', async () => {
  let begin, release
  const started = new Promise(resolve => { begin = resolve })
  const barrier = new Promise(resolve => { release = resolve })
  const registry = {
    archivedSessionIds: [],
    async archiveSession(id) { begin(); await barrier; this.archivedSessionIds.push(id) },
    async unarchiveSession(id) { this.archivedSessionIds = this.archivedSessionIds.filter(x => x !== id) },
  }
  const f = fixture({ totpSecret: secret }, registry)
  try {
    const code = await state.generateTotpCode(secret)
    const lock = f.call({ action: 'lock', sessionId: 'a' })
    await started
    const unlock = f.call({ action: 'unlock', sessionId: 'a', code })
    await Promise.resolve()
    assert.deepEqual((await f.store.read()).lockedSessionIds, ['a'])
    release()
    assert.equal((await lock).data.archived, true)
    assert.equal((await unlock).data.unarchived, true)
    assert.deepEqual(registry.archivedSessionIds, [])
    assert.deepEqual((await f.store.read()).lockedSessionIds, [])
  } finally { release(); f.dispose() }
})

test('unbind separates confirmed and pending restoration', async () => {
  const registry = {
    archivedSessionIds: ['a', 'b'],
    async unarchiveSession(id) {
      if (id === 'b') throw new Error('offline')
      this.archivedSessionIds = this.archivedSessionIds.filter(x => x !== id)
    },
  }
  const f = fixture({ totpSecret: secret, lockedSessionIds: ['a', 'b'] }, registry)
  try {
    const result = await f.call({ action: 'unbind-2fa', code: await state.generateTotpCode(secret) })
    assert.equal(result.data.ok, true)
    assert.equal(result.data.state.hasPin, false)
    assert.deepEqual(result.data.unarchivedIds, ['a'])
    assert.deepEqual(result.data.pendingUnarchiveIds, ['b'])
  } finally { f.dispose() }
})

test('failed durable write does not publish an in-memory lock change', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'delta-host-durable-'))
  const previous = process.env.DELTA_DESKTOP_STATE_FILE
  try {
    const filePath = path.join(home, 'state.json')
    process.env.DELTA_DESKTOP_STATE_FILE = filePath
    const store = state.createHostStateStore({})
    await store.update(cur => ({ ...cur, totpSecret: secret, lockedSessionIds: ['a'] }))
    const committed = store.getCached()
    await fs.rm(filePath)
    await fs.mkdir(filePath)
    await assert.rejects(store.update(cur => ({ ...cur, lockedSessionIds: [] })))
    assert.equal(store.getCached(), committed)
    assert.deepEqual((await store.read()).lockedSessionIds, ['a'])
    await fs.rmdir(filePath)
    await store.update(cur => ({ ...cur, lockedSessionIds: ['b'] }))
    assert.deepEqual((await store.read()).lockedSessionIds, ['b'])
  } finally {
    if (previous === undefined) delete process.env.DELTA_DESKTOP_STATE_FILE
    else process.env.DELTA_DESKTOP_STATE_FILE = previous
    await fs.rm(home, { recursive: true, force: true })
  }
})

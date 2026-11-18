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
  const call = async body => {
    const response = await routes.get(ops.DELTA_SESSION_LOCK_PATH)({ json: async () => body })
    return { status: response.status, data: await response.json() }
  }
  return { store, dispose, call, registry: hostRegistry, event: request => listener(request), releases: () => releases }
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

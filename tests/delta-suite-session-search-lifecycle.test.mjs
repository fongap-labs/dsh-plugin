import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'delta-search-lifecycle-'))
let installHostSessionSearch, readHostSearchExclusion
try {
  execFileSync(process.execPath, [
    fixture('node_modules/typescript/bin/tsc'),
    fixture('packages/dsh-delta-desktop/src/host-search.ts'),
    fixture('packages/dsh-delta-desktop/src/host-sessions.ts'),
    '--target', 'ES2022', '--module', 'node16', '--moduleResolution', 'node16',
    '--outDir', temp, '--strict', '--skipLibCheck',
  ], { stdio: 'pipe' })
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}\n')
  ;({ installHostSessionSearch } = await import(pathToFileURL(join(temp, 'host-search.js')).href))
  ;({ readHostSearchExclusion } = await import(pathToFileURL(join(temp, 'host-sessions.js')).href))
} finally {
  rmSync(temp, { recursive: true, force: true })
}

const searchUrl = 'http://localhost/api/delta-desktop/session-search?q=needle'
const makeLease = (released) => ({
  events: [{
    type: 'user/message',
    payload: { source: { kind: 'user' }, content: [{ type: 'text', text: 'needle in a private conversation' }] },
  }],
  dispose() { released.push('legacy') },
  [Symbol.dispose]() { released.push('symbol') },
})

function harness(observeSession, ids = ['session-1']) {
  let request
  let unregisters = 0
  let observations = 0
  const updatedAt = Date.now()
  const query = {
    listSessions: async () => ids.map(id => ({ header: { id, title: 'Session', updatedAt } })),
    async observeSession(...args) { observations++; return observeSession(...args) },
  }
  const ctx = {
    get(name) { return name === 'sessionQuery' ? query : undefined },
    inject(deps, register) {
      assert.deepEqual(deps, ['connection'])
      return register({
        connection: { fetch: { register(spec) {
          request = spec.fetch
          return () => { unregisters++ }
        } } },
      })
    },
  }
  return {
    ctx,
    request: data => request({ url: data ?? searchUrl }),
    get observations() { return observations },
    get unregisters() { return unregisters },
  }
}

test('observation lease with both disposal APIs is released exactly once', async () => {
  const released = []
  const state = harness(async () => makeLease(released))
  const stop = installHostSessionSearch(state.ctx)
  const payload = await (await state.request()).json()
  assert.equal(payload.items.length, 1)
  assert.equal(payload.items[0].sessionId, 'session-1')
  assert.deepEqual(released, ['symbol'])
  stop()
  stop()
  assert.equal(state.unregisters, 1)
})

test('pending observation cannot restore cache or results after plugin disposal', async () => {
  const released = []
  let completeObservation
  let notifyStarted
  const started = new Promise(resolve => { notifyStarted = resolve })
  const pendingLease = new Promise(resolve => { completeObservation = resolve })
  const state = harness(async () => {
    notifyStarted()
    return pendingLease
  })
  const stop = installHostSessionSearch(state.ctx)
  const pendingRequest = state.request()
  await started
  stop()
  stop()
  completeObservation(makeLease(released))
  const payload = await (await pendingRequest).json()
  assert.deepEqual(payload.items, [])
  assert.equal(payload.redacted, true)
  assert.deepEqual(released, ['symbol'], 'leased session must still be released')
  assert.equal(state.unregisters, 1)
  const again = await (await state.request()).json()
  assert.deepEqual(again.items, [], 'stale route cannot perform queries after teardown')
  assert.equal(state.observations, 1, 'no query or cache refill is permitted after teardown')
})

const emptyProtection = { lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {} }

test('cold protection read failure prevents search enumeration and observation', async () => {
  const released = []
  const state = harness(async () => makeLease(released))
  let attempts = 0
  const stop = installHostSessionSearch(state.ctx, { prepareExclusion: async () => {
    attempts += 1
    if (attempts === 1) throw new Error('unreadable protection state')
  } })
  try {
    assert.deepEqual((await (await state.request()).json()).items, [])
    assert.equal(state.observations, 0)
    assert.equal((await (await state.request()).json()).items.length, 1)
  } finally { stop() }
})

test('shared Host protection excludes aliases, deleted rows, native and moved workspace members', () => {
  const state = {
    ...emptyProtection, lockedSessionIds: ['direct'], deletedSessionIds: ['gone'],
    lockedWorkspaceIds: ['/locked'], movedSessions: { incoming: 'a', away: 'b' },
  }
  const registry = { list: () => [
    { id: 'a', path: '/locked', sessionIds: ['session-native', 'away'] },
    { id: 'b', path: '/ordinary', sessionIds: ['incoming', 'ordinary'] },
  ] }
  const excluded = readHostSearchExclusion(state, () => registry)
  for (const id of ['session-direct', 'session-gone', 'native', 'away', 'incoming']) assert.equal(excluded(id), true, id)
  assert.equal(excluded('ordinary'), false)
  assert.equal(readHostSearchExclusion(state, () => undefined)('ordinary'), true)
  assert.equal(readHostSearchExclusion(emptyProtection, () => undefined)('ordinary'), false)
})

test('tombstone and native unarchive use identical search exclusion for raw and prefixed IDs', () => {
  const state = { ...emptyProtection, deletedSessionIds: ['session-gone'] }
  const excluded = readHostSearchExclusion(state, () => undefined)
  assert.equal(excluded('gone'), true)
  assert.equal(excluded('session-gone'), true)
  assert.equal(excluded('ordinary'), false)
})

test('new protection during an observation suppresses text, title and cache writes', async () => {
  const released = []
  let resolveLease, began
  const started = new Promise(resolve => { began = resolve })
  let protection = emptyProtection
  let reads = 0
  const state = harness(async () => {
    reads += 1
    if (reads !== 1) return makeLease(released)
    began()
    return new Promise(resolve => { resolveLease = resolve })
  })
  const stop = installHostSessionSearch(state.ctx, {
    readExclusion: () => readHostSearchExclusion(protection, () => undefined),
  })
  try {
    const pending = state.request('http://localhost/?q=Session')
    await started
    protection = { ...emptyProtection, lockedSessionIds: ['1'] }
    resolveLease(makeLease(released))
    assert.deepEqual((await (await pending).json()).items, [])
    assert.deepEqual(released, ['symbol'])
    protection = emptyProtection
    assert.equal((await (await state.request()).json()).items.length, 1)
    assert.equal(state.observations, 2, 'no corpus was cached for the protected observation')
  } finally { stop() }
})

test('response-time exclusion filters previously scored hits and evicts cached content', async () => {
  const released = []
  let protection = emptyProtection
  const state = harness(async id => {
    if (id === 'second') protection = { ...emptyProtection, lockedSessionIds: ['first'] }
    return makeLease(released)
  }, ['first', 'second'])
  const stop = installHostSessionSearch(state.ctx, {
    readExclusion: () => readHostSearchExclusion(protection, () => undefined),
  })
  try {
    const payload = await (await state.request()).json()
    assert.deepEqual(payload.items.map(hit => hit.sessionId), ['second'])
    protection = emptyProtection
    // Both rows were previously observed; only the evicted first row is observed again.
    assert.equal((await (await state.request()).json()).items.length, 2)
    assert.equal(state.observations, 3)
  } finally { stop() }
})

test('a failing exclusion callback cannot leak a matching title or body', async () => {
  const state = harness(async () => makeLease([]))
  const stop = installHostSessionSearch(state.ctx, { readExclusion: () => () => { throw new Error('policy failure') } })
  try {
    const payload = await (await state.request('http://localhost/?q=Session')).json()
    assert.deepEqual(payload.items, [])
    assert.equal(state.observations, 0)
  } finally { stop() }
})

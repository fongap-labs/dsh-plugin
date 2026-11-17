import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'delta-search-lifecycle-'))
let installHostSessionSearch
try {
  execFileSync(process.execPath, [
    fixture('node_modules/typescript/bin/tsc'),
    fixture('packages/dsh-delta-desktop/src/host-search.ts'),
    '--target', 'ES2022', '--module', 'node16', '--moduleResolution', 'node16',
    '--outDir', temp, '--strict', '--skipLibCheck',
  ], { stdio: 'pipe' })
  writeFileSync(join(temp, 'package.json'), '{"type":"module"}\n')
  ;({ installHostSessionSearch } = await import(pathToFileURL(join(temp, 'host-search.js')).href))
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

function harness(observeSession) {
  let request
  let unregisters = 0
  let observations = 0
  const query = {
    listSessions: async () => [{ header: { id: 'session-1', title: 'Session', updatedAt: Date.now() } }],
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

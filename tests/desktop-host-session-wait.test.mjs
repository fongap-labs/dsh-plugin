import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')

test('Desktop advertises and forwards the official session/wait operation', () => {
  assert.match(rust, /"sessions\.wait"/)
  assert.match(rust, /"session\/wait"/)
  assert.match(rust, /Duration::from_secs\(24 \* 60 \* 60\)/)
  assert.match(rust, /wait_session,/)
  assert.match(rust, /tauri::async_runtime::spawn_blocking/)
  assert.match(client, /waitForCompletion:[\s\S]*?callHost<void>\('wait_session'/)
  assert.match(client, /Harness RPC error \(/)
  assert.match(client, /new DesktopHostError\('runtime_error', message, false, false\)/)
})

test('root idle does not end the UI wait while managed descendants are pending', () => {
  assert.match(app, /pendingWaitCountsRef\.current\.has\(status\.sessionId\)/)
  assert.doesNotMatch(app, /pendingWaitSessionIdsRef/,
    'the previous Set must not remain beside the per-session wait counter')
  assert.match(app, /markPendingSessionWait\(pendingWaitCountsRef\.current, sendingSessionId\)/)
  assert.match(app, /settlePendingSessionWait\(pendingWaitCountsRef\.current, sendingSessionId\)/)
  assert.match(app, /await desktopHost\.waitForCompletion\(sendingSessionId\)/)
  assert.match(app, /const isKnownRuntimeFailure = error instanceof DesktopHostError && !error.outcomeUnknown/)
  assert.match(app, /const outcomeUnknown = error instanceof DesktopHostError \? error.outcomeUnknown : true/)

  const promptIndex = app.indexOf('await desktopHost.query(sendingSessionId, contentBlocks)')
  const readyIndex = app.indexOf('setReadySessionIds(current => new Set(current).add(sendingSessionId))', promptIndex)
  const waitIndex = app.indexOf('await desktopHost.waitForCompletion(sendingSessionId)', promptIndex)
  assert.ok(promptIndex >= 0 && readyIndex > promptIndex && waitIndex > readyIndex,
    'an accepted prompt must mark the session ready before waiting for its descendants')
  assert.match(app, /counts\.set\(sessionId, \(counts\.get\(sessionId\) \?\? 0\) \+ 1\)/,
    'concurrent sends must keep an independent pending-wait count')
  assert.match(app, /else counts\.set\(sessionId, count - 1\)/,
    'each completed wait must decrement without clearing another wait')
  assert.match(app, /setIsSending\(pendingWaitCountsRef\.current\.has\(session\.id\)\)/,
    'switching back to a session with an outstanding wait must restore its running state')
})

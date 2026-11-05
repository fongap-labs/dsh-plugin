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
  assert.match(app, /pendingWaitSessionIdsRef\.current\.has\(status\.sessionId\)/)
  assert.match(app, /await desktopHost\.waitForCompletion\(sendingSessionId\)/)
  assert.match(app, /const outcomeUnknown = hasAcceptedPrompt \|\|/)
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')
const host = read('../packages/dsh-desktop-delta/HOST_API.md')
const proposal = read('../packages/dsh-desktop-delta/WORKSPACE_FILES_API_PROPOSAL.md')

test('the Desktop Host reads the SDK working directory', () => {
  assert.match(rust, /fn get_working_directory\(/)
  assert.match(rust, /"session\/working-directory\/get"/)
  assert.match(rust, /get_working_directory,/)
  assert.match(client, /getWorkingDirectory:[\s\S]*?callHost<string>\('get_working_directory'/)
  assert.match(client, /capability: 'workspace\.cwd'/)
})

test('renderer reads known sessions and discards stale directory replies', () => {
  assert.match(app, /refreshKnownWorkingDirectory\(sessionId\)/)
  assert.match(app, /refreshKnownWorkingDirectory\(session\.id\)/)
  assert.match(app, /refreshKnownWorkingDirectory\(sendingSessionId\)/)
  assert.match(app, /readEpoch !== cwdReadEpochRef\.current/)
  assert.match(app, /activeSessionIdRef\.current !== knownSessionId/)
  assert.match(app, /desktopHostStatus\.getSnapshot\(\)\.state !== 'ready'/)
  assert.match(app, /setHostWorkingDirectory\(\{ sessionId, cwd: actualPath \}\)/)
})

test('unavailable workspace and file APIs are not falsely advertised', () => {
  const match = rust.match(/let mut capabilities = vec!\[([\s\S]*?)\]/)
  assert.ok(match)
  const caps = [...match[1].matchAll(/"([^"]+)"/g)].map(item => item[1])
  assert.ok(caps.includes('workspace.cwd'))
  assert.match(rust, /capabilities\.push\("workspace\.files"\)/)
  assert.match(rust, /if state\.workspace_root\.lock\(\)/)
  for (const missing of ['workspace.list', 'workspace.files.list', 'workspace.files.read']) {
    assert.equal(caps.includes(missing), false, missing)
  }
  assert.match(host, /\]\(WORKSPACE_FILES_API_PROPOSAL\.md\)/)
  assert.match(proposal, /@deepseek-ai\/dsh-api-workspace-controller/)
  assert.match(proposal, /@deepseek-ai\/dsh-api-workspace-files/)
  assert.match(proposal, /expectedVersion/)
  assert.match(proposal, /truncated/)
})

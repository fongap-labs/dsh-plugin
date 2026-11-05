import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const host = read('../packages/dsh-desktop-delta/HOST_API.md')
const readme = read('../packages/dsh-desktop-delta/README.md')
const proposal = read('../packages/dsh-desktop-delta/SESSION_DIRECTORY_API_PROPOSAL.md')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')

test('the Tauri handshake only advertises implemented SDK capabilities', () => {
  const handshake = rust.match(/let mut capabilities = vec!\[([\s\S]*?)\]/)
  assert.ok(handshake, 'the Tauri handshake must include a capability list')
  const capabilities = [...handshake[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
  assert.ok(capabilities.includes('sessions.resume'))
  assert.ok(capabilities.includes('sessions.wait'))

  for (const capability of [
    'sessions.list',
    'sessions.search',
    'sessions.create',
    'sessions.directory.follow',
    'sessions.events.replay',
    'sessions.events.resync',
  ]) {
    assert.equal(capabilities.includes(capability), false, capability)
  }
})

test('the proposal distinguishes published Remote methods from missing SDK methods', () => {
  assert.match(proposal, /@deepseek-ai\/dsh-api-session-controller/)
  assert.match(proposal, /session\.list/)
  assert.match(proposal, /session\.search/)
  assert.match(proposal, /session\.create/)
  assert.match(proposal, /session\/list/)
  assert.match(proposal, /session\/search/)
  assert.match(proposal, /session\/create/)
  assert.match(proposal, /session\/directory\/follow/)
  assert.match(proposal, /snapshotRevision/)
  assert.match(proposal, /https:\/\/github\.com\/deepseek-ai\/deepseek-harness/)
})

test('the documentation links to the independent directory contract', () => {
  assert.match(readme, /\]\(SESSION_DIRECTORY_API_PROPOSAL\.md\)/)
  assert.match(host, /\]\(SESSION_DIRECTORY_API_PROPOSAL\.md\)/)
  assert.match(readme, /Session Controller/)
})

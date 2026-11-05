import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const host = read('../packages/dsh-desktop-delta/HOST_API.md')
const readme = read('../packages/dsh-desktop-delta/README.md')
const proposal = read('../packages/dsh-desktop-delta/RUN_CANCELLATION_API_PROPOSAL.md')

test('Tauri does not advertise unsupported run cancellation', () => {
  const match = rust.match(/let mut capabilities = vec!\[([\s\S]*?)\]/)
  assert.ok(match, 'capability list must exist')
  const caps = [...match[1].matchAll(/"([^"]+)"/g)].map(item => item[1])
  assert.equal(caps.includes('sessions.cancel'), false)
  assert.match(rust, /"runCancellation": false/)
  assert.doesNotMatch(rust, /fn (?:cancel_session|cancel_run|cancel_turn)\s*\(/)
})

test('upstream cancellation contract specifies identity, races, and restrictions', () => {
  for (const pattern of [
    /@Remote\('cancel'\)/,
    /session\.cancel/,
    /session\/cancel-turn/,
    /expectedTurnId/,
    /requestId/,
    /stale_turn/,
    /keepInbox: true/,
    /outcomeUnknown=true/,
    /sessions\.cancel-run-tree/,
  ]) assert.match(proposal, pattern)
})

test('host documentation links the upstream proposal', () => {
  assert.match(host, /\]\(RUN_CANCELLATION_API_PROPOSAL\.md\)/)
  assert.match(readme, /\]\(RUN_CANCELLATION_API_PROPOSAL\.md\)/)
})

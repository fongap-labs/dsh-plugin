import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')
const contract = read('../packages/dsh-desktop-delta/src/lib/desktop-host-contract.ts')
const proposal = read('../packages/dsh-desktop-delta/TERMINAL_API_PROPOSAL.md')

test('terminal capability remains a target contract until Harness exposes stdio methods', () => {
  assert.match(contract, /terminals\.manage/)
  assert.match(contract, /terminals\.events/)
  assert.match(proposal, /Terminal Controller/)
  assert.doesNotMatch(app, /view === 'terminal'/)
})

test('Tauri Host and client do not expose terminal process controls', () => {
  assert.doesNotMatch(rust, /terminals\.manage|terminals\.events|create_terminal|write_terminal|resize_terminal|close_terminal/)
  assert.doesNotMatch(client, /createTerminal|writeTerminal|resizeTerminal|closeTerminal|subscribeTerminal/)
})

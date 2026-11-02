import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-ui-delta/src/client.ts', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../packages/dsh-ui-delta/package.json', import.meta.url), 'utf8'))

describe('session-scoped approval extension', () => {
  it('adds a real session option in the existing approval composer without replacing the Host audit path', () => {
    assert.match(client, /Allow in this session/)
    assert.match(client, /name: 'conversation\.composer'/)
    assert.match(client, /priority: -10/)
    assert.match(client, /renderFactorySlot\('conversation\.approval\.card'/)
    assert.match(client, /onAllow: \(\) => approval\.answer\('allowed-once'\)/)
    assert.match(client, /onReject: \(\) => approval\.answer\('rejected'\)/)
  })
  it('never uses the broad permission preset or fabricates new Host outcomes', () => {
    assert.doesNotMatch(client, /danger-full-access/)
    assert.doesNotMatch(client, /allowed-session|allowed-always/)
    assert.match(client, /approval\.answer\('allowed-once'\)/)
  })
  it('requires exact Host-recorded tool-call arguments and reason plus session binding', () => {
    assert.match(client, /event\?\.type !== 'tool\/call'/)
    assert.match(client, /event\.data\.name !== approval\.toolName/)
    assert.match(client, /event\.data\.arguments !== 'string'/)
    assert.match(client, /JSON\.stringify\(\[approval\.toolName, event\.data\.arguments, approval\.reason \?\? null\]\)/)
    assert.match(client, /grant\?\.binding === candidate\.binding/)
    assert.match(client, /approval\.sessionId !== sessionId/)
  })
  it('expires on reload, supports missing callId fail-closed and cleans up on unload', () => {
    assert.match(client, /if \(!approval\.callId \|\| !approval\.toolName \|\| !approval\.answerable\) return null/)
    assert.match(client, /grants = new Map/)
    assert.match(client, /eventObservers\.clear\(\)/)
    assert.match(client, /grants\.clear\(\)/)
    assert.match(client, /binding\.eventSource\.subscribe\(reuseApprovals\)/)
    assert.doesNotMatch(client.slice(client.indexOf('const grants = new Map'),client.indexOf('function DeltaApprovalComposer')), /localStorage|sessionStorage/)
  })
  it('subscribes to real pending interactions rather than intercepting untrusted browser clicks', () => {
    assert.match(client, /sessionStatus\.getSnapshot/)
    assert.match(client, /status\.subscribe\(reuseApprovals\)/)
    assert.match(client, /handled\.add\(approval\)/)
    for (const dep of ['@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-approval'])
      assert.ok(manifest.dsh.client.inject.includes(dep))
  })
})

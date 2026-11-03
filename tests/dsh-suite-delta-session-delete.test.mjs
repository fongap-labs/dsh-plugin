import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const host = readFileSync(new URL('../packages/dsh-suite-delta/src/host/session-delete.ts', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-suite-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')

describe('session delete safety and integration', () => {
  it('provides a real native menu and confirmation', () => {
    assert.match(client, /session\.delta-delete/)
    assert.match(client, /target: 'session'/)
    assert.match(client, /window\.confirm/)
    assert.match(client, /\/dsh-ui-delta\/session-delete/)
    assert.match(routes, /deleteColdSession/)
  })
  it('refuses running and live sessions and scopes deletion to the persisted directory', () => {
    assert.match(host, /agents\?\.get\(id\)\?\.status === 'running'/)
    assert.match(host, /sessions\?\.get\(id\) !== undefined/)
    assert.match(host, /basename\(directory\) !== id/)
    assert.match(host, /await realpath\(directory\)/)
    assert.match(host, /await rm\(actual, \{ recursive: true, force: false \}\)/)
  })
})

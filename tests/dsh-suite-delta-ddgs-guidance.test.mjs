import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../packages/dsh-suite-delta/src/', import.meta.url)
const adapter = readFileSync(new URL('host/python-ddgs.ts', root), 'utf8')
const routes = readFileSync(new URL('host/routes.ts', root), 'utf8')
const ui = readFileSync(new URL('client.ts', root), 'utf8')

describe('optional ddgs guidance without an installer', () => {
  it('distinguishes a missing interpreter, missing module, and ready state', () => {
    assert.match(adapter, /detectDdgsDependencies/)
    assert.match(adapter, /missing-python/)
    assert.match(adapter, /missing-ddgs/)
    assert.match(adapter, /state: 'ready'/)
    assert.match(adapter, /importlib\.util\.find_spec/)
    assert.doesNotMatch(adapter.slice(adapter.indexOf('export async function detectDdgsDependencies')), /pip', 'install'/)
  })
  it('exposes only a read-only status route, not an installation endpoint', () => {
    assert.match(routes, /route\('\/dsh-ui-delta\/ddgs-status'/)
    assert.match(routes, /req\.method !== 'GET'/)
    assert.doesNotMatch(routes, /route\('\/dsh-ui-delta\/ddgs-install'/)
  })
  it('checks dependencies only after search fails and explains manual setup', () => {
    assert.match(ui, /fetch\('\/dsh-ui-delta\/ddgs-status'\)/)
    assert.match(ui, /status\.state === 'missing-python'/)
    assert.match(ui, /status\.state === 'missing-ddgs'/)
    assert.match(ui, /python\.org\/downloads/)
    assert.match(ui, /then retry search/)
    assert.doesNotMatch(ui, /fetch\('\/dsh-ui-delta\/ddgs-install'/)
  })
})

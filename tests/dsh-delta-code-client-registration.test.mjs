import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { verifyCodeClient, verifyCodeEntries } from '../scripts/verify-delta-code-release.mjs'

const packagePath = new URL('../packages/dsh-delta-code/', import.meta.url)
const read = path => readFileSync(new URL(path, packagePath), 'utf8')
const manifest = JSON.parse(read('package.json'))

describe('Delta Code Web client registration', () => {
  it('registers the exact package id under a colliding client global, including reload', () => {
    const emitted = read('lib/client.js')
    assert.match(emitted, /__ModuleLoader__\.load\(/)
    assert.doesNotThrow(() => verifyCodeClient(emitted, manifest.name))
  })
  it('rejects an unisolated client, even if its id is correct', () => {
    const source = 'const NAME = "@fongap-labs/dsh-delta-code"; window.__ModuleLoader__.load({ id: NAME, factory() { return {} } });'
    assert.throws(() => verifyCodeClient(source, manifest.name), /already been declared/)
  })
  it('rejects missing registration and stale package ids', () => {
    const wrapped = id => ';(() => { window.__ModuleLoader__.load({ id: ' + JSON.stringify(id) +
      ', factory() { return {} } }); })();'
    assert.throws(() => verifyCodeClient(';(() => {})();', manifest.name), /failed to register/)
    assert.throws(() => verifyCodeClient(wrapped('dsh-delta-code'), manifest.name), /wrong package id/)
    assert.doesNotThrow(() => verifyCodeClient(wrapped(manifest.name), manifest.name))
  })
  it('rejects a packaged client that omits the entry or mismatches its manifest', () => {
    const entries = new Map([
      ['package.json', Buffer.from(JSON.stringify({ ...manifest, version: '0.1.0-beta.3' }))],
      ['lib/index.js', Buffer.from('export const name = "@fongap-labs/dsh-delta-code"')],
      ['lib/client.js', Buffer.from(';(() => {})();')],
      ['cordis.patch.yml', Buffer.from("name: '@fongap-labs/dsh-delta-code'")],
      ['icon.svg', Buffer.from('<svg/>')],
    ])
    assert.throws(() => verifyCodeEntries(entries, '0.1.0-beta.3', 'ZIP'), /failed to register/)
    entries.delete('lib/client.js')
    assert.throws(() => verifyCodeEntries(entries, '0.1.0-beta.3', 'ZIP'), /missing lib\/client.js/)
  })
})

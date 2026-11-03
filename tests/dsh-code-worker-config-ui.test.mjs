import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const root = new URL('../packages/dsh-code-worker/', import.meta.url)
const read = (p) => readFileSync(new URL(p,root),'utf8')
describe('code worker native settings contract', () => {
  it('ships Host Config with volatile paths and secret token role', () => {
    assert.match(read('src/config.ts'), /volatile\(\)/)
    assert.match(read('src/config.ts'), /role\('secret'\)/)
  })
  it('ships a proper client entry, not an HTML/DOM overlay', () => {
    const pkg = JSON.parse(read('package.json'))
    assert.equal(pkg.exports['./client'], './lib/client.js')
    assert.equal(pkg.dsh.client.platform,'web')
    assert.match(read('src/client.ts'), /plugins\.row\.config/)
    assert.match(read('src/client.ts'), /mutate\(ops, state\.revision\)/)
  })
  it('keeps existing token as path-level updates, never puts it on the wire', () => {
    const source=read('src/client.ts')
    assert.match(source, /sourceIndex/)
    assert.match(source,/path: \[\.\.\.prefix, 'token'\]/)
    assert.match(source,/token: ''/)
  })
})

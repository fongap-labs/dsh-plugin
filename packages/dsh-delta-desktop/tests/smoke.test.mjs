import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Desktop is its own Cordis package with no Suite or Code dependency', () => {
  const manifest = JSON.parse(read('package.json'))
  const name = ['dsh', 'delta', 'desktop'].join('-')
  assert.equal(manifest.name, '@fongap-labs/' + name)
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(!JSON.stringify(manifest).includes(['dsh', 'delta', 'suite'].join('-')))
  assert.ok(!JSON.stringify(manifest).includes(['dsh', 'delta', 'code'].join('-')))
})

test('Root registration can be disposed, and native UI is not disabled by default', () => {
  const client = read('src/client.ts')
  assert.match(client, /name: 'root', priority: -100/)
  assert.match(client, /ctx\.effect\(\(\) => ctx\.slots\.register/)
  assert.match(client, /reference\.release\(\)/)
  assert.doesNotMatch(read('cordis.patch.yml'), /disabled:\s*true/)
})

test('Assistant reply uses durable message.content rather than raw streaming format', () => {
  const client = read('src/client.ts')
  assert.match(client, /event\.type === 'assistant\/message' \? value\.message : value\.content/)
  assert.match(client, /const text = textOf\(message\)/)
  assert.doesNotMatch(client, /value\.stream \?\? value\.content/)
})

test('B2-only UI removal stays experimental, with recovery instructions', () => {
  assert.match(read('cordis.delta-only.patch.yml'), /disabled: true/)
  const plan = read('docs/quick-validation.md')
  assert.match(plan, /Disable Desktop and restart Harness/)
  assert.match(plan, /working set\/RSS/)
  assert.match(plan, /Do not tag, merge, or publish/)
})

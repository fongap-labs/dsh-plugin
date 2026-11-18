import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const client = read('../packages/dsh-delta-desktop/src/client.ts')
const ambient = read('../packages/dsh-delta-desktop/src/client-types.d.ts')
const clientConfig = JSON.parse(read('../packages/dsh-delta-desktop/tsconfig.client.json'))
const hostConfig = JSON.parse(read('../packages/dsh-delta-desktop/tsconfig.json'))

test('client service contracts are types-only and excluded from the Host build', () => {
  for (const name of ['DeltaCopy', 'ReactApi', 'ClientContext', 'SlotsApi', 'McpManagerApi']) {
    assert.match(ambient, new RegExp('^interface ' + name + ' \\{', 'm'))
    assert.doesNotMatch(client, new RegExp('^interface ' + name + ' \\{', 'm'))
  }
  assert.deepEqual(clientConfig.include, ['src/client.ts', 'src/client-types.d.ts'])
  assert.ok(hostConfig.exclude.includes('src/client.ts'))
  assert.ok(hostConfig.exclude.includes('src/client-types.d.ts'))
  assert.doesNotMatch(ambient, /^(?:const|let|function|class|import|export)\s/m)
  assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
})

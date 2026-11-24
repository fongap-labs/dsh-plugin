import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const client = read('../packages/delta-suite/src/client.ts')
const ambient = read('../packages/delta-suite/src/client-types.d.ts')
const clientConfig = JSON.parse(read('../packages/delta-suite/tsconfig.client.json'))
const hostConfig = JSON.parse(read('../packages/delta-suite/tsconfig.json'))

test('client service contracts are types-only and excluded from the Host build', () => {
  for (const name of ['DeltaCopy', 'ReactApi', 'ClientContext', 'SlotsApi']) {
    assert.match(ambient, new RegExp('^interface ' + name + ' \\{', 'm'))
    assert.doesNotMatch(client, new RegExp('^interface ' + name + ' \\{', 'm'))
  }
  assert.doesNotMatch(ambient, /McpConfigSnapshot|McpServices|McpManagerApi|CredentialRemoteApi/)
  assert.deepEqual(clientConfig.include, ["src/client-theme-tokens.ts","src/client-context-projection.ts","src/client-totp-qr.ts","src/client-workspace-projection.ts","src/client-search-protection.ts","src/client.ts","src/client-types.d.ts"])
  assert.ok(hostConfig.exclude.includes('src/client.ts'))
  assert.ok(hostConfig.exclude.includes('src/client-types.d.ts'))
  for (const helper of clientConfig.include.filter(path => /^src\/client-.+\.ts$/.test(path) && !path.endsWith('.d.ts'))) {
    assert.ok(hostConfig.exclude.includes(helper), 'browser helper must be excluded from Host build: ' + helper)
  }
  assert.doesNotMatch(ambient, /^(?:const|let|function|class|import|export)\s/m)
  assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
})

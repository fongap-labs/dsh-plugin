import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixture = rel => fileURLToPath(new URL('../' + rel, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const host = await import('../packages/dsh-delta-desktop/lib/index.js')

test('Host guard allows default deletion only when empty and other workspace exists', async () => {
  const deleted = []
  const automatic = {
    id: 'protected', path: 'C:\\Users\\test\\Documents\\deepseek-harness\\default-workspace',
    sessionIds: ['session-one'],
  }
  const other = { id: 'other', path: '/home/test/workspace', sessionIds: [] }
  let hasOtherWorkspace = true
  let cleanup
  const registry = {
    get(id) { return id === automatic.id ? automatic : id === other.id && hasOtherWorkspace ? other : undefined },
    list() { return hasOtherWorkspace ? [automatic, other] : [automatic] },
    async delete(id) { deleted.push(id); return true },
  }
  const original = registry.delete
  const stop = host.apply({
    workspaceRegistry: registry,
    effect(fn) { cleanup = fn() },
  })
  assert.equal(host.isAutomaticDefaultWorkspace('/a/deepseek-harness/default-workspace'), true)
  assert.equal(host.isAutomaticDefaultWorkspace('/a/other-workspace'), false)
  await assert.rejects(registry.delete('protected'), /delta\/protected-default-workspace/)
  automatic.sessionIds = []
  hasOtherWorkspace = false
  await assert.rejects(registry.delete('protected'), /delta\/protected-default-workspace/)
  hasOtherWorkspace = true
  assert.equal(await registry.delete('protected'), true)
  assert.equal(await registry.delete('other'), true)
  assert.deepEqual(deleted, ['protected', 'other'])
  cleanup()
  stop()
  assert.equal(registry.delete, original)
  assert.equal(await registry.delete('protected'), true)
  assert.deepEqual(deleted, ['protected', 'other', 'protected'])
})

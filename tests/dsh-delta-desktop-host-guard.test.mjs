import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const fixture = rel => fileURLToPath(new URL('../' + rel, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const host = await import('../packages/dsh-delta-desktop/lib/index.js')

test('Host plugin does not patch workspace deletion', () => {
  const registry = { async delete() { return true } }
  const original = registry.delete
  const stop = host.apply({ workspaceRegistry: registry })
  assert.equal(registry.delete, original)
  stop()
  assert.equal(registry.delete, original)
})

test('missing and incompatible Host contracts fail closed', () => {
  const required = ['sidebar.compose', 'workspace.before-delete']
  const absent = host.negotiateHostCapabilities(null, required)
  assert.equal(absent.compatible, false)
  assert.deepEqual(absent.missing, required)
  assert.equal(absent.reason, 'missing-manifest')
  const outdated = host.negotiateHostCapabilities({
    contractVersion: 2, capabilities: required,
  }, required)
  assert.equal(outdated.compatible, false)
  assert.equal(outdated.reason, 'unsupported-contract')
})

test('capability negotiation is explicit and version independent', () => {
  const manifest = {
    contractVersion: host.DELTA_HOST_CONTRACT_VERSION,
    capabilities: ['theme.tokens', 'settings.section', 'random.private.host.feature'],
  }
  const ready = host.negotiateHostCapabilities(manifest, ['theme.tokens'])
  assert.equal(ready.compatible, true)
  assert.deepEqual(ready.available, ['theme.tokens', 'settings.section'])
  const denied = host.negotiateHostCapabilities(manifest, ['workspace.before-delete'])
  assert.equal(denied.compatible, false)
  assert.deepEqual(denied.missing, ['workspace.before-delete'])
})

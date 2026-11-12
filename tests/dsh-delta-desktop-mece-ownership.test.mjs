import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const taxonomy = JSON.parse(file('../projects/dsh-delta-desktop/architecture-mece.json'))
const client = file('../packages/dsh-delta-desktop/src/client.ts')

test('MECE feature taxonomy contains exactly one owner for each declared capability', () => {
  assert.equal(taxonomy.schema_version, 1)
  assert.equal(taxonomy.principle, 'MECE')
  const owners = taxonomy.owners.map(x => x.id)
  assert.deepEqual([...owners].sort(), ['context', 'discovery', 'integrations', 'security', 'sessions', 'shell'])
  assert.equal(new Set(owners).size, owners.length)
  const capabilityIds = taxonomy.owners.flatMap(x => x.capabilities)
  assert.ok(capabilityIds.length >= 25)
  assert.equal(new Set(capabilityIds).size, capabilityIds.length,
    'capability must have exactly one accountable owner')
  assert.equal(new Set(taxonomy.allowed_ui_extension_zones).size, 3)
  assert.deepEqual([...taxonomy.allowed_ui_extension_zones].sort(),
    ['left-sidebar', 'right-sidebar', 'settings'])
  for (const owner of taxonomy.owners) {
    assert.ok(owner.capabilities.length > 0)
    assert.ok(owner.surfaces.every(x => taxonomy.allowed_ui_extension_zones.includes(x)))
  }
})

test('legacy entrypoints map to one owner and all cross-cut dependencies are classified', () => {
  const owners = new Set(taxonomy.owners.map(x => x.id))
  for (const hotspot of taxonomy.legacy_hotspots) {
    assert.ok(client.includes(hotspot.symbol), 'untraced legacy hotspot: ' + hotspot.symbol)
    assert.ok(owners.has(hotspot.owner), 'unknown owner: ' + hotspot.owner)
    assert.ok(hotspot.cross_cuts.every(x => owners.has(x) && x !== hotspot.owner))
    assert.ok(hotspot.action.length > 12, 'migration requirement missing: ' + hotspot.symbol)
  }
  assert.equal(new Set(taxonomy.legacy_hotspots.map(x => x.symbol)).size,
    taxonomy.legacy_hotspots.length)
})

test('Host remains responsible for privileged effects and extensions remain constrained', () => {
  for (const authority of ['file-modification', 'external-data-egress',
    'session-access', 'workspace-deletion', 'credentials']) {
    assert.ok(taxonomy.host_owned_authority.includes(authority))
  }
  assert.ok(taxonomy.browser_prohibited_authority.includes('approval-bypass'))
  assert.ok(taxonomy.browser_prohibited_authority.includes('host-private-dom-ownership'))
  assert.ok(taxonomy.pending_capabilities.includes('versioned-host-adapters'))
})

test('Host extension bootstrap uses the registered MECE domains rather than a hidden parallel installer', () => {
  const host = file('../packages/dsh-delta-desktop/src/index.ts')
  const registry = file('../packages/dsh-delta-desktop/src/feature-registry.ts')
  assert.match(host, /new DeltaFeatureRegistry<PrivacyHostContext>/)
  assert.match(host, /registry\.mount\(ctx, new Set<string>\(\)\)/)
  assert.match(registry, /DELTA_EXTENSION_SURFACES/)
  assert.match(registry, /Missing required Host capabilities/)
  assert.match(registry, /for \(let index = this\.cleanups\.length - 1; index >= 0; index--\)/)
  for (const id of ['context.compaction-status', 'security.model-stream-policy',
    'security.privacy-guards', 'security.auth-cookie-pruner',
    'discovery.session-search', 'sessions.session-operations', 'integrations.proxy-settings']) {
    assert.ok(host.includes("id: '" + id + "'"), 'unregistered Host feature: ' + id)
  }
  assert.ok(host.includes("throw new Error('Delta privacy bridge requires"),
    'configured privacy enforcement cannot be silently bypassed')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const taxonomy = JSON.parse(file('../projects/delta-suite/architecture-mece.json'))
const client = file('../packages/delta-suite/src/client.ts')

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
    assert.ok(client.includes(hotspot.symbol), 'untraced live hotspot: ' + hotspot.symbol)
    assert.ok(owners.has(hotspot.owner), 'unknown owner: ' + hotspot.owner)
    assert.ok(hotspot.cross_cuts.every(x => owners.has(x) && x !== hotspot.owner))
    assert.ok(hotspot.action.length > 12, 'migration requirement missing: ' + hotspot.symbol)
  }
  assert.equal(new Set(taxonomy.legacy_hotspots.map(x => x.symbol)).size,
    taxonomy.legacy_hotspots.length)
  assert.equal(taxonomy.legacy_hotspots.some(x => x.symbol === 'installSidebarCompatibility'), false)
  assert.doesNotMatch(client, /function installSidebarCompatibility\(/)
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
  const host = file('../packages/delta-suite/src/index.ts')
  const composition = file('../packages/delta-suite/src/delta-suite-composition.ts')
  const registry = file('../packages/delta-suite/src/delta-suite-kernel/feature-lifecycle-registry.ts')
  assert.match(host, /export \{ apply \} from '\.\/delta-suite-composition\.js'/)
  assert.match(composition, /new DeltaFeatureRegistry<PrivacyHostContext>/)
  assert.match(composition, /registry\.mount\(ctx, readHostContextActivationCapabilities\(ctx\)\)/)
  assert.match(registry, /DELTA_EXTENSION_SURFACES/)
  assert.match(registry, /Missing required Host capabilities/)
  assert.match(registry, /for \(let index = this\.cleanups\.length - 1; index >= 0; index--\)/)
  for (const id of ['context.compaction-status', 'security.privacy-guards',
    'discovery.session-search', 'sessions.session-operations']) {
    assert.ok(composition.includes("id: '" + id + "'"), 'unregistered Host feature: ' + id)
  }
  assert.doesNotMatch(composition, /id:\s*'integrations\.(?:proxy-settings|vision-bridge)'/,
    'removed proxy and Vision Bridge services must not be registered')
  assert.doesNotMatch(composition, /id:\s*'integrations\.gateway-retry-guard'/,
    'Desktop must not register another gateway retry listener alongside Code Worker')
  assert.doesNotMatch(composition, /registerPrivacyBridge|installHostAuthCookiePruner/,
    'unsupported model and Host cookie interceptors must never be mounted')
})


test('Host feature access declarations cover every mounted descriptor and its activation requirements', () => {
  const composition = file('../packages/delta-suite/src/delta-suite-composition.ts')
  const entries = [...composition.matchAll(/registry\.register\(\{\s*id: '([^']+)',\s*owner: '([^']+)',\s*requires: \[([^\]]*)\]/g)]
  assert.deepEqual(entries.map(entry => entry[1]).sort(), Object.keys(taxonomy.host_feature_registration).sort())
  assert.deepEqual(Object.keys(taxonomy.host_feature_access).sort(), Object.keys(taxonomy.host_feature_registration).sort())
  for (const [, id, owner, requires] of entries) {
    const access = taxonomy.host_feature_access[id]
    assert.equal(owner, taxonomy.host_feature_registration[id])
    assert.deepEqual([...requires.matchAll(/'([^']+)'/g)].map(match => match[1]), access.activation_requires)
    assert.ok(access.host_services.length > 0)
    assert.ok(access.authorization.startsWith('Host '))
  }
})


test('Browser registration requirements match the three declared optional groups', () => {
  const access = taxonomy.browser_feature_access
  assert.deepEqual(Object.keys(access).sort(), ['context.assistant-surface', 'discovery.search-palette', 'sessions.context-menus'])
  const assistant = access['context.assistant-surface']
  for (const method of assistant.activation_requires) {
    const pattern = 'typeof capabilities.' + method.split('.').join('?.') + " !== 'function'"
    assert.ok(client.includes(pattern), 'missing Assistant prerequisite: ' + method)
  }
  assert.match(client, /try \{ contextMenus = searchScope\.get\?\.\('contextMenus'\) as typeof contextMenus \}\s*catch/)
  assert.match(client, /typeof contextMenus\.register === 'function'/)
  for (const [method, expression] of [
    ['uiWorkspace.openSession', 'navApi.openSession'],
    ['uiWorkspace.startSession', 'navApi.startSession'],
    ['slots.inject', 'searchScope.slots?.inject'],
    ['slots.register', 'searchScope.slots?.register'],
  ]) {
    assert.ok(access['discovery.search-palette'].activation_requires.includes(method))
    assert.ok(client.includes('typeof ' + expression + " === 'function'"))
  }
  for (const definition of Object.values(access)) {
    assert.ok(taxonomy.owners.some(owner => owner.id === definition.owner))
    assert.ok(definition.authorization.startsWith('Host '))
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')

test('legacy sidebar navigation rewrites stay removed; new adapter owns its isolated Delta-only labels', () => {
  for (const removed of ['replaceButtonText', 'setButtonLabel', 'mutatedNavButtons']) {
    assert.equal(source.includes(removed), false, 'legacy text mutation remains: ' + removed)
  }
  assert.doesNotMatch(source, /hiddenMoreElements/, 'the native More action must no longer be hidden')
  assert.doesNotMatch(source, /target\.style\.setProperty\('display', 'none', 'important'\)/)
  assert.doesNotMatch(source, /syncSettingsNav|syncMenus|data-dtd-nav-tail/)
  assert.match(source, /function installSidebarCompatibility\(/)
  assert.match(source, /function installLiveNativePresentation\(/)
  assert.match(source, /if \(controller\.getSnapshot\(\)\.mode !== 'delta'\) \{ rollback\(\); return \}/)
  assert.match(source, /scope\.slots\.inject\('sidebar\.session\.action'/)
})

test('ZIP3 checksum still rejects unreviewed native navigation mutation', () => {
  const client = [
    'function installSidebarCompatibility() {}',
    'function installHostSearch() {}',
    'data-delta-compat dtd-host-search',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(client, source))
  const changed = source.replace(
    'function installSidebarCompatibility(controller: DeltaController): () => void {',
    'function installSidebarCompatibility(controller: DeltaController): () => void { /* unreviewed native label rewrite */',
  )
  assert.notEqual(changed, source)
  assert.throws(() => verifyApprovedZip3Client(client, changed), /approved compatibility adapter changed/)
})

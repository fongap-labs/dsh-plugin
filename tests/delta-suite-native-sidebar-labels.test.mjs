import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const theme = read('packages/dsh-delta-desktop/src/theme.css')

test('native sidebar navigation labels and accessibility text are not rewritten', () => {
  for (const removed of ['replaceButtonText', 'setButtonLabel', 'mutatedNavButtons']) {
    assert.equal(source.includes(removed), false, 'legacy text mutation remains: ' + removed)
  }
  assert.match(source, /Harness owns built-in navigation labels/)
  assert.match(source, /const hiddenMoreElements = new Map/, 'More visibility is a separate migration')
  assert.match(source, /const syncSettingsNav = /)
  assert.match(source, /const syncMenus = /)
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('ZIP3 checksum still rejects unreviewed native navigation mutation', () => {
  const client = [
    'function installSidebarCompatibility() {}',
    'function installHostSearch() {}',
    'data-delta-compat dtd-native-search',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(client, source))
  const changed = source.replace(
    '// Harness owns built-in navigation labels; legacy More visibility is reviewed separately.',
    'const hacked = (btn) => { btn.textContent = "changed" }',
  )
  assert.notEqual(changed, source)
  assert.throws(() => verifyApprovedZip3Client(client, changed), /approved compatibility adapter changed/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'
const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native Session menu labels and destructive styling stay Harness-owned', () => {
  assert.doesNotMatch(source, /\binstallSidebarCompatibility\b|\bonMenuClickCapture\b/)
  for (const marker of ['syncMenus', 'syncSettingsNav', 'data-dtd-nav-tail',
    'openUngroupedContextMenu', 'dtd-menu-danger']) {
    assert.equal(source.includes(marker), false)
  }
  assert.doesNotMatch(theme, /\.dtd-menu-danger|\.dtd-context-menu/)
})

test('ZIP3 rejects restored native Session label interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
  assert.throws(() => verifyApprovedZip3Client(emitted, source.replace(
    'function installHostSearch(', 'function installHostSearch(/* modified */'
  )), /approved compatibility adapter changed/)
})

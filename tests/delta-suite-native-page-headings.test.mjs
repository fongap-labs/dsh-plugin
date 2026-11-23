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

test('Harness owns page headings; Suite does not scan native headings', () => {
  for (const token of ['syncPageHeadings', 'mutatedPageHeadings',
    'syncSettingsNav', 'syncMenus', 'data-dtd-nav-tail']) {
    assert.equal(source.includes(token), false, 'native page-heading takeover: ' + token)
  }
  assert.doesNotMatch(source, /\binstallSidebarCompatibility\b/)
})

test('review pin still rejects revived native page-heading adapters', () => {
  assert.doesNotMatch(source, /\b(?:installSidebarCompatibility|onMenuClickCapture|triggerAccountMenuAction)\b/)
  assert.match(source, /function installHostSearch\(/)
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
})

test('pinned public Search implementation cannot be modified silently', () => {
  assert.throws(() => verifyApprovedZip3Client(emitted, source.replace(
    'function installHostSearch(', 'function installHostSearch(/* unreviewed */'
  )), /approved compatibility adapter changed/)
})

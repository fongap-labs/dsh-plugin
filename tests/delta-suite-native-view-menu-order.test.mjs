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

test('native View Options ordering remains Harness-owned', () => {
  for (const token of ['VIEW_OPTIONS_ORDERS', 'isViewMenu', 'seenSep',
    'syncMenus', 'onMenuClickCapture', 'installSidebarCompatibility']) {
    assert.equal(source.includes(token), false, token)
  }
  assert.match(source, /function installHostSearch\(/)
})

test('ZIP3 blocks reintroduction of native View Options mutations', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
  assert.throws(() => verifyApprovedZip3Client(emitted, source.replace(
    'function installHostSearch(', 'function installHostSearch(/* modified */'
  )), /approved compatibility adapter changed/)
})

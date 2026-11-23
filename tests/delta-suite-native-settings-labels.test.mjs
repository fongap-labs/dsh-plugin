import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)

const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Settings navigation remains under Harness layout and label ownership', () => {
  assert.doesNotMatch(source, /const syncSettingsNav\s*=|data-dtd-nav-tail/)
  assert.doesNotMatch(source, /setAttribute\(['"]data-delta-compat/)
  assert.doesNotMatch(source, /const replaceButtonText\s*=/)
})

test('ZIP3 release verifier rejects reintroduced native Settings layout activation', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + "\n    document.documentElement.dataset.deltaCompat = '1'")
  assert.notEqual(tampered, normalizedSource, 'negative fixture must mutate the compatibility function')
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const theme = read('packages/dsh-delta-suite/src/theme.css')

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
  const tampered = source.replace(
    'const sync = (): void => {',
    "const sync = (): void => { document.documentElement.dataset.deltaCompat = '1'",
  )
  assert.notEqual(tampered, source, 'negative fixture must mutate the compatibility function')
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

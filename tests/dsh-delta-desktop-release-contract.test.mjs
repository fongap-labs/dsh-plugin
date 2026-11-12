import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const source = read('../packages/dsh-delta-desktop/src/client.ts')
const theme = read('../packages/dsh-delta-desktop/src/theme.css')

// Simulate the compiler + finalize-client markers used by both published archives.
const emittedClient = (style = theme) => [
  'window.__ModuleLoader__.load({',
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat',
  'dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(style) + ';',
].join('\n')

test('release guard accepts only the reviewed ZIP3 adapter and canonical theme', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emittedClient(), source))
  assert.doesNotThrow(() => verifyApprovedZip3Client(emittedClient(), source.replace(/\r?\n/g, '\r\n')))
})

test('release guard refuses changes to either approved compatibility implementation', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient(), source.replace(
    'function installSidebarCompatibility(', 'function installSidebarCompatibility(/* changed */'
  )), /approved compatibility adapter changed/)
  assert.throws(() => verifyApprovedZip3Client(emittedClient(), source.replace(
    'function installHostSearch(', 'function installHostSearch(/* changed */'
  )), /approved compatibility adapter changed/)
})

test('release guard checks the actual emitted CSS, not just source comments', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient(theme.replace('--dtd-brand:', '--dtd-custom-brand:')), source),
    /approved theme differs/)
  assert.throws(() => verifyApprovedZip3Client(emittedClient().replace('const OWNED_CSS =', 'const NO_THEME ='), source),
    /stylesheet missing/)
})

test('release guard rejects duplicate or unapproved Host takeover entry points', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\nfunction installHostSearch() {}', source),
    /duplicated/)
  for (const banned of ['openSearchDialog(', 'dtd-search-dialog-backdrop', 'workspaceRegistry', 'app.asar']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + banned, source),
      /non-ZIP3 Host DOM/)
  }
})

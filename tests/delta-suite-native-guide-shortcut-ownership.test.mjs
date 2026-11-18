import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const begin = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', begin)
const search = begin >= 0 && end > begin ? normalized.slice(begin, end) : ''

test('Search Palette leaves native right-sidebar shortcut guide clicks to Harness', () => {
  assert.ok(search.length > 0)
  assert.doesNotMatch(search, /data-sidebar-right-guide-entry|guideNodes|guide-\$\{idx\}|node\.click\?\.\(\)/)
  assert.doesNotMatch(search, /\[class\*="4GESq_text"\]|\[class\*="4GESq_shortcut"\]/)
  assert.match(search, /getShortcutsService\(\)\?\.catalog\?\.getSnapshot\?\.\(\)/,
    'existing Host shortcut catalog read remains available')
  assert.match(search, /pushShortcut\('search'/, 'Delta-owned search remains available')
  assert.match(search, /pushShortcut\('files'/, 'Delta-owned sidebar action remains available')
  assert.match(search, /Native right-sidebar guide entries are Host-owned/)
})

test('ZIP3 reviewer rejects reintroducing synthetic native guide clicks', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Native right-sidebar guide entries are Host-owned and not command targets.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor +
    "\n    document.querySelector('[data-sidebar-right-guide-entry]')?.click()")
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

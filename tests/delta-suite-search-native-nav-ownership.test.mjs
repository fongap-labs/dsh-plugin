import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-ui-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-ui/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-ui/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'data-delta-compat dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const begin = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', begin)
const search = begin >= 0 && end > begin ? normalized.slice(begin, end) : ''

test('Search Palette does not guess native Plugins or Schedules navigation targets', () => {
  assert.ok(search.length > 0)
  assert.doesNotMatch(search, /clickSidebarNavTarget|id: 'act:plugins'|id: 'act:schedules'/)
  assert.doesNotMatch(search, /pluginInventory\?\.list|pluginManager\?\.listPlugins|pluginManager\?\.listBundles/)
  assert.doesNotMatch(search, /\[class\*="wtg9ga_panelList"\] button/)
  assert.match(search, /const plugins: PaletteItem\[\] = \[\]/, 'empty unsupported catalog keeps tab shape stable')
  assert.match(search, /const skills: PaletteItem\[\] = \[\]/)
  assert.match(search, /const shortcuts: PaletteItem\[\] = \[\]/)
  assert.match(search, /id: 'act:new'/, 'supported navigation remains')
  assert.match(search, /id: 'act:sidebar'/, 'supported toggle remains')
})

test('ZIP3 reviewer rejects restoring label-click navigation and search catalog actions', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Plugin and schedule navigation remain native-owned: without a public'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n    document.querySelector("[aria-label=Plugins]")?.click()')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

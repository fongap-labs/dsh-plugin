import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const begin = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', begin)
const search = begin >= 0 && end > begin ? normalized.slice(begin, end) : ''

test('Delta search does not guess which native Settings button to click', () => {
  assert.ok(search.length > 0)
  assert.doesNotMatch(search, /clickSettingsTrigger|dtd-btn-settings|data-dtd-settings/)
  assert.doesNotMatch(search, /\[aria-label="Settings"\]|\[aria-label="\\u8BBE\\u7F6E"\]/)
  assert.doesNotMatch(search, /id: 'act:settings'/)
  assert.match(search, /if \(!id \|\| !label \|\| id === 'settings.open'\) continue/)
  assert.match(normalized, /name: 'settings.section'/, 'official settings content slot remains')
})

test('ZIP3 Search Region review pin rejects a restored global Settings-click fallback', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Host Settings is native-owned; this adapter has no public open-settings route.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n    document.querySelector(\'[aria-label="Settings"]\')?.click()')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

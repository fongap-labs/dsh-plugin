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
const start = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', start)
const search = start >= 0 && end > start ? normalized.slice(start, end) : ''
const listStart = search.indexOf('const liveRows = getShortcutsService()?.catalog?.getSnapshot?.()')
const listEnd = search.indexOf('// Native right-sidebar guide entries are Host-owned', listStart)
const catalogLoop = listStart >= 0 && listEnd > listStart ? search.slice(listStart, listEnd) : ''

test('Host shortcut catalog is not authority for arbitrary registry execution', () => {
  assert.ok(catalogLoop.length > 0)
  assert.doesNotMatch(catalogLoop, /registry\?\.invoke|region: 'page'|modal: null|target: null/)
  assert.doesNotMatch(search, /registry\?:\s*\{\s*invoke\?:/)
  const acceptedIds = Array.from(catalogLoop.matchAll(/case '([^']+)':/g), match => match[1])
  assert.deepEqual(acceptedIds, [
    'session.search', 'session.new', 'sidebar.left.toggle', 'sidebar.right.toggle',
  ])
  assert.match(catalogLoop, /default:\s*\/\/ Unknown Host commands stay in Harness native shortcut handling\.\s*continue/)
  assert.match(catalogLoop, /if \(!run\) continue/)
  assert.match(search, /pushShortcut\('search'/, 'Delta-owned shortcut remains')
})

test('sidebar fallback is exclusive, not executed twice for void return values', () => {
  assert.match(catalogLoop, /if \(typeof controller\.toggleSidebarSafe === 'function'\) controller\.toggleSidebarSafe\(\)/)
  assert.match(catalogLoop, /else controller\.toggleSidebar\(\)/)
  assert.doesNotMatch(catalogLoop, /toggleSidebarSafe\?\.\(\) \?\? controller\.toggleSidebar\(\)/)
  assert.match(catalogLoop, /if \(typeof controller\.toggleRightbarSafe !== 'function'\) continue/)
})

test('ZIP3 source review pin rejects synthetic shortcut registry invocation', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Unknown Host commands stay in Harness native shortcut handling.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor +
    "\n            getShortcutsService()?.registry?.invoke?.(id, { region: 'page', modal: null, target: null })")
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

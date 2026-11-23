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

test('native Session menus retain Harness order, appearance and permission checks', () => {
  for (const token of ['setMenuNodeOrder(', 'getSessionMenuOrder(', 'sortContainerChildrenByOrder(',
    'createSepNode(', 'syncMenus', 'syncSettingsNav', 'onMenuClickCapture',
    'data-dtd-menu-order', 'dtd-injected-sep', 'openUngroupedContextMenu']) {
    assert.equal(source.includes(token), false, 'native session menu takeover: ' + token)
  }
  assert.doesNotMatch(theme, /\.dtd-context-menu(?:-item)?\b/)
})

test('ZIP3 forbids restored native Session menu DOM manipulation', () => {
  assert.doesNotMatch(source, /\b(?:installSidebarCompatibility|onMenuClickCapture|triggerAccountMenuAction)\b/)
  assert.match(source, /function installHostSearch\(/)
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
})

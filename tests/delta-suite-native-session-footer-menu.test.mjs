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

test('Session footer remains native rather than a Suite DOM interception', () => {
  for (const token of ['setMenuNodeOrder(', 'sortContainerChildrenByOrder(',
    'hiddenSepNodes', 'SESSION_MENU_ORDERS', 'data-dtd-menu-order',
    'onMenuClickCapture', 'hiddenSoleWorkspaceNodes']) {
    assert.equal(source.includes(token), false, 'retired footer control remains: ' + token)
  }
})

test('release guard rejects retired Session footer adapter', () => {
  assert.doesNotMatch(source, /\b(?:installSidebarCompatibility|onMenuClickCapture|triggerAccountMenuAction)\b/)
  assert.match(source, /function installHostSearch\(/)
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
})

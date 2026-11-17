import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-desktop/src/theme.css')
const start = normalizedSource.indexOf('        if (isFooterContainer || isSessionFooter) {\n')
const end = normalizedSource.indexOf('        // Native session context menu item order and separators belong to Harness.\n', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Harness session footer menu owns order and separators, Delta retains destructive action marker', () => {
  assert.ok(start >= 0 && end > start, 'footer and remaining viewport branches are distinct')
  const footer = normalizedSource.slice(start, end)
  for (const removed of ['setMenuNodeOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(', 'hiddenSepNodes', 'container.appendChild(']) {
    assert.equal(footer.includes(removed), false, 'footer DOM takeover remains: ' + removed)
  }
  assert.match(footer, /Native session footer item order and separators belong to Harness/)
  assert.match(footer, /dtd-menu-danger/)
  assert.match(footer, /data-danger/)
  assert.match(footer, /Delete session/)
  assert.doesNotMatch(normalizedSource, /SESSION_MENU_ORDERS/)
  assert.match(normalizedSource, /Native session context menu item order and separators belong to Harness/)
})

test('ZIP3 guard rejects reintroducing unapproved footer DOM mutation', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const marker = '// Native session footer item order and separators belong to Harness.'
  assert.ok(source.includes(marker))
  const changed = source.replace(marker, marker + '\n          container.appendChild(items[0])')
  assert.notEqual(changed, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, changed), /approved compatibility adapter changed/)
})

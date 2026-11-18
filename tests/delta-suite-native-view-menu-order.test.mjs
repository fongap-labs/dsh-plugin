import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = () => [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-native-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Delta leaves native view-options menu ordering intact', () => {
  for (const removed of ['VIEW_OPTIONS_ORDERS', 'isViewMenu', 'seenSep']) {
    assert.equal(source.includes(removed), false, 'view menu takeover remains: ' + removed)
  }
  assert.match(source, /if \(!isSessionMenu && !isWorkspaceMenu\) continue/)
  assert.match(source, /const syncMenus = \(\): void => \{/)
  assert.match(source, /if \(isWorkspaceMenu\) \{/, 'workspace menu remains a separate migration')
  assert.match(source, /if \(isSessionMenu\) \{/, 'session menu remains a separate migration')
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('ZIP3 checksum still rejects unreviewed view-menu takeover', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const anchor = '      if (!isSessionMenu && !isWorkspaceMenu) continue'
  assert.ok(source.includes(anchor))
  const changed = source.replace(anchor, anchor + '\n      container.appendChild(items[0])')
  assert.notEqual(changed, source)
  assert.throws(() => verifyApprovedZip3Client(emitted(), changed), /approved compatibility adapter changed/)
})

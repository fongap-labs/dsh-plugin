import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)
const compatibility = normalizedSource.slice(begin, end)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native session footer menu keeps Harness order while Delta guards remain', () => {
  assert.ok(begin >= 0 && end > begin, 'sidebar compatibility boundaries are traceable')
  for (const removed of [
    'setMenuNodeOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(',
    'hiddenSepNodes', 'SESSION_MENU_ORDERS', 'data-dtd-menu-order', 'dtd-menu-danger',
  ]) {
    assert.equal(compatibility.includes(removed), false, 'native session footer takeover remains: ' + removed)
  }
  assert.match(compatibility, /onMenuClickCapture/, 'protected native menu actions remain guarded')
  assert.match(compatibility, /LOCKED_MUTATION_LABELS/)
  assert.match(compatibility, /hiddenSoleWorkspaceNodes/)
})

test('ZIP3 guard rejects reintroducing unapproved footer DOM mutation', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, normalizedSource))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const changed = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("[class*=\"_footer_\"]")?.appendChild(document.createElement("div"))')
  assert.notEqual(changed, normalizedSource)
  assert.throws(() => verifyApprovedZip3Client(emitted, changed), /approved compatibility adapter changed/)
})

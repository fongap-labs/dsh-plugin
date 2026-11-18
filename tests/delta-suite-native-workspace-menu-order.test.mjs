import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)
const compatibility = normalizedSource.slice(begin, end)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native workspace order stays Harness-owned while deletion guards remain', () => {
  assert.ok(begin >= 0 && end > begin)
  for (const forbidden of [
    'setMenuNodeOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(',
    'WORKSPACE_MENU_ORDERS', 'SESSION_MENU_ORDERS', 'data-dtd-menu-order', 'dtd-injected-sep',
  ]) {
    assert.equal(compatibility.includes(forbidden), false, 'native workspace takeover remains: ' + forbidden)
  }
  assert.match(compatibility, /const soleWorkspace = deltaFeatures\.getWorkspaceCount\(\) === 1/)
  assert.match(compatibility, /const isWorkspaceMenu = soleWorkspace/)
  assert.match(compatibility, /WORKSPACE_DELETE_LABELS\.has\(labels\[i\]\)/)
  assert.match(compatibility, /hiddenSoleWorkspaceNodes/)
  assert.match(compatibility, /onMenuClickCapture/)
})

test('ZIP3 review pin rejects an unapproved workspace DOM reorder', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, normalizedSource))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("[role=menu]")?.appendChild(document.createElement("div"))')
  assert.notEqual(tampered, normalizedSource)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

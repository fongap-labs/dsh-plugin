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
const emitted = () => [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Delta leaves native view-options menu ordering intact', () => {
  for (const removed of ['VIEW_OPTIONS_ORDERS', 'isViewMenu', 'seenSep']) {
    assert.equal(source.includes(removed), false, 'view menu takeover remains: ' + removed)
  }
  assert.doesNotMatch(source, /syncMenus|isSessionMenu/)
  assert.match(source, /const isWorkspaceMenu = soleWorkspace/, 'sole-workspace deletion guard remains')
  assert.match(source, /onMenuClickCapture/, 'protected menu actions remain guarded')
  assert.match(source, /LOCKED_MUTATION_LABELS/)
  assert.match(source, /const soleWorkspace = deltaFeatures\.getWorkspaceCount\(\) === 1/)
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('ZIP3 checksum still rejects unreviewed view-menu takeover', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const changed = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("button")?.parentElement?.appendChild(document.querySelector("button"))')
  assert.notEqual(changed, normalizedSource)
  assert.throws(() => verifyApprovedZip3Client(emitted(), changed), /approved compatibility adapter changed/)
})

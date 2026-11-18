import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)
const compatibility = normalizedSource.slice(begin, end)

test('native session menu labels and destructive styling stay Harness-owned', () => {
  assert.ok(begin >= 0 && end > begin, 'compatibility source boundaries are traceable')
  assert.doesNotMatch(compatibility, /syncMenus|syncSettingsNav|data-dtd-nav-tail/)
  // The custom Ungrouped context menu belongs to Delta; native session menus do not.
  assert.match(compatibility,
    /const labelSpan = document\.createElement\('span'\)\s+labelSpan\.textContent = copy\.sessionMenu\.deleteUngrouped/)
  const withoutDeltaOwnedLabel = compatibility.replace(
    /labelSpan\.textContent\s*=\s*copy\.sessionMenu\.deleteUngrouped/, '')
  assert.doesNotMatch(withoutDeltaOwnedLabel, /(?:labelSpan|el)\.textContent\s*=/)
  assert.doesNotMatch(compatibility, /dtd-menu-danger/)
  assert.match(compatibility, /onMenuClickCapture/)
  assert.match(compatibility, /LOCKED_MUTATION_LABELS/)
})

test('ZIP3 approved client region rejects reintroduced native label interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("[role=menuitem]").textContent = "Open in app"')
  assert.notEqual(tampered, normalizedSource)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

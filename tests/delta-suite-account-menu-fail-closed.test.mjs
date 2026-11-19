import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('retired account menu guessing cannot intercept native commands', () => {
  const start = normalized.indexOf('function installSidebarCompatibility(')
  const end = normalized.indexOf('\ntype SearchTabId', start)
  assert.ok(start >= 0 && end > start)
  const sidebar = normalized.slice(start, end)
  for (const removed of [
    'findTargetItem', 'preExisting', 'triggerAccountMenuAction', 'silentMenuTimer',
    'data-dtd-silent-menu', 'triggerNativeSettingsShortcut', 'dtd-native-profile-trigger',
    'dtd-btn-settings', 'dtd-btn-auth', 'dtd-btn-update',
  ]) assert.equal(sidebar.includes(removed), false, 'private account proxy remains: ' + removed)
})

test('native account footer is neither hidden by CSS nor mirrored into Delta DOM', () => {
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
  assert.doesNotMatch(theme, /dtd-footer-avatar-box|dtd-footer-actions|dtd-footer-btn/)
  assert.doesNotMatch(theme, /data-dtd-silent-menu|dtd-native-profile-trigger/)
  assert.match(normalized, /installHostSearch\(/, 'Delta-owned search remains available')
})

test('review pins reject attempts to restore the unapproved account-menu interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const begin = normalized.indexOf('function installSidebarCompatibility(')
  const end = normalized.indexOf('\ntype SearchTabId', begin)
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalized.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalized.slice(0, anchorOffset) +
    normalized.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelectorAll("[role=menuitem]")[0]?.click()')
  assert.notEqual(tampered, normalized)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
  const injectedCss = theme + '\n[class*="footArea"] { opacity: 0; }'
  const maliciousClient = emitted.split('\n').map(line => line.startsWith('const OWNED_CSS = ')
    ? 'const OWNED_CSS = ' + JSON.stringify(injectedCss) + ';' : line).join('\n')
  assert.throws(() => verifyApprovedZip3Client(maliciousClient, source),
    /retired Host-global CSS takeover in emitted theme/)
})

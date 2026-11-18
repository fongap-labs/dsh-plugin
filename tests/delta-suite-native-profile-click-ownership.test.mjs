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
const sidebarStart = normalized.indexOf('function installSidebarCompatibility(')
const sidebarEnd = normalized.indexOf('\ntype SearchTabId', sidebarStart)

test('native profile trigger and account actions remain owned by Harness', () => {
  assert.match(normalized, /function installSidebarCompatibility\(/)
  assert.doesNotMatch(normalized, /dtd-native-profile-trigger|triggerAccountMenuAction|triggerNativeSettingsShortcut/)
  assert.doesNotMatch(normalized, /dtd-footer-avatar-box|dtd-footer-actions|dtd-btn-auth/)
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart)
  assert.doesNotMatch(normalized.slice(sidebarStart, sidebarEnd), /dtd-btn-settings/,
    'removed native footer settings proxy must not return inside the sidebar adapter')
  assert.doesNotMatch(normalized, /silentMenuTimer|data-dtd-silent-menu|stopDesktopUpdates/)
  assert.doesNotMatch(theme, /dtd-native-profile-trigger|data-dtd-silent-menu/)
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
})

test('ZIP3 reviewed source rejects reintroducing native profile DOM click blocking', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalized.indexOf(anchor, sidebarStart)
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart && anchorOffset >= sidebarStart && anchorOffset < sidebarEnd,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalized.slice(0, anchorOffset) +
    normalized.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("[class*=\"_footer_\"] button")?.addEventListener("click", e => e.stopImmediatePropagation(), true)')
  assert.notEqual(tampered, normalized)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

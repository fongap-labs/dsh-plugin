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
  'data-delta-compat dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native profile trigger and account actions remain owned by Harness', () => {
  assert.match(normalized, /function installSidebarCompatibility\(/)
  assert.doesNotMatch(normalized, /dtd-native-profile-trigger|triggerAccountMenuAction|triggerNativeSettingsShortcut/)
  assert.doesNotMatch(normalized, /dtd-footer-avatar-box|dtd-footer-actions|dtd-btn-auth/)
  const sidebarStart = normalized.indexOf('function installSidebarCompatibility(')
  const sidebarEnd = normalized.indexOf('\ntype SearchTabId', sidebarStart)
  assert.ok(sidebarStart >= 0 && sidebarEnd > sidebarStart)
  assert.doesNotMatch(normalized.slice(sidebarStart, sidebarEnd), /dtd-btn-settings/,
    'removed native footer settings proxy must not return inside the sidebar adapter')
  assert.doesNotMatch(normalized, /silentMenuTimer|data-dtd-silent-menu|stopDesktopUpdates/)
  assert.doesNotMatch(theme, /dtd-native-profile-trigger|data-dtd-silent-menu/)
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
})

test('ZIP3 reviewed source rejects reintroducing native profile DOM click blocking', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Harness owns native footer controls, account state and update actions.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n      nativeTrigger?.addEventListener("click", e => e.stopImmediatePropagation(), true)')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

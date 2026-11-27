import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-ui-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-ui/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-ui/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const sidebarStart = normalized.indexOf('function installSidebarCompatibility(')
const sidebarEnd = normalized.indexOf('\ntype SearchTabId', sidebarStart)

test('native profile trigger and account actions remain owned by Harness', () => {
  assert.doesNotMatch(normalized, /function installSidebarCompatibility\(/)
  assert.doesNotMatch(normalized, /dtd-native-profile-trigger|triggerAccountMenuAction|triggerNativeSettingsShortcut/)
  assert.doesNotMatch(normalized, /dtd-footer-avatar-box|dtd-footer-actions|dtd-btn-auth/)
  assert.doesNotMatch(normalized, /silentMenuTimer|data-dtd-silent-menu|stopDesktopUpdates/)
  assert.doesNotMatch(theme, /dtd-native-profile-trigger|data-dtd-silent-menu/)
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
})

test('ZIP3 reviewed source rejects reintroducing native profile DOM click blocking', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    source + '\nfunction installSidebarCompatibility() {}\n'),
    /retired native Sidebar DOM interception in client source/)
})


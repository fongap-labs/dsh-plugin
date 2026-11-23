import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native profile trigger and account actions remain owned by Harness', () => {
  assert.doesNotMatch(source, /\binstallSidebarCompatibility\b/)
  for (const marker of ['dtd-native-profile-trigger', 'triggerAccountMenuAction',
    'triggerNativeSettingsShortcut', 'dtd-btn-auth', 'dtd-footer-avatar-box',
    'data-dtd-silent-menu', 'stopDesktopUpdates', 'onMenuClickCapture']) {
    assert.equal(source.includes(marker), false, 'removed native profile interception: ' + marker)
  }
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|dtd-native-profile-trigger/)
})

test('ZIP3 release rejects restored account-menu click blocking', () => {
  assert.doesNotMatch(source, /\b(?:installSidebarCompatibility|onMenuClickCapture|triggerAccountMenuAction)\b/)
  assert.match(source, /function installHostSearch\(/)
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
})

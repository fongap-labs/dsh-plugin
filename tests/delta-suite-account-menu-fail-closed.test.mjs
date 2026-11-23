import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('retired account menu guessing cannot intercept native commands', () => {
  assert.doesNotMatch(normalized, /function installSidebarCompatibility\(/)
  for (const removed of ['findTargetItem', 'preExisting', 'triggerAccountMenuAction',
    'silentMenuTimer', 'data-dtd-silent-menu', 'triggerNativeSettingsShortcut',
    'dtd-native-profile-trigger', 'dtd-btn-settings', 'dtd-btn-auth', 'dtd-btn-update']) {
    assert.equal(normalized.includes(removed), false, 'private account proxy remains: ' + removed)
  }
})

test('native account footer is neither hidden by CSS nor mirrored into Delta DOM', () => {
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
  assert.doesNotMatch(theme, /dtd-footer-avatar-box|dtd-footer-actions|dtd-footer-btn/)
  assert.doesNotMatch(theme, /data-dtd-silent-menu|dtd-native-profile-trigger/)
  assert.match(normalized, /installHostSearch\(/, 'Delta-owned search remains available')
})

test('review pins reject attempts to restore the unapproved account-menu interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    normalized + '\nfunction installSidebarCompatibility() {}\n'),
    /retired native Sidebar DOM interception in client source/)
  const injectedCss = theme + '\n[class*="footArea"] { opacity: 0; }'
  const maliciousClient = emitted.split('\n').map(line => line.startsWith('const OWNED_CSS = ')
    ? 'const OWNED_CSS = ' + JSON.stringify(injectedCss) + ';' : line).join('\n')
  assert.throws(() => verifyApprovedZip3Client(maliciousClient, source),
    /retired Host-global CSS takeover in emitted theme/)
})


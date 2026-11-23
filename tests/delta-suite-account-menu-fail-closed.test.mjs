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

test('native account and plugin menu clicks are Host-owned', () => {
  for (const token of ['findTargetItem', 'triggerAccountMenuAction', 'silentMenuTimer',
    'data-dtd-silent-menu', 'dtd-native-profile-trigger', 'dtd-btn-settings',
    'dtd-btn-auth', 'dtd-btn-update']) {
    assert.equal(source.includes(token), false, 'private account proxy remains: ' + token)
  }
  assert.doesNotMatch(theme, /\[class\*="footArea"\]|\[class\*="wtg9ga_footArea"\]/)
})

test('release guard refuses native account-menu interception', () => {
  assert.doesNotMatch(source, /\b(?:installSidebarCompatibility|onMenuClickCapture|triggerAccountMenuAction)\b/)
  assert.match(source, /function installHostSearch\(/)
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
})

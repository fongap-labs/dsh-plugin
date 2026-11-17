import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const theme = read('packages/dsh-delta-desktop/src/theme.css')
const from = source.indexOf('  const syncSettingsNav = (): void => {')
const to = source.indexOf('  const processHoverCards = (): void => {', from)

test('Settings navigation no longer rewrites native labels', () => {
  assert.ok(from >= 0 && to > from, 'Settings compatibility function must remain traceable')
  const settings = source.slice(from, to)
  assert.doesNotMatch(settings, /replaceButtonText\(/)
  assert.doesNotMatch(settings, /\\u8D26\\u53F7|\\u6A21\\u578B/)
  assert.match(settings, /Harness retains ownership of built-in Settings labels/)
  assert.match(settings, /data-dtd-nav-tail/, 'Agent preset layout marker is unchanged for later migration')
  assert.match(source, /const replaceButtonText = /, 'other legacy navigation behavior remains a separate task')
  assert.match(source, /syncSettingsNav\(\)\s+syncMenus\(\)/)
})

test('ZIP3 release verifier still blocks an unreviewed settings label rewrite', () => {
  const emitted = [
    'function installSidebarCompatibility() {}',
    'function installHostSearch() {}',
    'data-delta-compat dtd-native-search',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const mutated = source.replace('const labelText = (btn.querySelector?', 'replaceButtonText(btn, "x", "y")\n      const labelText = (btn.querySelector?')
  assert.notEqual(mutated, source, 'negative fixture must actually mutate the Settings code')
  assert.throws(() => verifyApprovedZip3Client(emitted, mutated), /approved compatibility adapter changed/)
})

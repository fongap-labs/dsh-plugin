import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-desktop/src/theme.css')
const start = normalizedSource.indexOf('        // Host retains ownership of profile clicks;')
const end = normalizedSource.indexOf('        const signedOutAttr =', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-native-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Harness profile trigger is not blocked by a Delta capture-click listener', () => {
  assert.ok(start >= 0 && end > start)
  const native = normalizedSource.slice(start, end)
  assert.doesNotMatch(native, /addEventListener|stopImmediatePropagation|preventDefault/)
  assert.match(native, /if \(nativeTrigger\) nativeTrigger\.classList/)
  assert.doesNotMatch(normalizedSource, /boundTriggers|isSilentMenuAllowed/)
  assert.match(normalizedSource, /const triggerAccountMenuAction =/)
  assert.match(normalizedSource, /data-dtd-silent-menu/, 'legacy Delta menu fallback remains separately tracked')
  assert.match(normalizedSource, /liveTrigger\.click\(\)/)
  assert.match(theme, /dtd-native-profile-trigger/, 'legacy footer styling unchanged in this batch')
})

test('ZIP3 pin rejects restoring the account capture-click interceptor', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Host retains ownership of profile clicks; legacy selector only locates Delta footer actions.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n        nativeTrigger?.addEventListener("click", e => e.stopImmediatePropagation(), true)')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

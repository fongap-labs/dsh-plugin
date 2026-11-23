import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(
  new URL('../packages/delta-suite/src/client.ts', import.meta.url)), 'utf8')
const extract = (begin, end) => {
  const start = source.indexOf(begin)
  const stop = source.indexOf(end, start + begin.length)
  assert.ok(start >= 0 && stop > start, 'live Search implementation must remain')
  return source.slice(start, stop)
}

test('no native Sidebar privacy mutation observer or hidden-row injection is installed', () => {
  assert.doesNotMatch(source, /const CHAT_CONTENT_SELECTOR =|shouldSyncPrivacyMutations/)
  assert.doesNotMatch(source, /hidePrivacyNode|hiddenSoleWorkspaceNodes/)
  assert.doesNotMatch(source, /function installSidebarCompatibility\(/)
  assert.match(source, /function installHostSearch\(/)
})

test('inline and palette search use one Host session snapshot per synchronous render', () => {
  const inline = extract('  const renderInline =', '\n  const onInlineInput =')
  const palette = extract('  const collectPaletteItems =', '\n  const ')
  assert.equal((inline.match(/sessions\.list\.getSnapshot\(\)/g) ?? []).length, 1)
  assert.match(inline, /Object\.values\(sessionById\)/)
  assert.match(inline, /sessionById\[item\.sessionId\]/)
  assert.match(palette, /const sessionById = sessions\.list\.getSnapshot\(\)\.byId/)
  assert.match(palette, /const sess = sessionById\[hit\.sessionId\]/)
})

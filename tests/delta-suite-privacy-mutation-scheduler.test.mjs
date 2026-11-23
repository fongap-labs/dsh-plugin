import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(
  new URL('../packages/delta-suite/src/client.ts', import.meta.url)), 'utf8')
const extract = (begin, end) => {
  const start = source.indexOf(begin)
  const stop = source.indexOf(end, start + begin.length)
  assert.ok(start >= 0 && stop > start, 'actual runtime implementation must exist')
  return source.slice(start, stop)
}

test('retired native Sidebar privacy mutation scheduler and scanners stay absent', () => {
  for (const symbol of [
    'createFrameScheduler', 'installSidebarCompatibility', 'shouldSyncPrivacyMutations',
    'syncPrivacyDom', 'hiddenPrivacyCmdNodes', 'hiddenSoleWorkspaceNodes',
    'CHAT_CONTENT_SELECTOR', 'GUARDED_CONTROL_SELECTOR',
  ]) assert.equal(source.includes(symbol), false, 'obsolete native DOM watcher remains: ' + symbol)
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

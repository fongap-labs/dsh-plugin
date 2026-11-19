import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'

const source = readFileSync(fileURLToPath(
  new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url)), 'utf8')

const extract = (begin, end) => {
  const start = source.indexOf(begin)
  const stop = source.indexOf(end, start + begin.length)
  assert.ok(start >= 0 && stop > start, 'actual runtime implementation must exist')
  return source.slice(start, stop)
}

const mutationSource = extract('  const CHAT_CONTENT_SELECTOR =', '\n  observer = typeof MutationObserver')
const hideSource = extract('  const previousVisibility =', '\n  const BLOCKED_COMMAND_RE =')

function load(sourceText, binding) {
  const ctx = {}
  const compiled = stripTypeScriptTypes(sourceText + '\nthis.loaded = ' + binding, { mode: 'strip' })
  runInNewContext(compiled, ctx, { timeout: 1000 })
  return ctx.loaded
}

const shouldSync = load(mutationSource, 'shouldSyncPrivacyMutations')
const hidePrivacyNode = load(hideSource, 'hidePrivacyNode')

function element({ chat = false, control = false, nestedControl = false } = {}) {
  return {
    nodeType: 1,
    closest(selector) {
      if (selector.includes('[data-chat-flow]')) return chat ? this : null
      return control ? this : null
    },
    matches() { return control },
    querySelector() { return nestedControl ? this : null },
  }
}
function textNode(parent) { return { nodeType: 3, parentElement: parent } }
function mutation(type, target, addedNodes = [], removedNodes = []) {
  return { type, target, addedNodes, removedNodes }
}

test('streamed text and ordinary chat additions do not trigger a full privacy DOM scan', () => {
  const chat = element({ chat: true })
  assert.equal(shouldSync([mutation('characterData', textNode(chat))]), false)
  assert.equal(shouldSync([mutation('childList', chat, [textNode(chat)])]), false)
  assert.equal(shouldSync([mutation('childList', chat, [element({ chat: true })])]), false)
  assert.equal(shouldSync([mutation('attributes', chat)]), false)
  assert.equal(shouldSync(Array.from({ length: 100 }, () =>
    mutation('characterData', textNode(chat)))), false)
})

test('session rows, native menus, command labels and all non-chat changes remain observable', () => {
  const chat = element({ chat: true })
  const control = element({ chat: true, control: true })
  assert.equal(shouldSync([mutation('childList', element(), [textNode(chat)])]), true)
  assert.equal(shouldSync([mutation('characterData', textNode(control))]), true)
  assert.equal(shouldSync([mutation('attributes', control)]), true)
  assert.equal(shouldSync([mutation('childList', chat, [control])]), true)
  assert.equal(shouldSync([mutation('childList', chat, [], [control])]), true)
  assert.equal(shouldSync([mutation('childList', chat, [element({ nestedControl: true })])]), true)
  assert.equal(shouldSync([mutation('characterData', textNode(chat)),
    mutation('childList', chat, [control])]), true,
    'one security-relevant mutation in a batch must not be dropped')
  assert.match(source, /attributeFilter:\s*\[[^\]]*'class'[^\]]*'aria-current'[^\]]*'aria-selected'[^\]]*'data-selected'/)
})

test('repeated hidden-row safety passes avoid redundant DOM writes', () => {
  const attrs = new Map()
  let writes = 0
  let hidden = false
  const node = {
    getAttribute(key) { return attrs.get(key) ?? null },
    setAttribute(key, value) { writes++; attrs.set(key, value) },
    get hidden() { return hidden },
    set hidden(value) { writes++; hidden = value },
  }
  const store = new Set()
  hidePrivacyNode(node, 'data-dtd-hidden-deleted', store)
  assert.equal(writes, 3)
  assert.equal(store.has(node), true)
  hidePrivacyNode(node, 'data-dtd-hidden-deleted', store)
  assert.equal(writes, 3, 'no duplicate attribute/property writes on a stable guarded row')
  // Host may re-show the node; the next pass must reassert the safety guard.
  attrs.delete('data-dtd-hidden-deleted')
  attrs.delete('aria-hidden')
  hidden = false
  hidePrivacyNode(node, 'data-dtd-hidden-deleted', store)
  assert.equal(writes, 6)
  assert.equal(hidden, true)
  assert.equal(attrs.get('aria-hidden'), 'true')
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

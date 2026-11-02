import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
const code = readFileSync(new URL('../packages/dsh-ui-delta/lib/client.js', import.meta.url), 'utf8')
function extract(start, end) {
  const a = code.indexOf(start), b = code.indexOf(end, a)
  assert.ok(a >= 0 && b > a)
  return code.slice(a, b)
}
it('replaces the whole editable draft instead of inserting at the start', () => {
  const draft = { isContentEditable: true, textContent: '/search news', focus() {} }
  let collapsed = false, selected = false
  const range = { selectNodeContents: el => { assert.equal(el, draft); selected = true }, collapse: () => { collapsed = true } }
  const context = {
    document: { createRange: () => range, execCommand: (_command, _ui, text) => { draft.textContent = collapsed ? text + draft.textContent : text; return true } },
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  }
  runInNewContext(extract('const writeComposer =', '// Web search uses') + ';globalThis.write = writeComposer;', context)
  assert.equal(context.write(draft, 'results'), true)
  assert.equal(selected, true)
  assert.equal(draft.textContent, 'results')
})
it('shows only ready balance data and clears stale hints', () => {
  const attributes = new Map()
  const trigger = { removeAttribute() {}, setAttribute: (key, value) => attributes.set('trigger:' + key, value) }
  const account = { removeAttribute: key => attributes.delete(key), setAttribute: (key, value) => attributes.set(key, value), querySelector: () => trigger, querySelectorAll: () => [] }
  let balance = { status: 'ready', value: [{ balance: '14.36', currency: 'CNY' }], bonusWallets: [{ balance: '0.09', currency: 'CNY' }] }
  const context = { document: { querySelector: () => account }, signedIn: () => true, t: text => text,
    launcherOps: () => ({ hooks: { account: { getSnapshot: () => ({ details: { balance } }) } } }) }
  runInNewContext(extract('const formatAccountBalance =', 'const onAvatarActivate =') + ';globalThis.sync = syncBalance;', context)
  context.sync()
  assert.match(attributes.get('data-ens-balance'), /14\.36/)
  assert.match(attributes.get('data-ens-balance'), /0\.09/)
  balance = { status: 'loading' }
  context.sync()
  assert.equal(attributes.has('data-ens-balance'), false)
})
it('preserves native avatar click and keyboard activation while updating the balance', () => {
  class Element { closest() { return this } }
  class KeyboardEvent {
    constructor(key) { this.key = key; this.target = new Element() }
    preventDefault() { this.prevented = true }
    stopImmediatePropagation() { this.stopped = true }
  }
  let refreshes = 0
  const context = { Element, KeyboardEvent, syncBalance: () => refreshes++ }
  runInNewContext(extract('const onAvatarActivate =', "['pointerdown', 'mousedown', 'click', 'keydown'].forEach") + ';globalThis.activate = onAvatarActivate;', context)
  for (const key of ['Enter', ' ', 'ArrowDown']) {
    const event = new KeyboardEvent(key)
    context.activate(event)
    assert.equal(event.prevented, undefined)
    assert.equal(event.stopped, undefined)
  }
  const mouse = { target: new Element(), preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } }
  context.activate(mouse)
  assert.equal(mouse.prevented, undefined)
  assert.equal(mouse.stopped, undefined)
  const tab = new KeyboardEvent('Tab')
  context.activate(tab)
  assert.equal(tab.prevented, undefined)
  assert.equal(refreshes, 4)
})

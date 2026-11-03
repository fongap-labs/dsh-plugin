import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')

describe('Delta account settings and footer regressions', () => {
  it('renames the actual nested account navigation text without replacing its host cell', () => {
    assert.match(src, /\['账户与余额'\]: '账户详情'/)
    assert.match(src, /document\.createTreeWalker\(el, NodeFilter\.SHOW_TEXT\)/)
    assert.match(src, /node\.nodeValue = \(node\.nodeValue \|\| ''\)\.replace\(value, next\)/)
  })

  it('defaults built-in DeepSeek models to visible; new switch is an opt-out', () => {
    assert.match(src, /id: 'hideAccountModels', zh: '关闭 DeepSeek 自带模型'/)
    assert.match(src, /id: 'hideAccountModels'[^\n]*defaultOn: false/)
    assert.match(src, /const isVisible = !flagOn\('hideAccountModels', false\)/)
    assert.doesNotMatch(src, /id: 'accountModels',/)
    assert.doesNotMatch(src, /\.accountModels === true/)
  })

  it('keeps avatar display-only and preserves independent settings and auth actions', () => {
    assert.match(src, /\.\_5Qcc8a_root, \.\_5Qcc8a_anchor, \.\_5Qcc8a_trigger \{ pointer-events: auto !important; cursor: default !important;/)
    assert.match(src, /trigger\?\.setAttribute\('aria-disabled', 'true'\)/)
    assert.match(src, /activateAccountMenuForFooter\(trig\)/)
    assert.match(src, /activateAccountMenuForFooter\(account as HTMLElement\)/)
    assert.match(src, /iconBtn\('settings', ICON_SETTINGS/)
    assert.match(src, /iconBtn\('account', ICON_LOGIN/)
    assert.match(src, /avatarActivationEvents\.forEach\(type => document\.removeEventListener/)
  })
})

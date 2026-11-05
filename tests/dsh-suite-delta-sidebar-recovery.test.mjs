import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')

test('native session list is never replaced with a recovery duplicate', () => {
  assert.doesNotMatch(source, /sessionListRecovery|ens-sidebar-recovery|data-delta-sidebar-recovery/)
  assert.doesNotMatch(source, /恢复的对话列表|Recovered sessions/)
  assert.match(source, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.doesNotMatch(source, /location\.reload\(/)
})

test('Host-owned search and sessions remain React-managed', () => {
  assert.doesNotMatch(source, /mountSearchDock|restoreNativeSearch|dock\.appendChild\(live\)/)
  assert.doesNotMatch(source, /\.GAkraW_sectionHeader \.GAkraW_searchSlot \{ opacity: 0/)
  assert.match(source, /The Host renders and reconciles its original session list/)
})

test('one focus border and a flat image generation form', () => {
  assert.match(source, /\.ens-ui-input:focus-visible, \.ens-ui-select:focus-visible, \.ens-ui-textarea:focus-visible \{[^}]*border-width: 2px;[^}]*outline: none !important; box-shadow: none !important;/)
  assert.doesNotMatch(source, /box-shadow: 0 0 0 1px var\(--ens-color-ring\)/)
  assert.match(source, /className: 'ens-privacy ens-image-generation'/)
  assert.match(source, /key: 'save', className: 'ens-image-actions'/)
  assert.match(source, /key: 'generate-row', className: 'ens-image-actions ens-image-generate-row'/)
})

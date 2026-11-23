import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const theme = read('packages/delta-suite/src/theme.css')
const extras = read('packages/delta-suite/src/feature-extras.css')
const client = read('packages/delta-suite/src/client.ts')
const defined = new Set([...theme.matchAll(/(--dtd-[a-z0-9-]+)\s*:/g)].map(x => x[1]))

test('Delta-owned features never fall back to Host-native semantic CSS variables', () => {
  assert.doesNotMatch(extras, /--dsw-[a-z0-9-]+/)
  assert.doesNotMatch(extras, /color:\s*inherit\s*;/)
  const used = new Set([...extras.matchAll(/var\((--dtd-[a-z0-9-]+)/g)].map(x => x[1]))
  assert.ok(used.size >= 12, 'feature styles must consume semantic tokens')
  for (const key of used) assert.ok(defined.has(key), 'missing Delta palette token: ' + key)
})

test('light and dark Delta palettes each cover critical interaction and popup color tokens', () => {
  const darkStart = theme.indexOf('/* Core Palette Tokens (Dark) */')
  const light = theme.slice(0, darkStart)
  const dark = theme.slice(darkStart, theme.indexOf('/* Delta-owned popup', darkStart))
  for (const key of ['--dtd-brand', '--dtd-bg-surface', '--dtd-fg-primary',
    '--dtd-fg-secondary', '--dtd-fg-muted', '--dtd-fg-danger',
    '--dtd-border', '--dtd-popup-bg', '--dtd-popup-shadow',
    '--dtd-modal-bg', '--dtd-input-border-focus']) {
    assert.ok(new RegExp(key + '\\s*:').test(light), key + ' missing light mode')
    if (!new RegExp(key + '\\s*:').test(dark)) {
      assert.ok(new RegExp(key + '\\s*:').test(light), key + ' must inherit its light semantic alias')
    }
  }
  assert.match(theme, /:root\[data-delta-ui="delta"\]/)
  assert.match(theme, /data-ds-dark-theme/)
})

test('published Theme API retains reversible ownership without global Host CSS takeover', () => {
  assert.match(client, /theme\.overrideTokens/)
  assert.match(client, /themeOverrideRelease/)
  assert.doesNotMatch(theme, /\[role=["'](?:menu|menuitem|tooltip|listbox)["']\]/)
  assert.doesNotMatch(extras, /\[class[*~^$|]?=/)
})

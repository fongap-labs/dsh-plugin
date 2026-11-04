import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const start = client.indexOf('const STYLESHEET = `')
const end = client.indexOf('\n`;', start)
const css = client.slice(start, end)

test('legacy button hook uses a single shadcn-style semantic control base', () => {
  assert.match(css, /\.ens-ui-button, \.ens-pill-btn \{/)
  assert.match(css, /\.ens-pill-btn \{ flex: none; \}/)
  assert.equal((css.match(/^\.ens-pill-btn:hover/gm) || []).length, 0)
  assert.equal((css.match(/^\.ens-pill-btn:disabled/gm) || []).length, 0)
  assert.match(css, /\.ens-ui-button--outline/)
  assert.match(css, /\.ens-ui-button--destructive/)
  assert.match(css, /\.ens-ui-input, \.ens-ui-select, \.ens-ui-textarea/)
})

test('keyboard-only focus and reduced motion do not override the entire Host', () => {
  assert.equal((css.match(/^\.ens-folder-browser-group-head:focus-visible,/gm) || []).length, 1)
  assert.match(css, /\.ens-folder-browser-open:focus-visible/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{/)
  assert.match(css, /:is\(\.ens-settings, \.ens-standalone-settings-modal, \.ens-folder-browser\) \* \{/)
  assert.doesNotMatch(css, /^\s*\* \{ transition-duration:/gm)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(css, /outline-color: Highlight/)
})

test('folder controls and dialogs remain usable in compact windows', () => {
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /\.ens-folder-actions \{ flex: 1 1 100%; \}/)
  assert.match(css, /\.ens-modal-card \{ width: 100%; max-height: calc\(100dvh - 8px\); \}/)
  assert.match(client, /const row = \(m: ModuleDef\) => h\('div', \{/)
  assert.match(client, /role: 'switch'/)
  assert.match(client, /'aria-checked': enabled\(m\)/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const start = client.indexOf('const STYLESHEET = `')
const end = client.indexOf('\n`;', start)
const css = client.slice(start, end)

test('existing semantic control base stays consistent', () => {
  assert.match(css, /\.ens-ui-button, \.ens-pill-btn \{/)
  assert.match(css, /\.ens-ui-button--outline/)
  assert.match(css, /\.ens-ui-button--destructive/)
  assert.match(css, /\.ens-ui-input, \.ens-ui-select, \.ens-ui-textarea/)
})

test('keyboard focus and reduced motion stay scoped to Delta components', () => {
  assert.match(css, /\.ens-sidebar-search-input:focus-visible/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{/)
  assert.doesNotMatch(css, /^\s*\* \{ transition-duration:/gm)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(css, /outline-color: Highlight/)
})

test('compact full-page layout keeps settings and composer accessible', () => {
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /\.ens-modal-card \{ width: 100%; max-height: calc\(100dvh - 8px\); \}/)
  assert.match(css, /\.an3WzG_header \{ min-height: 52px; padding-inline: 12px; \}/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
})

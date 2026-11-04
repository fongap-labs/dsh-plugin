import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const start = client.indexOf('const STYLESHEET = `')
const end = client.indexOf('\n`;', start)
assert.ok(start >= 0 && end > start, 'Delta stylesheet should exist')
const css = client.slice(start, end)

const occurrences = (pattern) => [...css.matchAll(pattern)].length

it('keeps one canonical selector for duplicate footer and menu rules', () => {
  assert.equal(occurrences(/^\.wtg9ga_collapsed \.wtg9ga_footArea\s*\{/gm), 1)
  assert.equal(occurrences(/^\.wtg9ga_collapsed \.ens-foot-actions\s*\{/gm), 1)
  assert.equal(occurrences(/^\.ens-menu\s*\{/gm), 1)
  assert.equal(occurrences(/^\.ens-menu-item\[aria-selected="true"\]\s*\{/gm), 1)
  assert.equal(occurrences(/^\.ens-modal-backdrop\s*\{/gm), 2)
  assert.equal(occurrences(/^\.ens-modal-card\s*\{/gm), 2)
})

it('uses semantic colors and elevations on canonical surfaces', () => {
  assert.match(css, /\.ens-menu\s*\{[^}]*background: var\(--ens-color-popover\); box-shadow: var\(--ens-shadow-md\)/)
  assert.match(css, /\.ens-modal-card\s*\{[^}]*background: var\(--ens-color-card\);[^}]*box-shadow: var\(--ens-shadow-lg\)/)
  assert.match(css, /\.ens-menu-item\[aria-selected="true"\]\s*\{[^}]*color: var\(--ens-color-accent-foreground\)/)
})

it('preserves theming, responsive overrides, and reduced motion behavior', () => {
  assert.ok(client.includes("'--ens-color-primary': { light: '#286F78', dark: '#60B4BF' }"))
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.wtg9ga_collapsed \.ens-foot-actions\s*\{[^}]*margin-left: 0/)
  assert.doesNotMatch(css, /@media \(prefers-reduced-motion: no-preference\)/)
})

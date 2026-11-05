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
  assert.equal(occurrences(/^\.ens-modal-backdrop\s*\{/gm), 1)
  assert.equal(occurrences(/^\.ens-modal-card\s*\{/gm), 1)
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

it('keeps the native host selectors in one canonical rule per surface', () => {
  const canonical = [
    '.wnFoaW_sessionRow',
    '.wtg9ga_logoRow',
    '._5Qcc8a_root',
    '.wtg9ga_footArea',
    '.GAkraW_sectionHeader',
    '.GAkraW_sectionLabel',
    '.AnXs9G_panel',
    '.ens-account-glyph',
  ]
  for (const selector of canonical) {
    const escaped = selector.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')
    assert.equal(occurrences(new RegExp('^' + escaped + '\\s*\\{', 'gm')), 1, selector)
  }
  assert.equal(occurrences(/^@media \(prefers-reduced-motion: reduce\)\s*\{/gm), 1)
})

it('retains canonical host behavior and light-dark contrast tokens', () => {
  assert.match(css, /\.wnFoaW_sessionRow\s*\{[^}]*height: 34px; border-radius: var\(--dsw-radius-sm\)/)
  assert.match(css, /\.wtg9ga_logoRow\s*\{[^}]*height: 6px;[^}]*order: 1/)
  assert.match(css, /\.wtg9ga_footArea\s*\{[^}]*position: relative; order: 6/)
  assert.match(css, /\.GAkraW_sectionHeader\s*\{[^}]*justify-content: flex-start/)
  assert.match(css, /\.GAkraW_sectionHeader \.GAkraW_search:focus-within/)
  assert.doesNotMatch(css, /\.ens-search-dock/)
  assert.match(css, /\.AnXs9G_panel\s*\{[^}]*animation: ensFade/)
  assert.match(css, /\.ens-account-glyph\s*\{[^}]*pointer-events: none/)
  assert.match(css, /\.wtg9ga_collapsed \.ens-foot-actions\s*\{[^}]*margin-left: 0/)
  assert.ok(client.includes("'--ens-color-primary': { light: '#286F78', dark: '#60B4BF' }"))
  assert.ok(client.includes("'--ens-color-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' }"))
})

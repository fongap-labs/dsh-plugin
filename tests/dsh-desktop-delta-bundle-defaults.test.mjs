import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const patch = readFileSync(new URL('../packages/dsh-desktop-delta/cordis.patch.yml', import.meta.url), 'utf8')

it('defaults the coding view on and removes the official Session Log contributor', () => {
  assert.match(patch, /- id: ui-settings\r?\n\s+config:\r?\n\s+enabled: true/)
  assert.match(patch, /- id: session-log-deepseek\r?\n\s+disabled: true/)
  assert.doesNotMatch(patch, /- id: session-log-deepseek\r?\n\s+config:/)
})

it('keeps the existing web search routing declarations', () => {
  assert.match(patch, /- id: web-search-deepseek\r?\n\s+disabled: true/)
  assert.match(patch, /- id: web-deepseek-api\r?\n\s+disabled: true/)
  assert.match(patch, /searchProvider: delta-duckduckgo/)
  assert.match(patch, /fetchProvider: http/)
})

it('disables upstream optional telemetry, inventory and desktop analytics collection', () => {
  assert.match(patch, /- id: session-telemetry-otel\r?\n\s+config:\r?\n\s+mode: DISABLED/)
  assert.match(patch, /- id: plugin-package-inventory-deepseek\r?\n\s+config:\r?\n\s+enabled: false/)
  assert.match(patch, /- id: product-analytics\r?\n\s+config:\r?\n\s+enabled: false/)
})

import { it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const manifest = readFileSync(new URL('../packages/dsh-suite-delta/package.json', import.meta.url), 'utf8')
const start = client.indexOf('function DeltaSettings()')
const end = client.indexOf("ctx.effect(() => ctx.slots.inject('settings.section'", start)
const settings = client.slice(start, end)

it('locks both original brand colors and accessible foreground pairs', () => {
  assert.ok(client.includes("'--ens-color-primary': { light: '#286F78', dark: '#60B4BF' }"))
  assert.ok(client.includes("'--dsw-alias-brand-primary': { light: '#286F78', dark: '#60B4BF' }"))
  assert.ok(client.includes("'--ens-color-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' }"))
})

it('renders Delta React settings using one set of semantic primitives', () => {
  for (const name of ['UiButton', 'UiCard', 'UiBadge', 'UiInput', 'UiTextarea', 'UiSelect']) {
    assert.ok(client.includes('const ' + name + ' = (props: UiProps)'), name + ' definition missing')
    assert.ok(settings.includes('h(' + name + ','), name + ' unused in settings')
  }
  assert.ok(client.includes("const React = require('react')"))
  assert.doesNotMatch(manifest, /"(?:react-dom|tailwindcss|@base-ui\/react|@radix-ui\/react-dialog)"\s*:/)
})

it('unifies the fallback DOM and annotation UI with the same component surface classes', () => {
  assert.ok(client.includes("card.className = 'ens-modal-card ens-ui-card'"))
  assert.ok(client.includes("privacy.className = 'ens-privacy ens-ui-card'"))
  assert.ok(client.includes("hiddenInput.className = 'jrmgQW_input ens-ui-input'"))
  assert.ok(client.includes("panel.className = 'ens-anno-panel ens-ui-card'"))
  assert.ok(client.includes("input.className = 'ens-anno-input ens-ui-textarea'"))
  assert.ok(client.includes("chip.className = 'ens-anno-chip ens-ui-badge ens-ui-badge--outline'"))
  assert.match(client, /ghost\.className = '[^']*ens-ui-button--outline'/)
  assert.match(client, /primary\.className = '[^']*ens-ui-button--default'/)
})

it('keeps native form inputs, focus and motion accessible', () => {
  assert.ok(client.includes("const rawTypes = ['checkbox', 'radio', 'range', 'hidden', 'file']"))
  assert.ok(client.includes(".ens-ui-input:focus-visible"))
  assert.ok(client.includes(".ens-ui-button:focus-visible"))
  assert.ok(client.includes(".ens-settings .ens-switch:focus-visible"))
  assert.ok(client.includes("@media (prefers-reduced-motion: reduce)"))
  assert.ok(client.includes("@media (max-width: 720px)"))
  assert.ok(client.includes("--ens-shadow-lg"))
  assert.ok(client.includes("--ens-color-ring"))
})

it('does not seize native host controls or change approval signatures', () => {
  assert.ok(client.includes("ctx.slots.inject('settings.section'"))
  assert.ok(client.includes("ctx.slots.inject('conversation.composer'"))
  assert.ok(client.includes("signature: JSON.stringify([approval.toolName, event.data.arguments, approval.reason ?? null])"))
  assert.ok(client.includes("const STYLESHEET = `"))
  assert.ok(client.includes('.wnFoaW_sessionRow.wnFoaW_selected'))
})

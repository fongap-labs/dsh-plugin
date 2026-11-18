import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const from = normalizedSource.indexOf('        // Native session context menu order, separators, accessible text, and danger styling belong to Harness.\n')
const to = normalizedSource.indexOf('        continue\n      }\n\n    }\n  }\n\n  const syncSettingsNav', from)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native session menu action labels and destructive styling stay Host-owned', () => {
  assert.ok(from >= 0 && to > from, 'session menu source boundaries are traceable')
  const menu = normalizedSource.slice(from, to)
  assert.doesNotMatch(menu, /(?:labelSpan|el)\.textContent\s*=/)
  assert.doesNotMatch(menu, /Open in app|\\u5728\\u5e94\\u7528\\u4e2d\\u6253\\u5f00/)
  assert.match(menu, /accessible text, and danger styling belong to Harness/)
  assert.doesNotMatch(menu, /data-danger|dtd-menu-danger|(?:labelSpan|el)\.textContent\s*=/)
  assert.match(normalizedSource, /onMenuClickCapture/)
  assert.match(normalizedSource, /Show in folder/, 'host action remains recognized by menu classification')
  assert.match(normalizedSource, /LOCKED_MUTATION_LABELS/)
})

test('ZIP3 approved client region rejects reintroduced native label interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Native session context menu order, separators, accessible text, and danger styling belong to Harness.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n          el.textContent = "Open in app"')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

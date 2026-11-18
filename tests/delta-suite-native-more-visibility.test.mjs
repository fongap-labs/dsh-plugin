import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const css = read('packages/dsh-delta-suite/src/theme.css')
const emitted = (style = css) => [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(style) + ';',
].join('\n')

test('Harness More remains visible; Delta does not hide the native navigation action', () => {
  assert.doesNotMatch(source, /hiddenMoreElements|legacy More visibility is reviewed separately/)
  assert.doesNotMatch(source, /(?:rawText|aria)\s*===\s*['"]More['"]/)
  assert.doesNotMatch(css, /nav\s*>\s*:has\(button:is\(\[aria-label="(?:More|\\0066F4\\00591A)"\]/)
  assert.match(css, /6\.2 Navigation Rows: Harness retains the native More action/)
  assert.match(css, /\[class\*="wtg9ga_moreMenu"\]/, 'unrelated native menu cosmetics remain')
  assert.match(source, /function installSidebarCompatibility\(/)
  assert.match(source, /const syncMenus = /)
})

test('release guard accepts reviewed More restoration and rejects unreviewed client/theme changes', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const mutatedClient = source.replace(
    '      // Harness owns native footer controls, account state and update actions.',
    '      const nativeMore = document.querySelector("button")\n      nativeMore?.style?.setProperty("display", "none")',
  )
  assert.notEqual(mutatedClient, source)
  assert.throws(() => verifyApprovedZip3Client(emitted(), mutatedClient), /approved compatibility adapter changed/)
  const mutatedTheme = css.replace(
    '/* 6.2 Navigation Rows: Harness retains the native More action. */',
    '/* More should not be removed */',
  )
  assert.notEqual(mutatedTheme, css)
  assert.throws(() => verifyApprovedZip3Client(emitted(mutatedTheme), source), /approved theme differs/)
})

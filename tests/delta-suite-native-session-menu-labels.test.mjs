import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)
const compatibility = normalizedSource.slice(begin, end)

test('native session menu labels and destructive styling stay Harness-owned', () => {
  assert.ok(begin >= 0 && end > begin, 'compatibility source boundaries are traceable')
  assert.doesNotMatch(compatibility, /syncMenus|syncSettingsNav|data-dtd-nav-tail/)
  assert.doesNotMatch(compatibility, /(?:labelSpan|el)\.textContent\s*=/)
  assert.doesNotMatch(compatibility, /dtd-menu-danger|(?:labelSpan|el)\.textContent\s*=/)
  assert.match(compatibility, /onMenuClickCapture/)
  assert.match(compatibility, /LOCKED_MUTATION_LABELS/)
})

test('ZIP3 approved client region rejects reintroduced native label interception', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = 'const sync = (): void => {'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n    document.querySelector("[role=menuitem]").textContent = "Open in app"')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

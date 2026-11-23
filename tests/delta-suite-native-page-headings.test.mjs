import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')

test('Delta Suite leaves built-in Harness page headings in native ownership', () => {
  assert.doesNotMatch(source, /\b(?:syncPageHeadings|mutatedPageHeadings)\b/)
  assert.doesNotMatch(source, /PluginManagerPage\|TaskManagerPage\|pageHeading/)
  assert.doesNotMatch(source, /syncSettingsNav|syncMenus|data-dtd-nav-tail/)
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('release integrity pin remains active for the remaining ZIP3 compatibility area', () => {
  const emitted = [
    'function installSidebarCompatibility() {}',
    'function installHostSearch() {}',
    'data-delta-compat dtd-host-search',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    source.replace('function installSidebarCompatibility(', 'function installSidebarCompatibility(/* unreviewed */')),
    /approved compatibility adapter changed/)
})

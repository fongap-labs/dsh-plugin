import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url)), 'utf8')
const theme = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/theme.css', import.meta.url)), 'utf8')

test('Delta Suite does not scan or rewrite Harness native running status text nodes', () => {
  for (const removed of [
    'RUNNING_STATUS_HOST_SELECTOR', 'visitElementTextNodes',
    'normalizeRunningStatusNodesInDoc', 'normalizeRunningDomText', 'rewrittenRunningTexts',
  ]) assert.equal(source.includes(removed), false, removed)
  assert.match(source, /Native status text stays under Harness ownership/)
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('approved ZIP3 region hash is updated without disabling review protection', () => {
  const emitted = [
    'function installSidebarCompatibility() {}',
    'function installHostSearch() {}',
    'dtd-host-search data-delta-compat',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    source.replace('function installSidebarCompatibility(', 'function installSidebarCompatibility(/* unexpected */')),
    /approved compatibility adapter changed/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-ui-release.mjs'

const source = readFileSync(fileURLToPath(new URL('../packages/delta-ui/src/client.ts', import.meta.url)), 'utf8')
const theme = readFileSync(fileURLToPath(new URL('../packages/delta-ui/src/theme.css', import.meta.url)), 'utf8')

test('Delta UI does not scan or rewrite Harness native running status text nodes', () => {
  for (const removed of [
    'RUNNING_STATUS_HOST_SELECTOR', 'visitElementTextNodes',
    'normalizeRunningStatusNodesInDoc', 'normalizeRunningDomText', 'rewrittenRunningTexts',
  ]) assert.equal(source.includes(removed), false, removed)
  assert.doesNotMatch(source, /data-delta-compat-status/,
    'legacy native status marker must not return')
  assert.doesNotMatch(source, /function installSidebarCompatibility\(/)
})

test('approved ZIP3 region hash is updated without disabling review protection', () => {
  const emitted = [
    'function installHostSearch() {}',
    'dtd-host-search',
    'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
  ].join('\n')
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    source + '\nfunction installSidebarCompatibility() {}\n'),
    /retired native Sidebar DOM interception in client source/)
})

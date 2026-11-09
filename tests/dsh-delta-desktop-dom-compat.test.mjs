import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/client.ts', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(new URL('../projects/dsh-delta-desktop/feature-readiness.json', import.meta.url)), 'utf8'))

test('Delta Desktop does not take over private Host sidebar DOM', () => {
  assert.doesNotMatch(source, /installSidebarCompatibility|data-sidebar-scrollport|data-sidebar-workspace-header/)
  assert.doesNotMatch(source, /querySelector<.*>\('button\[class\*="newSession"/)
  assert.doesNotMatch(source, /groupExpansion.*dsh\.workspace\.view/)
})

test('unverified Host UI capabilities block release', () => {
  for (const capability of ['sidebar_search_placement', 'sidebar_navigation_order', 'workspace_initial_collapse']) {
    assert.equal(readiness.required[capability], false)
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/client.ts', import.meta.url)), 'utf8')
const style = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/theme.css', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(new URL('../projects/dsh-delta-desktop/feature-readiness.json', import.meta.url)), 'utf8'))

test('Delta Desktop does not take over private Host sidebar DOM', () => {
  assert.doesNotMatch(source, /installSidebarCompatibility|data-sidebar-workspace-header/)
  assert.doesNotMatch(source, /querySelector<.*>\('button\[class\*="newSession"/)
  assert.doesNotMatch(style, /data-delta-compat|dtd-native-search|dtd-native-new-session/)
  assert.match(source, /sessions\.search\(query, aborter\.signal\)/)
  assert.match(source, /navigation\.openSession\(match\.id\)/)
  assert.match(source, /sessionOpenability\(match\.id\)/)
  assert.match(source, /snapshot\.archivedSessionIds\.includes\(sessionId\)/)
  assert.match(source, /workspaceReady\(snapshot\)/)
  assert.match(source, /sessions\.list\.subscribe/)
  assert.match(source, /bindResultKeys\(button\)/)
  assert.match(source, /if \(shell\.parentElement !== null\) resetSearch\(\)/)
  assert.match(source, /viewport\.insertBefore\(shell, viewport\.firstElementChild\)/)
  assert.doesNotMatch(source, /viewport\?\.querySelector\('nav'\)/)
  assert.match(source, /navigation\.openWorkspace\(workspace\.id\)/)
  assert.doesNotMatch(source, /textContent\s*=\s*(?:item\.|workspace\.)path/)
  assert.doesNotMatch(source, /HTMLInputElement\.prototype|hostButton\.click\(|nativeNew\.click\(/)
  assert.doesNotMatch(source, /groupExpansion.*dsh\.workspace\.view/)
  assert.doesNotMatch(source, /workspaces\.delete\s*=|originalDelete\.call/)
})

test('unverified Host UI capabilities block release', () => {
  for (const capability of ['sidebar_search_placement', 'sidebar_navigation_order', 'workspace_initial_collapse']) {
    assert.equal(readiness.required[capability], false)
  }
})

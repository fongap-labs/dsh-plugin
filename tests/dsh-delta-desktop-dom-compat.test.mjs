import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/client.ts', import.meta.url)), 'utf8')
const style = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/theme.css', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(new URL('../projects/dsh-delta-desktop/feature-readiness.json', import.meta.url)), 'utf8'))

test('ZIP3 owns the sidebar, SearchPalette and modal chrome without legacy competing UI', () => {
  assert.match(source, /function installSidebarCompatibility/)
  assert.match(source, /function installHostSearch/)
  assert.match(source, /SearchTabId/)
  assert.match(source, /syncModalChromeOverlay/)
  assert.match(source, /data-delta-modal-open/)
  assert.match(source, /isCmdK/)
  assert.match(source, /session-delete-ungrouped/)
  assert.doesNotMatch(source, /dtd-search-dialog-backdrop|openSearchDialog\(/)
  assert.match(style, /dtd-search-/)
})
test('ZIP3 session operations retain Host permission and privacy boundaries', () => {
  assert.match(source, /deltaFeatures\.isLocked/)
  assert.match(source, /delta\/protected-default-workspace/)
  assert.match(source, /installClientPrivacyGuards/)
  assert.match(source, /navigator/)
  assert.doesNotMatch(source, /app\.asar/)
})
test('unverified host-only capabilities remain unclaimed until Windows validation', () => {
  for (const capability of ['sidebar_search_placement', 'sidebar_navigation_order', 'workspace_initial_collapse']) {
    assert.equal(readiness.required[capability], false)
  }
})

test('workspace TOTP lock and Vision Bridge stay localized and capability-gated', () => {
  const en = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/locale/en.json', import.meta.url)), 'utf8'))
  const zh = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/locale/zh.json', import.meta.url)), 'utf8'))
  const host = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-desktop/src/host-vision.ts', import.meta.url)), 'utf8')
  assert.equal(en.workspaceMenu.lockWorkspace, 'Lock workspace')
  assert.equal(zh.workspaceMenu.lockWorkspace, '\u9501\u5b9a\u5de5\u4f5c\u533a')
  assert.ok(en.visionBridge.title && zh.visionBridge.title)
  assert.match(source, /installClientVisionBridge/)
  assert.match(source, /isWorkspaceLocked/)
  assert.match(host, /installHostVisionOps/)
  assert.match(host, /resolveVisionAccount/)
  // Source-level tests never claim an unverified Windows Host acceptance.
  assert.equal(readiness.required.workspace_initial_collapse, false)
})

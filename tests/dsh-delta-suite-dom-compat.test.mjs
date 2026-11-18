import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url)), 'utf8')
const style = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/theme.css', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(new URL('../projects/dsh-delta-suite/feature-readiness.json', import.meta.url)), 'utf8'))

test('ZIP3 owns the sidebar, SearchPalette and modal chrome without legacy competing UI', () => {
  assert.match(source, /function installSidebarCompatibility/)
  assert.match(source, /function installHostSearch/)
  assert.match(source, /SearchTabId/)
  assert.match(source, /syncModalChromeOverlay/)
  assert.match(source, /data-delta-modal-open/)
  assert.doesNotMatch(source, /isCmdK|onGlobalKeyDown/)
  assert.match(source, /kbdHint\.textContent = 'Enter'/)
  assert.match(source, /session-delete-ungrouped/)
  assert.doesNotMatch(source, /dtd-search-dialog-backdrop|openSearchDialog\(/)
  assert.match(style, /dtd-search-/)
})
test('ZIP3 session operations retain Host permission and privacy boundaries', () => {
  assert.match(source, /deltaFeatures\.isLocked/)
  assert.match(source, /return 'protected-default-workspace'/)
  assert.match(source, /new Error\('delta\/' \+ reason\)/)
  assert.match(source, /installWorkspaceMutationGuards/)
  assert.match(source, /installClientPrivacyGuards/)
  assert.match(source, /navigator/)
  assert.doesNotMatch(source, /app\.asar/)
})
test('unverified host-only capabilities remain unclaimed until Windows validation', () => {
  for (const capability of ['sidebar_search_placement', 'sidebar_navigation_order', 'workspace_initial_collapse']) {
    assert.equal(readiness.required[capability], false)
  }
})

test('native workspace expansion stays Host-owned until an official capability exists', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('\ntype SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  assert.doesNotMatch(compatibility, /dsh\.workspace\.view\.v5/)
  assert.doesNotMatch(compatibility, /\bpersistedExpansion\b/)
  assert.doesNotMatch(compatibility, /\brow\.click\(\)/)
  assert.equal(readiness.required.workspace_initial_collapse, false)
})

test('native new-session button remains visible and Harness-owned', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('\ntype SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  for (const legacy of ['dtd-native-new-session', 'dtd-new-session-icon', 'nativeNew',
    "mounted.get('newSession')", 'newSession.addEventListener',
    'button[class*="newSession"]', 'wtg9ga_newSession']) {
    assert.equal(compatibility.includes(legacy), false, 'legacy new-session mirroring: ' + legacy)
  }
  for (const legacy of ['dtd-native-new-session', 'dtd-new-session-icon',
    'button[class*="newSession"]', 'wtg9ga_newSession']) {
    assert.equal(style.includes(legacy), false, 'native button styling must stay under Harness: ' + legacy)
  }
  assert.equal(compatibility.includes('processHoverCards'), false)
  assert.equal(compatibility.includes('onMouseOver'), false)
  assert.ok(source.includes("sidebar.session.row.hover"))
})
test('native sidebar search does not use private DOM input proxies or hide the Host search control', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('\ntype SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  for (const legacy of ['dtd-native-search', 'nativeInput', 'nativeSearch', 'hasServiceSearch',
    'searchProxy', 'hostButton.click()', 'HTMLInputElement.prototype',
    "hostInput.dispatchEvent", "mounted.get('search')"]) {
    assert.equal(compatibility.includes(legacy), false, 'legacy sidebar input proxy: ' + legacy)
  }
  assert.equal(source.includes('.dtd-native-search'), false)
  assert.equal(style.includes('dtd-native-search'), false)
  assert.equal(style.includes('[class*="searchSlot"]'), false)
  assert.match(source, /function installHostSearch\(/)
  assert.equal(readiness.required.sidebar_search_placement, false)
})

test('service search uses only the public composer Slot, never inserts a Host sidebar search shell', () => {
  const begin = source.indexOf('function installHostSearch(')
  const end = source.indexOf('\nwindow.__ModuleLoader__.load(', begin)
  assert.ok(begin >= 0 && end > begin)
  const search = source.slice(begin, end)
  assert.match(search, /delta\.search\.palette/)
  assert.match(search, /conversation\.input\.left/)
  assert.doesNotMatch(search, /navParent\.insertBefore\(shell|data-sidebar-scrollport|data-delta-search-adapter/)
  assert.doesNotMatch(search, /new MutationObserver\(scheduleSync\)/)
})

test('Host owns frame columns, splitters and expand/collapse behavior without Delta pointer hijacking', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('\n' + 'type SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compat = source.slice(begin, end)
  for (const forbidden of [
    /syncElasticLayout|resetElasticLayout|onSplitterPointerDown/,
    /splitGridTracks|readStoredPaneWidth|writeStoredPaneWidth/,
    /mP3x-q_frame|mP3x-q_handle/,
    /dtd-edge-toggle|data-dtd-elastic|data-dtd-sidebar-open|data-dtd-rightbar-open/,
    /--dtd-sidebar-col|--dtd-rightbar-col|--dsh-windows-sidebar-width/,
    /dsh-delta-suite:(?:sidebar|rightbar)-width/,
    /frameResizeObserver|modifiedHandles|activeDragCleanup/,
  ]) assert.doesNotMatch(compat, forbidden)
  for (const forbidden of [
    /data-dtd-elastic|data-dtd-sidebar-open|data-dtd-rightbar-open/,
    /dtd-edge-toggle|mP3x-q_handle|mP3x-q_frame/,
    /--dtd-sidebar-col|--dtd-rightbar-col|--dtd-pane-min-width/,
    /grid-template-columns:[^;]*--dtd/,
  ]) assert.doesNotMatch(style, forbidden)
  assert.match(compat, /syncPrivacyDom\(\)/)
  assert.match(compat, /syncSettingsNav\(\)/)
  assert.match(compat, /syncMenus\(\)/)
  assert.doesNotMatch(compat, /syncModalPanel|onModalPointerDown|onModalDblClick/)
  assert.match(compat, /syncMenus\(\)/)
  assert.equal(readiness.required.sidebar_spacing, false, 'unverified layout capability must stay disabled')
})

test('native session and workspace hover cards remain Host-owned; public Slot keeps privacy protection', () => {
  const start = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('type SearchTabId', start)
  assert.ok(start >= 0 && end > start)
  const compat = source.slice(start, end)
  for (const marker of [
    'processHoverCards', 'onMouseOver', 'dtd-session-hover-card',
    'SessionHoverContent', 'wnFoaW_hoverContent', '_card_bgejw',
  ]) assert.equal(compat.includes(marker), false, 'Host hover DOM mutation: ' + marker)
  for (const marker of [
    'dtd-session-hover-card', 'wnFoaW_hoverContent', '_card_bgejw', '_preview_bgejw',
    '[class*="hoverContent"]', '[class*="hoverPath"]', '[class*="hoverTime"]',
    '[class*="hoverStatus"]', '[class*="hoverTitle"]',
    '[data-slot="sidebar.session.row.hover"]',
  ]) assert.equal(style.includes(marker), false, 'Host card CSS override: ' + marker)
  assert.ok(source.includes("scope.slots.inject('sidebar.session.row.hover'"))
  assert.ok(source.includes('SessionHoverDetail(props, controller)'))
  assert.ok(source.includes('deltaFeatures.readSearchProtection().allowsSession(sessionId)'))
  assert.equal(readiness.required.session_hover_card_layout, false)
})
test('native modal panels and masks stay Host-owned without Delta pointer interception', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('type SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  for (const marker of [
    'syncModalPanel', 'resetModalState', 'onModalPointerDown',
    'onModalDblClick', 'applyModalOffset', 'trackedModalPanel',
    'activeModalDragCleanup', 'AnXs9G_panel', 'AnXs9G_mask',
    'AnXs9G_navTitle', 'AnXs9G_header', 'data-dtd-dragging',
    '--dtd-modal-x', '--dtd-modal-y',
  ]) {
    assert.equal(compatibility.includes(marker), false, 'private native modal manipulation: ' + marker)
  }
  for (const marker of [
    '[class*="AnXs9G_panel"]', '[class*="AnXs9G_mask"]',
    '[class*="AnXs9G_navTitle"]', '[class*="AnXs9G_header"]',
    'data-dtd-dragging', '--dtd-modal-x', '--dtd-modal-y',
  ]) {
    assert.equal(style.includes(marker), false, 'native modal CSS override: ' + marker)
  }
  assert.ok(style.includes('.dtd-dialog-card'), 'Delta-owned dialogs keep their own styling')
  assert.ok(source.includes('openDeleteDialog'), 'protected delete dialog is retained')
  assert.ok(source.includes('openUnlockPinDialog'), 'protected unlock dialog is retained')
  assert.ok(compatibility.includes('syncMenus()'), 'menu ACL controls remain unchanged')
})
test('workspace TOTP lock and Vision Bridge stay localized and capability-gated', () => {
  const en = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/locale/en.json', import.meta.url)), 'utf8'))
  const zh = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/locale/zh.json', import.meta.url)), 'utf8'))
  const host = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/host-vision.ts', import.meta.url)), 'utf8')
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

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url)), 'utf8')
const style = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/theme.css', import.meta.url)), 'utf8')
const readiness = JSON.parse(readFileSync(fileURLToPath(new URL('../projects/dsh-delta-suite/feature-readiness.json', import.meta.url)), 'utf8'))

test('ZIP3 leaves unsupported native sidebar layout under Harness ownership', () => {
  assert.match(source, /function installSidebarCompatibility/)
  assert.match(source, /function installHostSearch/)
  assert.match(source, /SearchTabId/)
  assert.doesNotMatch(source, /syncModalChromeOverlay|data-delta-modal-open/)
  assert.doesNotMatch(style, /data-delta-modal-open|--dtd-chrome-overlay-mask/)
  assert.doesNotMatch(source, /isCmdK|onGlobalKeyDown/)
  assert.match(source, /kbdHint\.textContent = 'Enter'/)
  assert.match(source, /session-delete-ungrouped/)
  assert.doesNotMatch(source, /dtd-search-dialog-backdrop|openSearchDialog\(/)
  assert.match(style, /dtd-search-/)
})
test('remaining global CSS is limited to Delta tokens; Host-private selectors are retired', () => {
  assert.doesNotMatch(style, /\[class[*~^$|]?=/)
  assert.doesNotMatch(style, /(?:^|[\s;{])--dsw-[\w-]+\s*:/m)
  assert.doesNotMatch(style, /\[data-sidebar-right-guide-entry\]/)
  assert.doesNotMatch(style, /:root\[data-delta-ui="delta"\]\s+(?:input|textarea|select|button|::selection)/)
  assert.match(source, /activeTheme\.overrideTokens\(DELTA_SUITE_OWNER, TOKENS\)/)
  assert.match(style, /\.dtd-host-search-field\s*\{/)
  assert.match(style, /\.dtd-dialog-backdrop\s*\{/)
})

test('retired compatibility root has neither source attribute writes nor theme selectors', () => {
  assert.doesNotMatch(source, /data-delta-compat/i)
  assert.doesNotMatch(style, /data-delta-compat/i)
  assert.match(style, /:root\[data-delta-ui="delta"\] \.dtd-host-search\b/)
  assert.match(style, /\.dtd-search-kbd\b/)
  assert.match(style, /\.dtd-lock-shield\b/)
  assert.match(style, /\[data-dtd-hidden-deleted="1"\]/)
})

test('Delta-owned modal backdrops are scoped to Delta, not Harness chrome', () => {
  assert.match(style, /\.dtd-search-backdrop\s*\{[^}]*background: var\(--dtd-bg-mask/s)
  assert.match(style, /\.dtd-dialog-backdrop\s*\{[^}]*background: var\(--dtd-bg-mask/s)
  assert.doesNotMatch(source, /syncModalChromeOverlay|data-delta-modal-open/)
  assert.doesNotMatch(style, /data-delta-modal-open|--dtd-chrome-overlay-mask/)
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

test('native tooltip, popup, menu and listbox styling stays Harness-owned', () => {
  for (const marker of ['[role="tooltip"]', '[role="menu"]', '[role="menuitem"]',
    '[role="listbox"]', '[data-context-menu]', '[data-radix-menu-content]',
    '[class*="_surface_"]', '[class*="_backing_"]', '[class*="_list_"]',
    '[class*="AnXs9G_navCell"]', '[class*="wtg9ga_moreMenu"]',
    '[class*="A6Bq1a_panel"]', '[class*="Spinner"]']) {
    assert.equal(style.includes(marker), false, 'unowned Host popup CSS: ' + marker)
  }
  assert.match(style, /\.dtd-tooltip\s*\{/)
  assert.match(style, /\.dtd-host-search-results\s*\{/)
  assert.match(style, /\.dtd-spinner\s*\{/)
  assert.match(style, /\.dtd-lock-shield\s*\{/)
})

test('native sidebar rows, scrollbars and fades stay Host-owned; protected-state CSS remains', () => {
  for (const marker of ['[data-sidebar-scrollport]', '[data-sidebar-list-area]',
    '[data-row-key^="session:"]', '[class*="scrollFade"]',
    '[class*="wtg9ga_scrollFade"]', '[class*="regionArea"]', '[class*="rowResting"]']) {
    assert.equal(style.includes(marker), false, 'native sidebar layout CSS: ' + marker)
  }
  for (const marker of ['data-dtd-hidden-deleted', 'data-dtd-hidden-session-log',
    'data-dtd-hidden-sole-workspace', 'data-dtd-hidden-privacy-cmd']) {
    assert.ok(style.includes(marker), 'protected-state CSS missing: ' + marker)
  }
  assert.match(style, /\.dtd-lock-shield\s*\{/)
  assert.match(style, /\.dtd-search-tabs::-webkit-scrollbar/)
})

test('native sidebar brand, logo rows, and openers remain Harness-owned in Delta mode', () => {
  for (const marker of ['[data-sidebar-toggle]', '[data-sidebar-opener]',
    '[data-sidebar-right-toggle]', '[data-sidebar-right-expand]',
    '[class*="wtg9ga_logoRow"]', '[class*="SidebarRoot_logoRow"]',
    '[class*="wtg9ga_brandIdentity"]', '[class*="SidebarRoot_brand"]',
    '[class*="FishLogo"]', '--dsh-windows-menu-start']) {
    assert.equal(style.includes(marker), false, 'private native sidebar control styling: ' + marker)
  }
  assert.match(style, /\.dtd-brand-mark\s*\{/)
  assert.match(style, /\.dtd-brand-name\s*\{/)
  assert.match(source, /sidebar\.brand\.mark/)
  assert.match(source, /sidebar\.brand\.name/)
  assert.match(style, /\.dtd-lock-shield\s*\{/)
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

test('Host owns center/header/Composer/trajectory CSS geometry; Delta retains protected overlays', () => {
  for (const marker of ['mP3x-q_centerCol', 'an3WzG_header',
    'F07MqG_dock', 'eciBTa_root', 'Wd4N7W_searchIcon',
    '--dsh-chat-content-width', '--dsh-composer-card-max-width',
    '--dsh-composer-side-clearance', '--dtd-center-gutter']) {
    assert.equal(style.includes(marker), false, 'unowned Host center CSS: ' + marker)
  }
  assert.match(style, /\.dtd-lock-shield\s*\{/)
  assert.match(style, /\[data-dtd-hidden-deleted="1"\]/)
  assert.equal(readiness.required.sidebar_spacing, false)
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
  assert.doesNotMatch(compat, /syncSettingsNav|syncMenus|data-dtd-nav-tail/)
  assert.doesNotMatch(compat, /setAttribute\(['"]data-delta-compat['"]|data-delta-compat-status/)
  assert.doesNotMatch(compat, /syncModalPanel|onModalPointerDown|onModalDblClick/)
  assert.equal(readiness.required.sidebar_spacing, false, 'unverified layout capability must stay disabled')
})

test('Host owns native session/workspace lock badges; Delta keeps the tested authorization and shield paths', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('\ntype SearchTabId', begin)
  const compat = source.slice(begin, end)
  assert.ok(begin >= 0 && end > begin)
  for (const marker of ['dtd-session-lock-badge', 'dtd-workspace-lock-badge',
    'data-dtd-session-locked', 'data-dtd-workspace-locked']) {
    assert.equal(compat.includes(marker), false, marker)
    assert.equal(style.includes(marker), false, marker)
  }
  assert.doesNotMatch(compat, /querySelectorAll<HTMLElement>\('\[data-row-key\^="workspace:"\]'\)/)
  assert.match(compat, /hiddenDeletedRows/)
  assert.match(compat, /syncLockShieldOverlay/)
  assert.match(source, /installWorkspaceMutationGuards/)
  assert.match(source, /readWorkspaceMutationPolicy/)
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
  const hoverStart = source.indexOf('function SessionHoverDetail(')
  const hoverEnd = source.indexOf('function PersonalizationSection(', hoverStart)
  assert.ok(hoverStart >= 0 && hoverEnd > hoverStart)
  const occupant = source.slice(hoverStart, hoverEnd)
  assert.match(occupant, /role: 'group'/)
  assert.match(occupant, /onPointerDown/)
  assert.doesNotMatch(occupant, /'aria-hidden': true|hidden: true|display: 'none'/,
    'authorized Delta hover content must not be permanently hidden')
  assert.doesNotMatch(occupant, /workspace\.path|cwd|\.retain\(/,
    'the public hover occupant may not expose paths or acquire Session bindings')
  const owned = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/feature-extras.css', import.meta.url)), 'utf8')
  assert.match(owned, /\.dtd-session-meta \{/)
  assert.doesNotMatch(owned, /\[class\*=|\[data-row-key|\[data-chat-flow/,
    'hover decoration may not restyle native Host rows or cards')
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
  assert.ok(compatibility.includes('syncPrivacyDom()'), 'privacy and workspace safeguards remain active')
})
test('native menus keep Harness order while explicit safety guards remain', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('type SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  assert.doesNotMatch(compatibility, /syncMenus|getMenuLabel\(.*items|appendChild\(.*separator/)
  assert.match(compatibility, /else if \(workspaceCount === 1\)/)
  assert.ok(source.includes('onMenuClickCapture'))
  assert.ok(source.includes('LOCKED_WORKSPACE_MUTATION_LABELS'))
  assert.equal(style.includes('Context & View-Options Menu Dynamic Reordering'), false)
  assert.equal(style.includes('[data-dtd-hidden-footer-sep="1"]'), false)
  assert.equal(style.includes(':root[data-delta-ui="delta"] [class*="_footer_"] {'), false)
})

test('Delta safety prompts do not inject menu styling into Host rows', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('type SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  assert.doesNotMatch(compatibility, /syncMenus|dtd-menu-danger|classList\.add\(/)
  assert.doesNotMatch(style, /\.dtd-menu-danger|\[role="menu"\] \[role="separator"\]/)
  assert.doesNotMatch(style, /\.dtd-context-menu(?:-item)?\b/)
  assert.doesNotMatch(compatibility, /openUngroupedContextMenu|ungroupedMenuEl|closeUngroupedMenu/)
  assert.doesNotMatch(compatibility, /addEventListener\('contextmenu'|removeEventListener\('contextmenu'/)
  assert.match(compatibility, /onMenuClickCapture/)
  assert.match(compatibility, /LOCKED_WORKSPACE_MUTATION_LABELS|LOCKED_MUTATION_LABELS/)
  assert.match(compatibility, /else if \(workspaceCount === 1\)/)
})

test('native Settings rows and Ungrouped bucket remain Host-owned without text-based hiding', () => {
  const begin = source.indexOf('function installSidebarCompatibility(')
  const end = source.indexOf('type SearchTabId', begin)
  assert.ok(begin >= 0 && end > begin)
  const compatibility = source.slice(begin, end)
  for (const marker of [
    'SETTINGS_HIDDEN_TEXT_RE', 'hiddenSettingsRows', 'data-dtd-hidden-settings-row',
    'hiddenEmptyUngroupedNodes', 'data-dtd-hidden-empty-ungrouped',
    '_0NG6bG_row', 'session-log-deepseek', 'current-version',
  ]) {
    assert.equal(compatibility.includes(marker), false, 'unowned native visual suppression: ' + marker)
    assert.equal(style.includes(marker), false, 'native CSS suppression: ' + marker)
  }
  assert.match(compatibility, /syncPrivacyDom\(\)/)
  assert.match(compatibility, /BLOCKED_COMMAND_RE/)
  assert.match(compatibility, /hiddenPrivacyCmdNodes/)
  assert.match(compatibility, /hiddenDeletedRows/)
  assert.match(compatibility, /hiddenSoleWorkspaceNodes/)
  assert.match(compatibility, /syncLockShieldOverlay/)
  assert.match(compatibility, /onMenuClickCapture/)
  assert.match(style, /data-dtd-hidden-deleted/)
  assert.match(style, /data-dtd-hidden-privacy-cmd/)
  assert.match(style, /data-dtd-hidden-sole-workspace/)
})
test('native turn error rows and details remain Harness-owned', () => {
  for (const marker of [
    'turnErrorRow', 'data-dtd-collapsible', 'data-dtd-expanded',
    'collapsibleErrorHandlers', 'cleanupCollapsibleErrors',
  ]) {
    assert.equal(source.includes(marker), false, 'Delta must not mutate native error rows: ' + marker)
    assert.equal(style.includes(marker), false, 'Delta must not style native error rows: ' + marker)
  }
})

test('Workspace TOTP and Host Vision stay localized without private client composer capture', () => {
  const en = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/locale/en.json', import.meta.url)), 'utf8'))
  const zh = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/locale/zh.json', import.meta.url)), 'utf8'))
  const host = readFileSync(fileURLToPath(new URL('../packages/dsh-delta-suite/src/host-vision.ts', import.meta.url)), 'utf8')
  assert.equal(en.workspaceMenu.lockWorkspace, 'Lock workspace')
  assert.equal(zh.workspaceMenu.lockWorkspace, '\u9501\u5b9a\u5de5\u4f5c\u533a')
  assert.ok(en.visionBridge.title && zh.visionBridge.title)
  assert.doesNotMatch(source, /installClientVisionBridge|stopVisionBridge|insertComposerText|resolveWriteTarget/)
  assert.doesNotMatch(source, /data-composer-input|HTML(?:Input|TextArea)Element\.prototype/)
  assert.doesNotMatch(source, /document\.execCommand\(['"`]insertText/)
  assert.doesNotMatch(source, /(?:document|window)\.addEventListener\(['"`](?:paste|drop)['"`]/)
  assert.equal(readiness.required.vision_bridge, false)
  assert.equal(readiness.required.vision_bridge_admission_adapter, false)
  assert.match(source, /isWorkspaceLocked/)
  assert.match(host, /installHostVisionOps/)
  assert.match(host, /resolveVisionAccount/)
  // Source-level tests never claim an unverified Windows Host acceptance.
  assert.equal(readiness.required.workspace_initial_collapse, false)
})

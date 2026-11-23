import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const style = read('packages/delta-suite/src/theme.css')
const extras = read('packages/delta-suite/src/feature-extras.css')
const readiness = JSON.parse(read('projects/delta-suite/feature-readiness.json'))

test('retired native Sidebar DOM interception is absent, not merely unmounted', () => {
  for (const marker of ['installSidebarCompatibility', 'createFrameScheduler',
    'onMenuClickCapture', 'syncPrivacyDom', 'LOCKED_WORKSPACE_MUTATION_LABELS',
    'restoreHiddenNodes', 'installLiveNativePresentation', 'LIVE_PRESENTATION_CSS',
    'installWorkspaceMutationGuards']) {
    assert.equal(source.includes(marker), false, 'Host-only code remains: ' + marker)
  }
  assert.match(source, /function installHostSearch\(/)
  assert.match(source, /activeTheme\.overrideTokens\(DELTA_SUITE_OWNER, TOKENS\)/)
  assert.match(source, /scope\.slots\.inject\('sidebar\.session\.row\.hover'/)
})

test('Suite UI styling never overrides unowned Host popup, list or sidebar layout selectors', () => {
  for (const selector of ['[role="tooltip"]', '[role="menu"]', '[role="menuitem"]',
    '[role="listbox"]', '[data-context-menu]', '[data-radix-menu-content]',
    '[class*="wtg9ga_moreMenu"]', '[class*="mP3x-q_frame"]',
    '[data-sidebar-scrollport]', '[data-sidebar-list-area]',
    '[data-row-key^="session:"]', '[class*="scrollFade"]']) {
    assert.equal(style.includes(selector), false, 'unowned Host CSS selector: ' + selector)
  }
  assert.doesNotMatch(style, /\[class[*~^$|]?=/)
  assert.doesNotMatch(style, /(?:^|[\s;{])--dsw-[\w-]+\s*:/m)
  assert.doesNotMatch(extras, /\[class\*=|\[data-row-key/)
})

test('Host navigation, list spacing, panels and splitters stay native', () => {
  for (const marker of ['syncElasticLayout', 'resetElasticLayout',
    'onSplitterPointerDown', 'readStoredPaneWidth', 'writeStoredPaneWidth',
    'data-dtd-elastic', 'dtd-edge-toggle', 'data-dtd-sidebar-open',
    'data-dtd-rightbar-open', 'data-dtd-nav-tail',
    'dtd-native-new-session', 'dtd-native-search']) {
    assert.equal(source.includes(marker), false, marker)
    assert.equal(style.includes(marker), false, 'unowned native layout CSS: ' + marker)
  }
  assert.equal(readiness.required.sidebar_navigation_order, false)
  assert.equal(readiness.required.sidebar_search_placement, false)
  assert.equal(readiness.required.workspace_initial_collapse, false)
  assert.equal(readiness.required.sidebar_spacing, false)
})

test('brand and Session metadata use public Slots rather than native row mutation', () => {
  for (const slot of ['sidebar.brand.mark', 'sidebar.brand.name',
    'sidebar.session.row.trailing', 'sidebar.session.row.hover']) {
    assert.ok(source.includes(slot), 'public Slot missing: ' + slot)
  }
  assert.match(source, /SessionProtectionIndicator/)
  assert.match(source, /SessionHoverDetail\(props, controller\)/)
  assert.match(extras, /\.dtd-session-protection-mark\s*\{/)
  assert.match(extras, /\.dtd-session-meta \{/)
  assert.doesNotMatch(source, /dtd-session-lock-badge|data-dtd-session-locked/)
  assert.doesNotMatch(style, /wnFoaW_hoverContent|wtg9ga_newSession/)
})

test('Delta Search uses public composer Slot and does not install a native sidebar search proxy', () => {
  const start = source.indexOf('function installHostSearch(')
  const end = source.indexOf('\nwindow.__ModuleLoader__.load(', start)
  assert.ok(start >= 0 && end > start)
  const search = source.slice(start, end)
  assert.match(search, /conversation\.input\.left/)
  assert.match(search, /delta\.search\.palette/)
  assert.doesNotMatch(search, /navParent\.insertBefore\(shell|data-sidebar-scrollport|data-delta-search-adapter/)
  assert.doesNotMatch(search, /new MutationObserver\(scheduleSync\)/)
  assert.doesNotMatch(source, /dtd-search-dialog-backdrop|openSearchDialog\(/)
  assert.match(style, /\.dtd-host-search-field\s*\{/)
})

test('search protection remains read-only and cannot modify native Workspace methods', () => {
  assert.match(source, /function createSearchContentProtection\(/)
  assert.match(source, /workspaceSessionAliases/)
  assert.doesNotMatch(source, /readWorkspaceMutationPolicy|installWorkspaceMutationGuards/)
  assert.doesNotMatch(source, /workspaces\.delete\s*=|workspaces\.unarchiveSession\s*=/)
  assert.doesNotMatch(source, /return 'protected-default-workspace'/)
})

test('native card, tooltip and modal geometry is not intercepted', () => {
  for (const marker of ['syncModalPanel', 'resetModalState',
    'onModalPointerDown', 'onModalDblClick', 'applyModalOffset',
    'activeModalDragCleanup', 'processHoverCards', 'onMouseOver',
    'data-dtd-dragging', 'data-delta-compat', 'syncModalChromeOverlay',
    'data-delta-modal-open']) {
    assert.equal(source.includes(marker), false, 'private Host DOM operation: ' + marker)
  }
  assert.doesNotMatch(style, /data-delta-modal-open|--dtd-chrome-overlay-mask/)
  assert.match(style, /\.dtd-dialog-backdrop\s*\{/)
  assert.match(style, /\.dtd-search-backdrop\s*\{/)
  assert.match(style, /\.dtd-lock-shield\s*\{/)
})

test('Session hover decoration checks public content protection before rendering', () => {
  assert.match(source, /deltaFeatures\.readSessionHoverSelection\(sessionId\)/)
  assert.match(source, /if \(!policy\.allowsSession\(id\)\) return null/)
  assert.match(source, /!policy\.allowsSession\(id, record\.workspaceId\)/)
  const from = source.indexOf('function SessionHoverDetail(')
  const to = source.indexOf('function PersonalizationSection(', from)
  assert.ok(from >= 0 && to > from)
  const component = source.slice(from, to)
  assert.match(component, /role: 'group'/)
  assert.match(component, /onPointerDown/)
  assert.doesNotMatch(component, /'aria-hidden': true|hidden: true|display: 'none'/)
  assert.doesNotMatch(component, /workspace\.path|cwd|\.retain\(/)
  assert.equal(readiness.required.session_hover_card_layout, false)
})

test('native context menus remain Host-owned; Suite contributes only registered actions', () => {
  assert.match(source, /contextMenus\.register/)
  assert.doesNotMatch(source, /\b(?:document|window)\.(?:addEventListener|removeEventListener)\s*\(\s*['"]contextmenu['"]/)
  assert.doesNotMatch(source, /onMenuClickCapture|syncMenus|dtd-context-menu/)
  assert.doesNotMatch(style, /\.dtd-context-menu(?:-item)?\b/)
  assert.match(source, /session-delete-ungrouped/)
})

test('native Settings and turn error elements are not suppressed by private selectors', () => {
  for (const marker of ['SETTINGS_HIDDEN_TEXT_RE', 'hiddenSettingsRows',
    'data-dtd-hidden-settings-row', 'data-dtd-hidden-empty-ungrouped',
    'turnErrorRow', 'data-dtd-collapsible', 'collapsibleErrorHandlers']) {
    assert.equal(source.includes(marker), false, 'Host visual mutation: ' + marker)
  }
  assert.doesNotMatch(style, /dtd-menu-danger|\[role="menu"\] \[role="separator"\]/)
})

test('localized Workspace controls remain independent of native UI permissions', () => {
  const zh = JSON.parse(read('packages/delta-suite/locale/zh.json'))
  const en = JSON.parse(read('packages/delta-suite/locale/en.json'))
  assert.equal(en.workspaceMenu.lockWorkspace, 'Lock workspace')
  assert.equal(zh.workspaceMenu.lockWorkspace, '\u9501\u5b9a\u5de5\u4f5c\u533a')
  assert.equal('visionBridge' in en, false)
  assert.equal('visionBridge' in zh, false)
  assert.equal('networkProxy' in en, false)
  assert.equal('networkProxy' in zh, false)
  assert.doesNotMatch(source, /installClientVisionBridge|stopVisionBridge|insertComposerText/)
  assert.match(source, /isWorkspaceLocked/)
})

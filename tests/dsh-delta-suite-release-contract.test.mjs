import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const source = read('../packages/dsh-delta-suite/src/client.ts')
const theme = read('../packages/dsh-delta-suite/src/theme.css')

// Simulate the compiler + finalize-client markers used by both published archives.
const emittedClient = (style = theme) => [
  'window.__ModuleLoader__.load({',
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(style) + ';',
].join('\n')

test('release guard accepts only the reviewed ZIP3 adapter and canonical theme', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emittedClient(), source))
  assert.doesNotThrow(() => verifyApprovedZip3Client(emittedClient(), source.replace(/\r?\n/g, '\r\n')))
})

test('release guard rejects the retired native sidebar search proxy', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\ndtd-native-search', source),
    /legacy native layout takeover retained/)
})

test('release guard rejects revived compatibility-gated CSS in the emitted theme', () => {
  for (const selector of [':root[data-delta-compat="1"] .dtd-host-search {}',
    ':root[DATA-DELTA-COMPAT="1"] [class*="wtg9ga_panelList"] {}']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient(theme + '\n' + selector), source),
      /retired compat-gated Host CSS in emitted theme/)
  }
})

test('release guard rejects activation of retired native sidebar layout compatibility', () => {
  for (const takeover of [
    "document.documentElement.setAttribute('data-delta-compat', '1')",
    "root.dataset.deltaCompat = '1'",
    "root.dataset['deltaCompatStatus'] = 'mounted'",
    "button.setAttribute('data-dtd-nav-tail', '1')",
    "root.setAttribute('DATA-DELTA-COMPAT', '1')",
    "root.setAttribute(`DATA-DELTA-COMPAT-STATUS`, 'mounted')",
    "root . setAttribute('data-delta-compat', '1')",
    "root['setAttribute'](`data-delta-compat`, '1')",
    "root.dataset . deltaCompat = '1'",
    "root.dataset.deltaCompat ||= '1'",
    "root.dataset.deltaCompat <<= 1",
    "root.dataset.deltaCompat >>= 1",
    "root.dataset.deltaCompat >>>= 1",
    "root['dataset']['deltaCompatStatus'] ??= 'mounted'",
    "root['dataset']['deltaCompatStatus'] = 'mounted'",
    'data-dtd-nav-tail',
  ]) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + takeover, source),
      /legacy native layout takeover retained/)
  }
})

test('release guard rejects retired Host modal chrome takeover', () => {
  for (const banned of ['syncModalChromeOverlay()', 'data-delta-modal-open']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + banned, source),
      /legacy native layout takeover retained/)
  }
})

test('release guard refuses revived global Vision capture and private composer writes', () => {
  for (const banned of [
    "installClientVisionBridge()",
    "document.addEventListener('paste', onPaste, { capture: true })",
    "document.addEventListener('drop', onDrop, { capture: true })",
    "document.execCommand('insertText', false, payload)",
    "window.HTMLTextAreaElement.prototype",
  ]) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + banned, source),
      /retired Vision composer takeover in emitted client/)
    assert.throws(() => verifyApprovedZip3Client(emittedClient(), source + '\n' + banned),
      /retired Vision composer takeover in client source/)
  }
})

test('release guard rejects reintroduced native lock-row markup and styling', () => {
  for (const marker of ['dtd-session-lock-badge', 'dtd-workspace-lock-badge',
    'data-dtd-session-locked', 'data-dtd-workspace-locked']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + marker, source),
      /retired native lock row badge in emitted client/)
    assert.throws(() => verifyApprovedZip3Client(emittedClient(), source + '\n' + marker),
      /retired native lock row badge in client source/)
    assert.throws(() => verifyApprovedZip3Client(emittedClient(theme + '\n.' + marker + ' {}'), source),
      /retired native lock row badge in emitted theme/)
  }
})

test('release guard rejects restored native sidebar row and scrollbar overrides', () => {
  for (const marker of ['[data-sidebar-scrollport]', '[data-sidebar-list-area]',
    '[data-row-key^="session:"]', '[class*="scrollFade"]',
    '[class*="regionArea"]', '[class*="rowResting"]']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient(theme + '\n' + marker), source),
      /retired native sidebar list CSS in emitted theme/)
  }
})

test('release guard rejects private native sidebar opener and logo suppression styling', () => {
  for (const marker of ['[data-sidebar-toggle]', '[data-sidebar-right-toggle]',
    '[class*="wtg9ga_logoRow"]', '[class*="SidebarRoot_brand"]',
    '--dsh-windows-menu-start']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient(theme + '\n' + marker), source),
      /retired Host sidebar control CSS in emitted theme/)
  }
})

test('release guard refuses retired Host center geometry styling', () => {
  for (const marker of ['[class*="mP3x-q_centerCol"]', '[class~="an3WzG_header"]',
    '[class*="F07MqG_dock"]', '[class*="eciBTa_root"]',
    '--dsh-chat-content-width', '--dtd-center-gutter']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient(theme + '\n' + marker), source),
      /retired Host center CSS in emitted theme/)
  }
})

test('release guard refuses changes to either approved compatibility implementation', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient(), source.replace(
    'function installSidebarCompatibility(', 'function installSidebarCompatibility(/* changed */'
  )), /approved compatibility adapter changed/)
  assert.throws(() => verifyApprovedZip3Client(emittedClient(), source.replace(
    'function installHostSearch(', 'function installHostSearch(/* changed */'
  )), /approved compatibility adapter changed/)
})

test('release guard checks the actual emitted CSS, not just source comments', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient(theme.replace('--dtd-brand:', '--dtd-custom-brand:')), source),
    /approved theme differs/)
  assert.throws(() => verifyApprovedZip3Client(emittedClient().replace('const OWNED_CSS =', 'const NO_THEME ='), source),
    /stylesheet missing/)
})

test('release guard rejects duplicate or unapproved Host takeover entry points', () => {
  assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\nfunction installHostSearch() {}', source),
    /duplicated/)
  for (const banned of ['openSearchDialog(', 'dtd-search-dialog-backdrop', 'workspaceRegistry', 'app.asar']) {
    assert.throws(() => verifyApprovedZip3Client(emittedClient() + '\n' + banned, source),
      /non-ZIP3 Host DOM/)
  }
})

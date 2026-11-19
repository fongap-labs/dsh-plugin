import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const file = path => readFileSync(join(root, 'packages/dsh-delta-suite', path), 'utf8')
const client = file('src/client.ts')
const css = file('src/theme.css')
const zh = JSON.parse(file('locale/zh.json'))
const en = JSON.parse(file('locale/en.json'))

describe('Authoritative ZIP3 Desktop UI and additive feature integration', () => {
  it('retains the reviewed ZIP3 theme with Delta Suite additions', () => {
    // Six-digit CSS Unicode escapes preserve the ZIP's selector semantics.
    // Git may check out CRLF on Windows; canonical ZIP CSS uses LF.
    const canonical = css.replace(/\r\n/g, '\n').replace(/\\([0-9A-F]{6})/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    const b = Buffer.from(canonical)
    const sha = createHash('sha1').update('blob ' + b.length + '\0').update(b).digest('hex')
    assert.equal(sha, 'e35b99e11de18ab1b28d51df3b88445fadca3fd4')
  })
  it('leaves native sidebar list rows, scrolling and fades to Harness', () => {
    for (const marker of ['[data-sidebar-scrollport]', '[data-sidebar-list-area]',
      '[data-row-key^="session:"]', '[class*="scrollFade"]',
      '[class*="wtg9ga_scrollFade"]', '[class*="regionArea"]', '[class*="rowResting"]']) {
      assert.equal(css.includes(marker), false, marker)
    }
    assert.match(css, /\[data-dtd-hidden-deleted="1"\]/)
    assert.match(css, /\.dtd-lock-shield\s*\{/)
    assert.match(css, /\.dtd-search-tabs::-webkit-scrollbar/)
  })
  it('keeps native sidebar openers and logo rows under Harness ownership', () => {
    for (const marker of ['[data-sidebar-toggle]', '[data-sidebar-opener]',
      '[data-sidebar-right-toggle]', '[data-sidebar-right-expand]',
      '[class*="wtg9ga_logoRow"]', '[class*="SidebarRoot_logoRow"]',
      '[class*="wtg9ga_brandIdentity"]', '[class*="SidebarRoot_brand"]',
      '[class*="FishLogo"]', '--dsh-windows-menu-start']) {
      assert.equal(css.includes(marker), false, marker)
    }
    assert.match(css, /\.dtd-brand-mark\s*\{/)
    assert.match(css, /\.dtd-brand-name\s*\{/)
    assert.match(css, /\.dtd-lock-shield\s*\{/)
  })
  it('removes inactive data-delta-compat CSS but preserves live Delta feature styling', () => {
    assert.doesNotMatch(css, /data-delta-compat/i)
    assert.match(css, /:root\[data-delta-ui="delta"\] \.dtd-host-search\b/)
    assert.match(css, /\.dtd-search-clear\b/)
    assert.match(css, /\.dtd-lock-shield\b/)
    assert.match(css, /\[data-dtd-hidden-deleted="1"\]/)
    assert.doesNotMatch(css, /\[aria-label="Plugins"\]|\[aria-label="Tasks"\]/)
  })
  it('leaves native center, Header, Composer and trajectory layout to Harness', () => {
    for (const marker of ['mP3x-q_centerCol', 'an3WzG_header',
      'F07MqG_dock', 'eciBTa_root', 'Wd4N7W_searchIcon',
      '--dsh-chat-content-width', '--dsh-composer-card-max-width',
      '--dsh-composer-side-clearance', '--dtd-center-gutter']) {
      assert.equal(css.includes(marker), false, marker)
    }
    assert.match(css, /\.dtd-lock-shield\s*\{/)
    assert.match(css, /\[data-dtd-hidden-deleted="1"\]/)
  })
  it('retains the seven-tab SearchPalette and its explicit keyboard invocation', () => {
    for (const term of ['SearchTabId', 'tabAll', 'tabSession', 'tabWorkspace',
      'tabPlugin', 'tabSkill', 'tabShortcut', 'tabAction',
      'installHostSearch', 'searchPalette.sidebarPlaceholder']) {
      assert.ok(client.includes(term), 'ZIP feature missing: ' + term)
    }
    assert.doesNotMatch(client, /onGlobalKeyDown|const isCmdK/)
    assert.match(client, /kbdHint\.textContent = 'Enter'/)
    assert.doesNotMatch(client, /dtd-search-dialog-backdrop/)
    assert.doesNotMatch(client, /openSearchDialog\(/)
  })
  it('leaves the native Ungrouped context menu untouched and retains Host delete guards', () => {
    assert.doesNotMatch(client, /openUngroupedContextMenu|closeUngroupedMenu|ungroupedMenuEl/)
    assert.doesNotMatch(client, /(?:addEventListener|removeEventListener)\(['"]contextmenu['"]/)
    assert.doesNotMatch(css, /\.dtd-context-menu(?:-item)?\b/)
    assert.match(client, /session-delete-ungrouped/)
    assert.match(client, /installWorkspaceMutationGuards/)
    assert.match(client, /onMenuClickCapture/)
  })
  it('preserves TOTP, session protection and Delta-owned modal backdrops without Host chrome takeover', () => {
    for (const term of ['encodeQrMatrix', 'setup-begin', 'session-delete-ungrouped',
      'installClientPrivacyGuards']) {
      assert.ok(client.includes(term), 'ZIP behavior missing: ' + term)
    }
    assert.doesNotMatch(client, /syncModalChromeOverlay|data-delta-modal-open/)
    assert.doesNotMatch(css, /data-delta-modal-open|--dtd-chrome-overlay-mask/)
    assert.match(css, /\.dtd-search-backdrop/)
    assert.match(css, /\.dtd-dialog-backdrop/)
  })
  it('leaves native image paste and drop to Harness while retaining Host Vision modules', () => {
    assert.doesNotMatch(client, /installClientVisionBridge|stopVisionBridge|data-composer-input/)
    assert.doesNotMatch(client, /document\.execCommand\(['"`]insertText/)
    assert.doesNotMatch(client, /(?:document|window)\.addEventListener\(['"`](?:paste|drop)['"`]/)
    const hostVision = file('src/host-vision.ts')
    assert.match(hostVision, /installHostVisionOps/)
    assert.match(hostVision, /registerVisionTools/)
  })
  it('does not inject private lock badges into Host session or workspace rows', () => {
    for (const marker of ['dtd-session-lock-badge', 'dtd-workspace-lock-badge',
      'data-dtd-session-locked', 'data-dtd-workspace-locked']) {
      assert.equal(client.includes(marker), false, marker)
      assert.equal(css.includes(marker), false, marker)
    }
    assert.match(client, /syncLockShieldOverlay/)
    assert.match(client, /installWorkspaceMutationGuards/)
    assert.match(client, /hiddenDeletedRows/)
    assert.match(client, /onMenuClickCapture/)
  })
  it('registers repository feature slots without a second sidebar/search adapter', () => {
    for (const id of ['dtd-advanced-features', 'delta.mcp.add-server',
      'delta.context.assistant-actions', 'delta.context.compaction-activity',
      'deltaContextCompactionStatus']) {
      assert.ok(client.includes(id), 'feature missing: ' + id)
    }
    assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
    assert.equal((client.match(/function installHostSearch\(/g) ?? []).length, 1)
  })
  it('describes workspace moves as Delta-only grouping, not a native file relocation', () => {
    for (const dictionary of [zh, en]) {
      assert.match(dictionary.sessionMenu.moveDescription, /Delta/)
      assert.match(dictionary.sessionMenu.moveDescription, /Harness/)
      assert.match(dictionary.sessionMenu.movedToast, /Delta/)
    }
  })
  it('retains ZIP translations but adds main-only context, MCP and Vision labels', () => {
    for (const dictionary of [zh, en]) {
      assert.ok(dictionary.searchPalette.tabAll)
      assert.ok(dictionary.searchPalette.tabAction)
      for (const id of ['contextFeatures', 'mcpAddAction', 'privacyVisionTitle',
        'visionSave', 'discussTask', 'compactionCompleted']) {
        assert.equal(typeof dictionary.ui[id], 'string', id)
      }
    }
  })
})

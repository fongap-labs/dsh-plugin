import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  patchSidebarRoot, patchSidebarStyle, patchHeroStyle, patchDictionary, changes,
} from '../packages/delta-suite/scripts/apply-harness-ui-patch.mjs'

test('patch operates on source contracts without checking Harness version', () => {
  const source = [
    'function SidebarRoot() {',
    '  return (',
    '    <div',
    '      ref={column}',
    '      {canStartSession && (',
    '        <div className={css.newSessionRow}>',
    "          {renderSlot('sidebar.session.action', { wide }, {",
    '            children: <button onClick={openNewSession}>New Session</button>,',
    '          })}',
    '        </div>',
    '      )}',
    '      <div className={css.scrollRegion}>',
    '        <nav className={css.panelList}>',
    '              {hasEntryActions && (',
    '                <PanelMoreMenu />',
    '              )}',
    '        </nav>',
    '      </div>',
    '    </div>',
    '  )',
    '}',
  ].join('\n')
  const patched = patchSidebarRoot(source)
  assert.equal((patched.match(/onClick=\{openNewSession\}/g) ?? []).length, 1,
    'must retain exactly one original native creation action')
  assert.ok(patched.indexOf('{wide && deltaNewSessionAction}') <
    patched.indexOf('{hasEntryActions && ('))
  assert.match(patched, /\{\(!wide \|\| panels\.length === 0\) && deltaNewSessionAction\}/)
  assert.equal(patchSidebarRoot(patched), patched, 'patch must be idempotent')
  assert.doesNotMatch(patched, /DSH_CLIENT_VERSION|0\.2\.|commit hash/)
})

test('patch fails closed on changed Harness component contracts', () => {
  assert.throws(() => patchSidebarRoot('function NewSidebar() {}'), /contract changed/)
  assert.throws(() => patchSidebarStyle('.logoRow {}'), /contract changed/)
  assert.throws(() => patchHeroStyle('.fish {}'), /contract changed/)
})

test('hero keeps native fish but moves it after the title and removes preview', () => {
  const source = '.titleGroup {}\n.fishHitbox {}\n.previewBadge {}\n'
  const patched = patchHeroStyle(source)
  assert.match(patched, /\.fishHitbox \{[\s\S]*order: 2/)
  assert.match(patched, /\.previewBadge \{ display: none; \}/)
  assert.match(patched, /data-delta-ui='delta'/)
  assert.equal(patchHeroStyle(patched), patched)
})

test('dictionary updates only requested language and key, without upstream version pins', () => {
  const source = [
    'export const zh: Record<ScheduledKey, string> = {',
    "  panel: '插件',",
    "  title: '插件',",
    '}',
    'export const en: Record<ScheduledKey, string> = {',
    "  panel: 'Plugins',",
    "  title: 'Plugins',",
    '}',
  ].join('\n')
  const zh = patchDictionary(source, 'zh', 'panel', '插件', '插件管理')
  const en = patchDictionary(zh, 'en', 'title', 'Plugins', 'Plugin Manager')
  assert.match(en, /panel: '插件管理'/)
  assert.match(en, /title: 'Plugin Manager'/)
  assert.match(en, /panel: 'Plugins'/)
  assert.equal(patchDictionary(en, 'zh', 'panel', '插件', '插件管理'), en)
  assert.throws(() => patchDictionary(source, 'zh', 'title', '别的标题', '插件管理'), /contract changed/)
  assert.equal(changes.length, 7)
})

test('native layout changes are scoped to Delta and preserve official mode', () => {
  const css = patchSidebarStyle('.logoRow {}\n.panelList {}\n.newSessionRow {}\n')
  assert.match(css, /html\[data-delta-ui='delta'\]/)
  assert.match(css, /sidebar-style/)
  assert.doesNotMatch(css, /:global\(html\) \.brand/)
  assert.equal(patchSidebarStyle(css), css)
})

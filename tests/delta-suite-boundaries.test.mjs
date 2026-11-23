import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { patchSidebarRoot, patchSidebarStyle, patchHeroStyle, patchDictionary, changes,
  patchAccountMenu, patchAccountMenuStyle, patchSettingsRoot, patchSettingsRootStyle }
  from '../packages/delta-suite/scripts/apply-harness-ui-patch.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const base = 'packages/delta-suite/src/'

test('Suite composition, kernel and adapter are separate modules', () => {
  const entry = read(base + 'index.ts')
  const composition = read(base + 'delta-suite-composition.ts')
  const kernel = read(base + 'delta-suite-kernel/feature-lifecycle-registry.ts')
  const adapter = read(base + 'delta-suite-adapter/host-capability-contract.ts')
  assert.match(entry, /export \{ apply \} from '\.\/delta-suite-composition\.js'/)
  assert.match(composition, /new DeltaFeatureRegistry<PrivacyHostContext>/)
  assert.match(composition, /registry\.mount\(ctx, new Set<string>\(\)\)/)
  assert.match(kernel, /class DeltaFeatureRegistry/)
  assert.match(kernel, /for \(let index = this\.cleanups\.length - 1; index >= 0; index--\)/)
  assert.doesNotMatch(kernel, /@deepseek-ai\//)
  assert.match(adapter, /function negotiateHostCapabilities/)
  assert.doesNotMatch(adapter, /window\.|document\.|_core|_host|\.prototype\./)
})

test('Legacy import paths remain re-exports, never duplicate implementations', () => {
  assert.match(read(base + 'feature-registry.ts'), /export \* from '\.\/delta-suite-kernel\/feature-lifecycle-registry\.js'/)
  assert.match(read(base + 'host-capabilities.ts'), /export \* from '\.\/delta-suite-adapter\/host-capability-contract\.js'/)
  const entry = read(base + 'index.ts')
  assert.match(entry, /export const name = '@fongap-labs\/delta-suite'/)
  assert.match(entry, /export const inject: string\[\] = \[\]/)
})


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
  assert.equal(changes.length, 16)
})

test('native layout changes are scoped to Delta and preserve official mode', () => {
  const css = patchSidebarStyle('.logoRow {}\n.panelList {}\n.newSessionRow {}\n')
  assert.match(css, /html\[data-delta-ui='delta'\]/)
  assert.match(css, /sidebar-style/)
  assert.doesNotMatch(css, /:global\(html\) \.brand/)
  assert.equal(patchSidebarStyle(css), css)
})


test('account footer patch reuses native account state and sign-out confirmation', () => {
  const original = [
    "import {",
    "  Toast, Menu, IconEllipsisOutlineMedium, IconPaperPlaneOutlineRegular, IconSettingsOutlineRegular, IconUserOutlineRegular,",
    "} from '@deepseek-ai/dsh-client-ui-primitives'",
    "import { AccountAvatar } from './AccountAvatar.tsx'",
    "function AccountMenu() {",
    "  const [open, setOpen] = useState(false)",
    "  return <div className={css.root} data-inset={signedIn && wide}>",
    "    <Menu anchor={<button>",
    '        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>',
    "       {signedIn ? <AccountAvatar />",
    "          : <IconEllipsisOutlineMedium size={14} />}",
    "    </button>} />",
    "    {account.loginVisible && !account.onboarding && <SignInDialog",
    "      start={start} cancel={cancel} />}",
    "    {signedIn && signOutImpact !== undefined && <SignOutDialog running={signOutImpact} signOut={signOut} />}",
    "  </div>",
    "}",
  ].join('\n')
  const patched = patchAccountMenu(original)
  assert.match(patched, /<FishLogo size=\{24\}/)
  assert.match(patched, /AccountAvatar/)
  assert.match(patched, /disabled=\{busy\}/)
  assert.match(patched, /signedIn \? t\('signOut'\) : t\('signIn'\)/)
  assert.match(patched, /if \(signedIn\) void requestSignOut\(\); else beginSignIn\(\)/)
  assert.match(patched, /openSettings\(\)/)
  assert.match(patched, /SignInDialog/)
  assert.match(patched, /SignOutDialog/)
  assert.match(patched, /Menu anchor=/, 'keep native Feedback menu available')
  assert.match(patched, /<div className=\{css\.deltaHoverCard\} role="tooltip">/)
  assert.match(patched, /deltaHover && !open/)
  assert.match(patched, /account\.details\.balance\.value\.map/)
  assert.match(patched, /formatBalance\(wallet\.balance/)
  assert.match(patched, /hoverLabels\.today/)
  assert.match(patched, /hoverLabels\.missing/, 'never manufacture a daily cost or zero balance')
  assert.match(patched, /refreshAccount\(\)\.catch/, 'reuse Host refresh with no extra credential transport')
  assert.match(patched, /onMouseLeave=/)
  assert.match(patched, /onBlur=/)
  assert.equal(patchAccountMenu(patched), patched)
  assert.throws(() => patchAccountMenu(original.replace('IconEllipsisOutlineMedium', 'UnknownIcon')), /contract changed/)
})

test('footer order is avatar then native update then settings and account action', () => {
  const source = [
    '      <div className={clsx(css.triggerRow, !wide && css.railRow)}>',
    "        <ConnectionIndicator",
    "          onReconnect={reconnect}",
    "        />",
    "        <DesktopUpdateIndicator wide={wide}",
    "          t={t} view={desktopUpdate} onOpen={openDesktopUpdate} />",
    "      </div>",
  ].join('\n')
  const patched = patchSettingsRoot(source)
  assert.match(patched, /data-delta-footer-connection/)
  assert.match(patched, /data-delta-footer-update/)
  assert.equal((patched.match(/onOpen=\{openDesktopUpdate\}/g) ?? []).length, 1)
  assert.equal(patchSettingsRoot(patched), patched)

  const accountCSS = patchAccountMenuStyle('.root {}\n.anchor {}\n.trigger {}\n.avatar {}')
  const settingsCSS = patchSettingsRootStyle('.triggerRow {}\n.triggerRow.railRow {}\n.trigger {}')
  assert.match(accountCSS, /\.anchor \{[\s\S]*order: 0/)
  assert.match(accountCSS, /\.deltaActions \{[\s\S]*order: 2/)
  assert.match(settingsCSS, /data-delta-footer-update[^]*order: 1/)
  assert.match(accountCSS, /width: 24px; height: 24px/)
  assert.match(accountCSS, /deltaHoverCard/)
  assert.match(accountCSS, /pointer-events: none/)
  assert.match(accountCSS, /data-delta-ui="delta"/)
  assert.match(settingsCSS, /button svg \{[\s\S]*width: 24px; height: 24px/)
  assert.match(settingsCSS, /\[data-delta-footer-update\]:empty/)
  assert.match(settingsCSS, /data-delta-footer-connection/)
  assert.equal(patchAccountMenuStyle(accountCSS), accountCSS)
  assert.equal(patchSettingsRootStyle(settingsCSS), settingsCSS)
})

test('new footer patches fail closed instead of pinning a Harness version', () => {
  for (const patch of [patchAccountMenu, patchSettingsRoot, patchAccountMenuStyle, patchSettingsRootStyle]) {
    assert.throws(() => patch('unrelated component'), /contract changed/)
  }
  for (const item of changes) assert.doesNotMatch(item.file, /0[.]2[.]|2026/)
  assert.equal(changes.filter(item => item.package.endsWith('ui-settings-account')).length, 2)
  assert.equal(changes.filter(item => item.package.endsWith('ui-settings-general')).length, 3)
})


test('Host source patch upgrades pre-patched v1 footer without duplicating account chrome', () => {
  const oldFooter = [
    "import { AccountAvatar } from './AccountAvatar.tsx'",
    "function AccountMenu() {",
    "  const [open, setOpen] = useState(false)",
    "  // delta-suite:footer-ui-v1 account",
    "  return <div data-delta-footer-wide={wide ? 'true' : 'false'}>",
    "    <Menu anchor={<button",
    '        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>',
    "    </button>} />",
    "    {account.loginVisible && !account.onboarding && <SignInDialog />}",
    "  </div>",
    "}",
  ].join('\n')
  const upgraded = patchAccountMenu(oldFooter)
  assert.match(upgraded, /delta-suite:account-hover-v1/)
  assert.match(upgraded, /deltaHoverCard/)
  assert.match(upgraded, /hoverLabels\.missing/)
  assert.equal(patchAccountMenu(upgraded), upgraded)
  assert.equal((upgraded.match(/delta-suite:footer-ui-v1 account/g) ?? []).length, 1)

  const oldCss = '/* delta-suite:footer-ui-v1 account-style */\n.root {}\n.anchor {}\n.trigger {}\n.avatar {}\n'
  const css = patchAccountMenuStyle(oldCss)
  assert.match(css, /delta-suite:account-hover-style-v1/)
  assert.match(css, /\.deltaHoverCard \{/)
  assert.match(css, /\.deltaHoverRow \{/)
  assert.equal(patchAccountMenuStyle(css), css)
})

test('today spending remains explicitly unavailable until authenticated platform figures are verified', () => {
  const script = read('packages/delta-suite/scripts/apply-harness-ui-patch.mjs')
  assert.match(script, /today: '今日消费'/)
  assert.match(script, /missing: '暂无数据'/)
  assert.match(script, /<strong>\{hoverLabels\.missing\}<\/strong>/)
  assert.doesNotMatch(script, /todaySpend\s*=\s*wallet|balanceDelta\s*=|lastBalance\s*-/)
  assert.doesNotMatch(script, /<small className=\{css\.deltaHoverHint\}>/)
  const copy = read('packages/delta-suite/README.md')
  assert.ok(copy.includes('不自动使用余额下降代替消费'))
  assert.ok(copy.includes('鉴权、统计范围及时区验收'))
})


test('installed Delta Suite actually mounts its native presentation compatibility', () => {
  const client = read(base + 'client.ts')
  assert.match(client, /const stopLivePresentation = installLiveNativePresentation\(controller, Boolean\(livePortal\)\)/)
  assert.match(client, /stopLivePresentation\(\)/, 'unload must dispose the adapter')
  assert.match(client, /document\.documentElement\.setAttribute\('data-delta-ui', 'delta'\)/)
  assert.match(client, /scope\.slots\.inject\('sidebar\.session\.action'/,
    'native New Session placement must preserve the Host HOC')
  assert.match(client, /livePortal\(props\.children, anchor\)/,
    'do not proxy New Session clicks or copy its action')
  assert.match(client, /view\.mode === 'delta' && props\.wide && anchor/,
    'do not alter official theme or collapsed sidebar actions')
  assert.match(client, /data-dtd-live-logo-row/)
  assert.match(client, /data-dtd-live-preview/)
  assert.match(client, /data-dtd-live-hero-fish/)
  assert.match(client, /getLiveSessionTarget/)
  assert.match(client, /if \(isDisposed \|\| isSyncing\) return/,
    'native presentation must not keep writing after disposal')
  assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
  assert.doesNotMatch(client, /process\.env\.DSH_CLIENT_VERSION\s*===/,
    'do not bind UI compatibility to a Harness build version')
})

test('live presentation preserves native actions and restores all owned changes', () => {
  const client = read(base + 'client.ts')
  assert.match(client, /const labelChanges = new Map/)
  assert.match(client, /const ariaChanges = new Map/)
  assert.match(client, /labelChanges\.clear\(\)/)
  assert.match(client, /ariaChanges\.clear\(\)/)
  assert.match(client, /publishLiveSessionTarget\(null\)/)
  assert.match(client, /controller\.getSnapshot\(\)\.mode !== 'delta'\) \{ rollback\(\); return \}/)
  assert.match(client, /observer\?\.disconnect\(\)/)
  assert.match(client, /tag\.remove\(\)/)
  assert.match(client, /if \(canUsePortal && scheduleRow && nav\)/)
  assert.match(client, /source instanceof HTMLElement\) mark\(source, 'session-source'\)/)
})

test('Delta sidebar pins cannot unmount the scheduled-task navigation layout', () => {
  const client = read(base + 'client.ts')
  assert.match(client, /mark\(button, 'primary-unpin'\)/)
  assert.match(client, /mark\(moreRow, 'more'\)/)
  assert.match(client, /unmark\(moreRow, 'more'\)/)
  assert.match(client, /data-dtd-live-primary-unpin/)
  assert.match(client, /data-dtd-live-more/)
  assert.match(client, /width: 16px !important/)
  assert.match(client, /translateY\(-2px\)/)
  assert.match(client, /syncFooter\(sidebar\)/)
  assert.match(client, /data-dtd-live-footer-card/)
  assert.match(client, /activeSessionId\?: string/)
  assert.match(client, /readLiveAccountState/)
  assert.ok(client.includes('values[1]!.textContent = uiCopy.dataUnavailable'))
  for (const language of ['zh', 'en']) {
    const dictionary = JSON.parse(read(`packages/delta-suite/locale/${language}.json`))
    assert.ok(dictionary.ui.dataUnavailable?.trim(), 'missing unavailable copy: ' + language)
  }
})

test('Delta Suite contains no proxy or Vision Bridge service registration or front-end settings', () => {
  const composition = read('packages/delta-suite/src/delta-suite-composition.ts')
  const main = read('packages/delta-suite/src/index.ts')
  const client = read(base + 'client.ts')
  const zh = JSON.parse(read('packages/delta-suite/locale/zh.json'))
  const en = JSON.parse(read('packages/delta-suite/locale/en.json'))
  for (const removed of ['installHostProxyManager', 'installHostVisionOps', 'integrations.proxy-settings', 'integrations.vision-bridge']) {
    assert.equal(composition.includes(removed), false, removed)
    assert.equal(main.includes(removed), false, removed)
  }
  for (const removed of ['saveProxy(', 'saveVision(', 'testVisionEngine(', 'data-delta-proxy-card',
    'data-delta-vision-card', 'PrivacyVisionSettings', 'copy.networkProxy', 'copy.visionBridge']) {
    assert.equal(client.includes(removed), false, removed)
  }
  for (const copy of [en, zh]) {
    assert.equal('networkProxy' in copy, false)
    assert.equal('visionBridge' in copy, false)
    assert.equal(Object.keys(copy.ui).some(x => x.startsWith('vision')), false)
  }
  const policy = read('packages/delta-suite/src/privacy-bridge.ts')
  assert.doesNotMatch(policy, /redactModelRequest|Object\.defineProperty|listModels\(/)
  assert.equal(policy.includes('requestVisionDescription'), false)
})

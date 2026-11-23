import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'
import { patchAccountMenu, patchAccountMenuStyle, patchCurrentVersionStyle, patchHeroStyle,
  patchSettingsRootStyle, patchDictionary, patchSessionLogBackend, patchSessionLogSettings,
  patchSidebarStyle, patchSessionMenuOrder, auditThemeTokens, changes } from '../packages/delta-suite/scripts/apply-harness-ui-patch.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const palette = read('packages/delta-suite/src/client-theme-tokens.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installHostSearch(')
const end = normalizedSource.indexOf('\nwindow.__ModuleLoader__.load(', begin)

const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Settings navigation remains under Harness layout and label ownership', () => {
  assert.doesNotMatch(source, /const syncSettingsNav\s*=|data-dtd-nav-tail/)
  assert.doesNotMatch(source, /setAttribute\(['"]data-delta-compat/)
  assert.doesNotMatch(source, /const replaceButtonText\s*=/)
})

test('ZIP3 release verifier rejects reintroduced native Settings layout activation', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = 'const initialCopy = DICTIONARIES[language()] ?? DICTIONARIES.en'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned public Search region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + "\n    document.documentElement.dataset.deltaCompat = '1'")
  assert.notEqual(tampered, normalizedSource, 'negative fixture must mutate the reviewed Search region')
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

test('Delta account footer suppresses click menu but preserves hover and native official mode', () => {
  const fixture = [
    "IconEllipsisOutlineMedium, IconPaperPlaneOutlineRegular, IconSettingsOutlineRegular, IconUserOutlineRegular,",
    "import { AccountAvatar } from './AccountAvatar.tsx'",
    "  const [open, setOpen] = useState(false)",
    "  return <div className={css.root} data-inset={signedIn && wide}>",
    '        aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>',
    '          : <IconEllipsisOutlineMedium size={14} />}',
    '    {account.loginVisible && !account.onboarding && <SignInDialog',
  ].join('\n')
  const patched = patchAccountMenu(fixture)
  assert.match(patched, /dataset\.deltaUi !== 'delta' \|\| !wide/)
  assert.match(patched, /onMouseEnter=\{hoverAccountDetails\}/)
  assert.match(patched, /setOpen\(value => !value\)/, 'official and narrow mode retains the native menu')
  assert.match(patched, /className=\{css\.deltaHoverValue\}/)
  assert.doesNotMatch(patched, /<strong>/)
  assert.equal(patchAccountMenu(patched), patched, 'upgrade is idempotent')
})

test('native Delta footer, hero and version CSS use scoped Delta tokens and remain idempotent', () => {
  const account = patchAccountMenuStyle('.root { }\n.anchor { }\n.trigger { }\n.avatar { }\n')
  assert.match(account, /--dtd-popup-bg/)
  assert.match(account, /font-weight: 400/)
  assert.equal(patchAccountMenuStyle(account), account)

  const updater = patchSettingsRootStyle('.triggerRow { }\n.triggerRow.railRow { }\n.trigger { }\n')
  assert.match(updater, /--dtd-brand/)
  assert.match(updater, /data-delta-footer-update/)
  assert.equal(patchSettingsRootStyle(updater), updater)

  const hero = patchHeroStyle('.titleGroup { }\n.fishHitbox { }\n.previewBadge { }\n')
  assert.match(hero, /translateY\(-4px\)/)
  assert.match(hero, /--dtd-fg-primary/)
  assert.equal(patchHeroStyle(hero), hero)

  const version = patchCurrentVersionStyle('.row { padding: 16px; }')
  assert.match(version, /html\[data-delta-ui="delta"\]/)
  assert.match(version, /\.row \{ display: none; \}/)
  assert.equal(patchCurrentVersionStyle(version), version)
})

test('chat status translation changes only task execution copy, keeping timer interpolation', () => {
  let locale = [
    'export const zh = {',
    "  'chat.deepDiving': '深度求索中',",
    "  'chat.deepDivingFor': '深度求索中，用时 {duration} ···',",
    '}',
    'export const en = {',
    "  'chat.deepDiving': 'Deep diving',",
    "  'chat.deepDivingFor': 'Deep diving for {duration} ···',",
    '}',
  ].join('\n')
  const pairs = [
    ['zh', 'chat.deepDiving', '深度求索中', '任务执行中'],
    ['zh', 'chat.deepDivingFor', '深度求索中，用时 {duration} ···', '任务执行中，用时 {duration} ···'],
    ['en', 'chat.deepDiving', 'Deep diving', 'Task in progress'],
    ['en', 'chat.deepDivingFor', 'Deep diving for {duration} ···', 'Task in progress for {duration} ···'],
  ]
  for (const entry of pairs) locale = patchDictionary(locale, ...entry)
  assert.ok(locale.includes('任务执行中，用时 {duration}'))
  assert.match(locale, /Task in progress for \{duration\}/)
  for (const entry of pairs) assert.equal(patchDictionary(locale, ...entry), locale)
  assert.ok(changes.some(item => item.file === 'src/client/CurrentVersionRow.module.css'))
  assert.ok(changes.some(item => item.package === '@deepseek-ai/dsh-client-ui-chat'
    && item.file === 'src/client/locale.ts'))
})

test('runtime leaves native account footer and hero markup unchanged', () => {
  for (const removed of ['LIVE_PRESENTATION_CSS', 'installLiveNativePresentation',
    'footerCard.innerHTML', 'data-dtd-live-footer-update-slot',
    'data-dtd-live-hero-fish']) {
    assert.equal(source.includes(removed), false, 'retired DOM takeover remains: ' + removed)
  }
})

test('Delta disables Session Log uploads even when an old profile has enabled=true', () => {
  const host = [
    "export const name = 'session-log-deepseek'",
    'export const Config = z.object({',
    '  enabled: z.boolean().default(true).volatile(),',
    '})',
    'prepare: (request) => {',
    '        if (!config.enabled.get()) return undefined',
    '  }',
  ].join('\n')
  const changed = patchSessionLogBackend(host)
  assert.match(changed, /default\(false\)/)
  assert.match(changed, /function deltaAllowsSessionLogUpload\(\): boolean \{ return false \}/)
  assert.match(changed, /if \(!deltaAllowsSessionLogUpload\(\)\) return undefined/)
  assert.equal(patchSessionLogBackend(changed), changed)
})

test('Delta removes native Session Log switch registration, not just switch styling', () => {
  const host = [
    "import { UploadRow, UploadToast, type UploadInjected } from './UploadRow.tsx'",
    "  ctx.effect(() => ctx.configForms.whileServed([namespace], () => ctx.slots.inject('settings.general.item', () =>",
    "    ctx.slots.register({ name: 'settings.general.item', id: namespace, order: 90, locale, inject: face }, UploadRow))))",
  ].join('\n')
  const changed = patchSessionLogSettings(host)
  assert.doesNotMatch(changed, /ctx\.slots\.inject\('settings\.general\.item'/)
  assert.match(changed, /delta-suite:hide-session-log-preference-v1/)
  assert.equal(patchSessionLogSettings(changed), changed)
})

test('native navigation placement remains under Harness ownership', () => {
  assert.doesNotMatch(source, /mark\(nav, 'pinned-nav'\)/)
  assert.doesNotMatch(source, /data-dtd-live-pinned-nav/)
  assert.doesNotMatch(source, /installLiveNativePresentation/)
  const pkg = JSON.parse(read('packages/delta-suite/package.json'))
  assert.equal(pkg.files.includes('scripts/apply-harness-ui-patch.mjs'), false)
})

test('privacy panel retains PIN controls but removes explanatory claims and badges', () => {
  assert.match(source, /copy\.privacy\.title/)
  assert.doesNotMatch(source, /copy\.privacy\.description/)
  assert.doesNotMatch(source, /copy\.privacy\.statusEnforced/)
  assert.doesNotMatch(source, /const privacyItems =/)
  assert.match(source, /data-delta-privacy-card/)
  assert.match(source, /dtd-pin-manage-row/)
})


test('native Session context menu puts rename before pin without changing handlers', () => {
  const source = [
    "  register('pin', 100, ['workspace/pinSession', 'workspace/unpinSession'], target =>",
    "  register('rename', 200, ['session/rename'], target =>",
    "  register('fork', 300, ['session/fork'], target =>",
  ].join('\n')
  const next = patchSessionMenuOrder(source)
  assert.match(next, /register\('rename', 50,/)
  assert.match(next, /register\('pin', 100,/)
  assert.match(next, /register\('fork', 300,/)
  assert.equal(patchSessionMenuOrder(next), next)
  assert.throws(() => patchSessionMenuOrder('incompatible native session menu'), /contract changed/)
  assert.ok(changes.some(item => item.package === '@deepseek-ai/dsh-client-ui-workspace'
    && item.file === 'src/client/session-actions/context-menus.tsx'))
})

test('native menu material and all interactive semantic colors use Delta theme variables', () => {
  const menuTokens = [
    '--dsw-menu-surface-fill',
    '--dsw-menu-backdrop-filter',
    '--dsw-alias-menu-icon',
    '--dsw-hovercard-bg',
    '--dsw-alias-hovercard-bg',
    '--dsw-alias-hovercard-label-primary',
    '--dsw-alias-hovercard-label-secondary',
    '--dsw-alias-hovercard-label-tertiary',
    '--dsw-alias-hovercard-state-done',
    '--dsw-alias-hovercard-state-error',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-alias-interactive-bg-hover-danger',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-label-tertiary',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-state-idle-primary',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-alias-scrollbar-bg-l2',
    '--dsw-alias-scrollbar-hover-l2',
  ]
  for (const key of menuTokens) {
    assert.ok(palette.includes("'" + key + "':"), 'missing Delta theme mapping for ' + key)
  }
  assert.match(palette, /'--dsw-menu-backdrop-filter': \{ light: 'none', dark: 'none' \}/)
  assert.match(palette, /'--dsw-menu-surface-fill': DELTA_PALETTE\.popupBg/)
  assert.match(palette, /'--dsw-alias-hovercard-bg': DELTA_PALETTE\.popupBg/)
  assert.match(palette, /'--dsw-alias-hovercard-label-primary': DELTA_PALETTE\.labelPrimary/)
  assert.match(palette, /'--dsw-alias-hovercard-label-secondary': DELTA_PALETTE\.labelSecondary/)
  assert.match(palette, /'--dsw-alias-hovercard-label-tertiary': DELTA_PALETTE\.labelMuted/)
  assert.match(palette, /'--dsw-alias-bg-layer-1': DELTA_PALETTE\.surface/)
})


test('theme coverage audit detects new upstream semantic colors without version pinning', () => {
  const fixture = [
    'body {',
    '  --dsw-menu-surface-fill: white;',
    '  --dsw-alias-label-primary: black;',
    '  --dsw-alias-some-future-color: rebeccapurple;',
    '}',
  ].join('\n')
  const report = auditThemeTokens(fixture, palette)
  assert.equal(report.official, 3)
  assert.equal(report.mapped, 2)
  assert.deepEqual(report.unmapped, ['--dsw-alias-some-future-color'])
  const covered = auditThemeTokens([
    'body {',
    '  --dsw-menu-surface-fill: white;',
    '  --dsw-alias-label-primary: black;',
    '}',
  ].join('\n'), palette)
  assert.deepEqual(covered, { official: 2, mapped: 2, unmapped: [] })
})


test('native session hover card uses accessible Delta colors in light and dark modes', () => {
  const mapping = {
    '--dsw-alias-hovercard-bg': 'popupBg',
    '--dsw-alias-hovercard-label-primary': 'labelPrimary',
    '--dsw-alias-hovercard-label-secondary': 'labelSecondary',
    '--dsw-alias-hovercard-label-tertiary': 'labelMuted',
  }
  for (const [token, role] of Object.entries(mapping)) {
    assert.ok(palette.includes("'" + token + "': DELTA_PALETTE." + role),
      'missing native hover-card palette mapping for ' + token)
  }

  const colors = role => {
    const row = palette.split('\n').find(line => line.trim().startsWith(role + ': { light:'))
    assert.ok(row, 'missing two-mode color role ' + role)
    const hex = row.match(/#[a-fA-F0-9]{6}\b/g)
    assert.equal(hex?.length, 2, 'expected explicit light/dark colors for ' + role)
    return { light: hex[0], dark: hex[1] }
  }
  const brightness = hex => {
    const channels = [1, 3, 5].map(index =>
      Number.parseInt(hex.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  const contrast = (a, b) => {
    const values = [brightness(a), brightness(b)].sort((x, y) => y - x)
    return (values[0] + 0.05) / (values[1] + 0.05)
  }
  const bg = colors('popupBg')
  for (const role of ['labelPrimary', 'labelSecondary', 'labelMuted']) {
    const fg = colors(role)
    for (const scheme of ['light', 'dark']) {
      assert.ok(contrast(fg[scheme], bg[scheme]) >= 4.5,
        'native session hover-card text contrast below 4.5:1 for ' + role + ' in ' + scheme)
    }
  }
})

test('extracted native palette keeps the same public browser entry and Theme override', () => {
  assert.match(palette, /const DELTA_PALETTE =/)
  assert.match(palette, /const TOKENS: Record<string,/)
  assert.doesNotMatch(source, /const DELTA_PALETTE =/)
  assert.doesNotMatch(source, /const TOKENS: Record<string,/)
  assert.match(source, /activeTheme\.overrideTokens\(DELTA_SUITE_OWNER, TOKENS\)/)
  assert.match(source, /window\.__ModuleLoader__\.load\(\{/)
  assert.doesNotMatch(palette, /^\s*(?:import|export)\s/m)
})

test('build concatenates the compiled palette in one client without second module', () => {
  const tsconfig = JSON.parse(read('packages/delta-suite/tsconfig.client.json'))
  const finalizer = read('packages/delta-suite/scripts/finalize-client.mjs')
  assert.ok(tsconfig.include.includes('src/client-theme-tokens.ts'))
  assert.ok(tsconfig.include.includes('src/client.ts'))
  assert.match(finalizer, /lib\/client-theme-tokens\.js/)
  assert.match(finalizer, /paletteSource \+ '\\n' \+ source/)
  assert.match(finalizer, /unlinkSync\(palettePath\)/)
  assert.match(palette, /'--dsw-menu-surface-fill': DELTA_PALETTE\.popupBg/)
})

test('Delta owned feature CSS uses defined Delta tokens without native fallbacks', () => {
  const css = read('packages/delta-suite/src/feature-extras.css')
  const defined = new Set([...theme.matchAll(/(--dtd-[a-z0-9-]+)\s*:/g)].map(x => x[1]))
  assert.doesNotMatch(css, /--dsw-[a-z0-9-]+/)
  assert.doesNotMatch(css, /color:\s*inherit\s*;/)
  const used = new Set([...css.matchAll(/var\((--dtd-[a-z0-9-]+)/g)].map(x => x[1]))
  assert.ok(used.size >= 12)
  for (const key of used) assert.ok(defined.has(key), 'undefined owned token ' + key)
})

test('Delta colors remain scoped and use public reversible Theme API', () => {
  assert.match(theme, /:root\[data-delta-ui="delta"\]/)
  assert.match(theme, /data-ds-dark-theme/)
  assert.match(source, /activeTheme\.overrideTokens\(DELTA_SUITE_OWNER, TOKENS\)/)
  assert.match(source, /ownedLayer\?\.\(\)/)
  assert.doesNotMatch(theme, /\[role=["'](?:menu|menuitem|tooltip|listbox)["']\]/)
  const css = read('packages/delta-suite/src/feature-extras.css')
  assert.doesNotMatch(css, /\[class[*~^$|]?=/)
})

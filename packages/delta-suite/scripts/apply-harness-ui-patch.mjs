#!/usr/bin/env node
/** Delta build-time UI patch. Feature/structure detection, no Harness version pin. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MARK = 'delta-suite:native-ui-v1'
function requireShape(ok, where) {
  if (!ok) throw new Error('[delta-suite patch] upstream contract changed: ' + where)
}
function replaceUnique(source, needle, replacement, where) {
  const at = source.indexOf(needle)
  requireShape(at >= 0 && source.indexOf(needle, at + needle.length) < 0, where)
  return source.slice(0, at) + replacement + source.slice(at + needle.length)
}

export function patchSidebarRoot(source) {
  if (source.includes(MARK + ' sidebar')) return source
  const begin = '      {canStartSession && (\n        <div className={css.newSessionRow}>'
  const endMark = '      <div className={css.scrollRegion}>'
  const at = source.indexOf(begin)
  const end = source.indexOf(endMark, at + begin.length)
  requireShape(at >= 0 && source.indexOf(begin, at + 1) < 0 && end > at, 'native New Session container')
  const section = source.slice(at, end)
  const suffix = '\n      )}\n'
  const closing = section.lastIndexOf(suffix)
  requireShape(closing > 0 && section.slice(closing + suffix.length).trim() === '', 'New Session closing JSX')
  const markup = section.slice('      {canStartSession && (\n'.length, closing)
  requireShape(markup.includes("renderSlot('sidebar.session.action'") &&
    markup.includes('onClick={openNewSession}') &&
    markup.includes('className={css.newSessionRow}'), 'native New Session action')
  let next = source.slice(0, at) +
    '      {(!wide || panels.length === 0) && deltaNewSessionAction}\n\n' + source.slice(end)
  const returnAnchor = '  return (\n    <div\n      ref={column}'
  next = replaceUnique(next, returnAnchor,
    '  // ' + MARK + ' sidebar\n' +
    '  const deltaNewSessionAction = canStartSession ? (\n' +
    markup + '\n  ) : null\n\n' + returnAnchor, 'SidebarRoot component return')
  const listAnchor = '              {hasEntryActions && (\n                <PanelMoreMenu'
  next = replaceUnique(next, listAnchor,
    '              {wide && deltaNewSessionAction}\n' + listAnchor, 'panel list before More')
  return next
}

const sidebarCSS = [
  "/* Scope to Delta; never hide native sidebar toggle or clone its handler. */",
  ":global(html[data-delta-ui='delta']) .brand { display: none; }",
  ":global(html[data-delta-ui='delta'][data-windows-titlebar]) .logoRow,",
  ":global(html[data-delta-ui='delta'][data-platform='darwin']) .logoRow {",
  "  height: 0; min-height: 0; margin: 0; padding: 0; overflow: visible;",
  "}",
  ":global(html[data-delta-ui='delta']:not([data-windows-titlebar]):not([data-platform='darwin'])) .logoRow {",
  "  height: 28px; min-height: 28px; /* retain non-native sidebar opener */",
  "}",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionRow { margin: 0 4px; width: auto; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSession {",
  "  justify-content: flex-start; height: 36px; border: 0; background: transparent; padding: 8px 12px;",
  "}",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionLabelMask { flex: 0 1 auto; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionContent { justify-content: flex-start; gap: 8px; }",
  ":global(html[data-delta-ui='delta']) .panelList .newSessionShortcut { display: none; }",
].join('\n')

export function patchSidebarStyle(source) {
  if (source.includes(MARK + ' sidebar-style')) return source
  requireShape(source.includes('.logoRow {') && source.includes('.panelList {') &&
    source.includes('.newSessionRow {'), 'sidebar stylesheet')
  return source + '\n/* ' + MARK + ' sidebar-style */\n' + sidebarCSS + '\n'
}

const heroCSS = [
  ":global(html[data-delta-ui='delta']) .titleGroup { order: 1; }",
  ":global(html[data-delta-ui='delta']) .fishHitbox {",
  "  order: 2; align-self: center; transform: translateY(-6px);",
  "}",
  ":global(html[data-delta-ui='delta']) .previewBadge { display: none; }",
].join('\n')

export function patchHeroStyle(source) {
  if (source.includes(MARK + ' hero-style')) return source
  requireShape(source.includes('.titleGroup {') && source.includes('.fishHitbox {') &&
    source.includes('.previewBadge {'), 'hero stylesheet')
  return source + '\n/* ' + MARK + ' hero-style */\n' + heroCSS + '\n'
}

export function patchDictionary(source, lang, key, before, after) {
  const declaration = 'export const ' + lang
  const begin = source.indexOf(declaration)
  const lineEnd = source.indexOf('\n', begin)
  const firstLine = begin >= 0 ? source.slice(begin, lineEnd < 0 ? undefined : lineEnd) : ''
  requireShape(begin >= 0 && firstLine.includes('= {') &&
    source.indexOf(declaration, begin + declaration.length) < 0, 'missing/ambiguous dictionary ' + lang)
  const following = source.indexOf('\nexport const ', begin + declaration.length)
  const end = following < 0 ? source.length : following
  const part = source.slice(begin, end)
  const keyPattern = key.replaceAll('.', '\\.')
  const line = new RegExp("(^[ \\t]*['\"]?" + keyPattern + "['\"]?[ \\t]*:[ \\t]*')([^'\"\\n]*)(['\"][^\\n]*$)", 'm')
  const found = part.match(line)
  requireShape(found && found.index !== undefined, lang + '.' + key + ' entry')
  requireShape(found[2] === before || found[2] === after, lang + '.' + key + ' value')
  if (found[2] === after) return source
  const replaced = part.slice(0, found.index) + found[1] + after + found[3] +
    part.slice(found.index + found[0].length)
  return source.slice(0, begin) + replaced + source.slice(end)
}

function dictionary(entries) {
  return source => entries.reduce((result, entry) => patchDictionary(result, ...entry), source)
}

/** Preserve native AccountMenu state, dialogs and callbacks; add Delta-only icons. */
export function patchAccountMenu(source) {
  const marker = 'delta-suite:footer-ui-v1 account'
  if (source.includes(marker)) return source
  let next = replaceUnique(source,
    'IconEllipsisOutlineMedium, IconPaperPlaneOutlineRegular, IconSettingsOutlineRegular, IconUserOutlineRegular,',
    'IconEllipsisOutlineMedium, IconPaperPlaneOutlineRegular, IconSettingsOutlineRegular, IconUserOutlineRegular, FishLogo,',
    'AccountMenu icon imports')
  next = replaceUnique(next,
    '  return <div className={css.root} data-inset={signedIn && wide}>',
    "  // " + marker + "\n  return <div className={css.root} data-inset={signedIn && wide} data-delta-footer-wide={wide ? 'true' : 'false'}>",
    'AccountMenu root')
  next = replaceUnique(next,
    '          : <IconEllipsisOutlineMedium size={14} />}',
    [
      '          : <>',
      '            <span className={css.deltaGuestMark}><FishLogo size={24} /></span>',
      '            <span className={css.officialGuestMark}><IconEllipsisOutlineMedium size={14} /></span>',
      '          </>}',
    ].join('\n'),
    'AccountMenu signed-out icon')
  next = replaceUnique(next,
    "    {account.loginVisible && !account.onboarding && <SignInDialog",
    [
      "    <div className={css.deltaActions} role=\"group\" aria-label={t('menu')}>",
      "      <button type=\"button\" className={css.deltaIconButton} aria-label={t('settings')}",
      "        title={t('settings')} aria-keyshortcuts={settingsShortcut?.aria}",
      "        onClick={() => { setOpen(false); openSettings() }}>",
      "        <IconSettingsOutlineRegular size={24} />",
      "      </button>",
      "      <button type=\"button\" className={css.deltaIconButton} aria-label={signedIn ? t('signOut') : t('signIn')}",
      "        title={signedIn ? t('signOut') : t('signIn')} disabled={busy}",
      "        onClick={() => { if (signedIn) void requestSignOut(); else beginSignIn() }}>",
      "        {signedIn ? <LogoutIcon /> : <IconUserOutlineRegular size={24} />}",
      "      </button>",
      "    </div>",
      "    {account.loginVisible && !account.onboarding && <SignInDialog",
    ].join('\n'),
    'AccountMenu native dialogs')
  return patchAccountHover(next)
}

function patchAccountHover(source) {
  if (source.includes('delta-suite:account-hover-v1')) return source
  let next = source
  next = replaceUnique(next, "import { AccountAvatar } from './AccountAvatar.tsx'", "import { AccountAvatar } from './AccountAvatar.tsx'\nimport { formatBalance } from './formatBalance.ts'", "account existing formatter")
  next = replaceUnique(next, "  const [open, setOpen] = useState(false)", "  const [open, setOpen] = useState(false)\n  // delta-suite:account-hover-v1\n  const [deltaHover, setDeltaHover] = useState(false)\n  const hoverAccount = useRef<typeof account.view>(undefined)\n  const hoverAccountDetails = (): void => {\n    if (!signedIn || !wide || document.documentElement.dataset.deltaUi !== 'delta') return\n    setDeltaHover(true)\n    if (hoverAccount.current !== account.view) {\n      hoverAccount.current = account.view\n      void refreshAccount().catch(() => undefined)\n    }\n  }\n  const hoverLabels = t('signIn') === '登录'\n    ? { balance: '账户余额', today: '今日消费', missing: '暂无数据', usage: '查看用量' }\n    : { balance: 'Account balance', today: 'Today spending', missing: 'Unavailable', usage: 'View usage' }", "account hover state")
  next = replaceUnique(next, "        aria-haspopup=\"menu\" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>", "        aria-haspopup=\"menu\" aria-expanded={open} onMouseEnter={hoverAccountDetails} onMouseLeave={() => { setDeltaHover(false) }} onFocus={hoverAccountDetails} onBlur={() => { setDeltaHover(false) }} onClick={() => { setDeltaHover(false); setOpen(value => !value) }}>", "native avatar hover event")
  next = replaceUnique(next, "    {account.loginVisible && !account.onboarding && <SignInDialog", "    {signedIn && wide && deltaHover && !open && (\n      <div className={css.deltaHoverCard} role=\"tooltip\">\n        <div className={css.deltaHoverRow}>\n          <span>{hoverLabels.balance}</span>\n          <strong>{account.details?.balance?.status === 'ready' && account.details.balance.value.length > 0\n            ? account.details.balance.value.map(wallet => formatBalance(wallet.balance, wallet.currency === 'CNY' ? '¥' : '$')).join(' + ')\n            : hoverLabels.missing}</strong>\n        </div>\n        <div className={css.deltaHoverRow}>\n          <span>{hoverLabels.today}</span>\n          <strong>{hoverLabels.missing}</strong>\n        </div>\n        {account.view?.links.usageUrl && <small className={css.deltaHoverHint}>{hoverLabels.usage}</small>}\n      </div>\n    )}\n    {account.loginVisible && !account.onboarding && <SignInDialog", "account hover card")
  return next
}
const accountFooterCSS = [
  '.deltaGuestMark { display: none; }',
  '.officialGuestMark { display: inline-flex; }',
  '.deltaActions { display: none; }',
  '.deltaHoverCard { display: none; }',
  ':global(html[data-delta-ui="delta"]) .root .deltaHoverCard { display: flex; position: absolute; bottom: calc(100% + 8px); left: 8px; z-index: 20; flex-direction: column; gap: 10px; box-sizing: border-box; width: 240px; padding: 14px 16px; border-radius: 12px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-prominent); pointer-events: none; }',
  ':global(html[data-delta-ui="delta"]) .root .deltaHoverRow { display: flex; gap: 8px; align-items: center; justify-content: space-between; font-size: 12px; line-height: 20px; }',
  ':global(html[data-delta-ui="delta"]) .root .deltaHoverRow strong { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }',
  ':global(html[data-delta-ui="delta"]) .root .deltaHoverHint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }',
  ':global(html[data-delta-ui="delta"]) .root .deltaGuestMark {',
  '  display: inline-flex; width: 24px; height: 24px; align-items: center; justify-content: center;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root .officialGuestMark { display: none; }',
  ':global(html[data-delta-ui="delta"]) .root .label { display: none; }',
  ':global(html[data-delta-ui="delta"]) .root .avatar {',
  '  width: 24px; height: 24px; background: transparent;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root .avatar svg { width: 24px; height: 24px; }',
  ':global(html[data-delta-ui="delta"]) .root[data-delta-footer-wide="true"] { display: contents; }',
  ':global(html[data-delta-ui="delta"]) .root[data-delta-footer-wide="true"] .anchor {',
  '  order: 0; flex: 1 1 auto; min-width: 0; width: auto; display: flex; align-items: center;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root[data-delta-footer-wide="true"] .trigger {',
  '  box-sizing: border-box; flex: none; width: 36px; height: 36px;',
  '  justify-content: center; padding: 6px; border: 0; background: transparent;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root[data-delta-footer-wide="true"] .deltaActions {',
  '  order: 2; flex: none; display: flex; align-items: center; gap: 4px;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root[data-delta-footer-wide="true"] .deltaIconButton {',
  '  display: inline-flex; align-items: center; justify-content: center; flex: none;',
  '  width: 36px; height: 36px; box-sizing: border-box; padding: 6px;',
  '  border: 0; border-radius: var(--dsw-radius-md); background: transparent;',
  '  color: var(--dsw-alias-label-primary); cursor: pointer;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root .deltaIconButton svg {',
  '  display: block; width: 24px; height: 24px;',
  '}',
  ':global(html[data-delta-ui="delta"]) .root .deltaIconButton:disabled { opacity: .5; cursor: default; }',
  '@media (hover: hover) {',
  '  :global(html[data-delta-ui="delta"]) .root .deltaIconButton:not(:disabled):hover {',
  '    background: var(--dsw-alias-interactive-bg-hover);',
  '  }',
  '}',
].join('\n')

export function patchAccountMenuStyle(source) {
  const marker = 'delta-suite:footer-ui-v1 account-style'
  if (source.includes(marker)) return source
  requireShape(source.includes('.root {') && source.includes('.anchor {') &&
    source.includes('.trigger {') && source.includes('.avatar {'), 'AccountMenu stylesheet')
  return source + '\n/* ' + marker + ' */\n' + accountFooterCSS + '\n'
}

/** Reorder native updater and connection presentation without creating copies. */
export function patchSettingsRoot(source) {
  const marker = 'delta-suite:footer-ui-v1 settings'
  if (source.includes(marker)) return source
  let next = replaceUnique(source,
    '      <div className={clsx(css.triggerRow, !wide && css.railRow)}>',
    "      {/* " + marker + " */}\n      <div className={clsx(css.triggerRow, !wide && css.railRow)} data-delta-footer-wide={wide ? 'true' : 'false'}>",
    'SettingsRoot trigger row')
  next = replaceUnique(next,
    '        <ConnectionIndicator\n',
    '        <span data-delta-footer-connection=\"\">\n          <ConnectionIndicator\n',
    'SettingsRoot connection indicator open')
  next = replaceUnique(next,
    '          onReconnect={reconnect}\n        />',
    '          onReconnect={reconnect}\n          />\n        </span>',
    'SettingsRoot connection indicator close')
  next = replaceUnique(next,
    '        <DesktopUpdateIndicator wide={wide}',
    '        <span data-delta-footer-update=\"\">\n          <DesktopUpdateIndicator wide={wide}',
    'SettingsRoot update open')
  next = replaceUnique(next,
    '          t={t} view={desktopUpdate} onOpen={openDesktopUpdate} />',
    '          t={t} view={desktopUpdate} onOpen={openDesktopUpdate} />\n        </span>',
    'SettingsRoot update close')
  return next
}

const settingsFooterCSS = [
  '.triggerRow > [data-delta-footer-update],',
  '.triggerRow > [data-delta-footer-connection] { display: contents; }',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] {',
  '  gap: 4px; margin: 0 0 4px; min-height: 44px; align-items: center;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] {',
  '  order: 1; flex: none; display: flex; align-items: center;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update]:empty {',
  '  display: none;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] button {',
  '  box-sizing: border-box; width: 36px; height: 36px; display: flex;',
  '  justify-content: center; align-items: center; padding: 6px;',
  '  border: 0; background: transparent; border-radius: var(--dsw-radius-md);',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] button > span:nth-child(2) {',
  '  display: none;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] button span:first-child {',
  '  width: 24px; height: 24px;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] button svg {',
  '  width: 24px; height: 24px;',
  '}',
  ':global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-connection] {',
  '  position: absolute; right: 0; bottom: 100%; display: flex;',
  '}',
  '@media (hover: hover) {',
  '  :global(html[data-delta-ui="delta"]) .triggerRow[data-delta-footer-wide="true"] > [data-delta-footer-update] button:not(:disabled):hover {',
  '    background: var(--dsw-alias-interactive-bg-hover);',
  '  }',
  '}',
].join('\n')

export function patchSettingsRootStyle(source) {
  const marker = 'delta-suite:footer-ui-v1 settings-style'
  if (source.includes(marker)) return source
  requireShape(source.includes('.triggerRow {') && source.includes('.triggerRow.railRow {') &&
    source.includes('.trigger {'), 'SettingsRoot stylesheet')
  return source + '\n/* ' + marker + ' */\n' + settingsFooterCSS + '\n'
}

export const changes = [
  { package: '@deepseek-ai/dsh-client-ui-settings-account', file: 'src/client/AccountMenu.tsx', transform: patchAccountMenu },
  { package: '@deepseek-ai/dsh-client-ui-settings-account', file: 'src/client/AccountMenu.module.css', transform: patchAccountMenuStyle },
  { package: '@deepseek-ai/dsh-client-ui-settings-general', file: 'src/client/SettingsRoot.tsx', transform: patchSettingsRoot },
  { package: '@deepseek-ai/dsh-client-ui-settings-general', file: 'src/client/SettingsRoot.module.css', transform: patchSettingsRootStyle },
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/SidebarRoot.tsx', transform: patchSidebarRoot },
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/SidebarRoot.module.css', transform: patchSidebarStyle },
  { package: '@deepseek-ai/dsh-client-ui-sidebar', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'session.new', '新会话', '开始对话'],
    ['zh', 'session.new.label', '新建会话', '开始对话'],
    ['en', 'session.new', 'New Session', 'Start Conversation'],
    ['en', 'session.new.label', 'New session', 'Start Conversation'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-conversation', file: 'src/client/skeleton/HeroShell.module.css', transform: patchHeroStyle },
  { package: '@deepseek-ai/dsh-client-ui-plugin-manager', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'panel', '插件', '插件管理'],
    ['zh', 'title', '插件', '插件管理'],
    ['en', 'panel', 'Plugins', 'Plugin Manager'],
    ['en', 'title', 'Plugins', 'Plugin Manager'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-schedule', file: 'src/client/task-manager-locales.ts', transform: dictionary([
    ['zh', 'panel', '自动化任务', '定时任务'],
    ['zh', 'title', '自动化任务', '定时任务'],
    ['en', 'panel', 'Automation tasks', 'Scheduled Tasks'],
    ['en', 'title', 'Automation tasks', 'Scheduled Tasks'],
  ]) },
  { package: '@deepseek-ai/dsh-client-ui-schedule', file: 'src/client/locales.ts', transform: dictionary([
    ['zh', 'trigger.label', '自动化任务', '定时任务'],
    ['en', 'trigger.label', 'Automation tasks', 'Scheduled Tasks'],
  ]) },
]

function discoverPackages(root) {
  const base = join(root, 'packages')
  requireShape(existsSync(base), 'Harness checkout packages directory')
  const required = new Set(changes.map(item => item.package))
  const discovered = new Map()
  const visit = (dir, depth) => {
    if (depth > 5 || discovered.size === required.size) return
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      if (item.isFile() && item.name === 'package.json') {
        try {
          const name = JSON.parse(readFileSync(path, 'utf8')).name
          if (required.has(name)) discovered.set(name, dir)
        } catch { /* unrelated manifests are not targets */ }
      } else if (item.isDirectory() && !['node_modules', 'lib', 'dist', '.git'].includes(item.name)) {
        visit(path, depth + 1)
      }
    }
  }
  visit(base, 0)
  for (const name of required) requireShape(discovered.has(name), 'Host package ' + name)
  return discovered
}

export function planPatches(root) {
  const locations = discoverPackages(root)
  return changes.map(item => {
    const file = join(locations.get(item.package), item.file)
    requireShape(existsSync(file), item.package + '/' + item.file)
    const oldText = readFileSync(file, 'utf8')
    const usesCRLF = oldText.includes('\r\n')
    const normalized = oldText.replaceAll('\r\n', '\n')
    const patched = item.transform(normalized)
    const newText = usesCRLF ? patched.replaceAll('\n', '\r\n') : patched
    return { file, oldText, newText, changed: oldText !== newText }
  })
}

function main() {
  const args = process.argv.slice(2)
  const index = args.indexOf('--root')
  const root = index >= 0 ? args[index + 1] : process.env.DELTA_HARNESS_ROOT
  requireShape(Boolean(root), '--root <Harness source checkout> or DELTA_HARNESS_ROOT')
  requireShape(!(args.includes('--check') && args.includes('--apply')), 'choose --check OR --apply')
  const write = args.includes('--apply')
  const plan = planPatches(resolve(root))
  // All targets are validated before the first write.
  if (write) for (const item of plan) if (item.changed) writeFileSync(item.file, item.newText)
  for (const item of plan) {
    process.stdout.write((item.changed ? (write ? 'PATCHED ' : 'PENDING ') : 'UNCHANGED ') + item.file + '\n')
  }
  process.stdout.write('[delta-suite patch] ' + (write ? 'applied' : 'checked') + '; no Harness version pin\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}

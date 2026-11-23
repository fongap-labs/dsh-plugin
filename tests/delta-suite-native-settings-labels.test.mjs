import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'
import { patchAccountMenu, patchAccountMenuStyle, patchCurrentVersionStyle, patchHeroStyle,
  patchSettingsRootStyle, patchDictionary, changes } from '../packages/delta-suite/scripts/apply-harness-ui-patch.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)

const emitted = [
  'function installSidebarCompatibility() {}',
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
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + "\n    document.documentElement.dataset.deltaCompat = '1'")
  assert.notEqual(tampered, normalizedSource, 'negative fixture must mutate the compatibility function')
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
  assert.match(locale, /任务执行中，用时 \{duration\}/)
  assert.match(locale, /Task in progress for \{duration\}/)
  for (const entry of pairs) assert.equal(patchDictionary(locale, ...entry), locale)
  assert.ok(changes.some(item => item.file === 'src/client/CurrentVersionRow.module.css'))
  assert.ok(changes.some(item => item.package === '@deepseek-ai/dsh-client-ui-chat'
    && item.file === 'src/client/locale.ts'))
})

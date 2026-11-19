#!/usr/bin/env node
// Validate both portable archives before an Action Worker release is published.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageName = '@fongap-labs/dsh-delta-suite'
const required = ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/host-capabilities.js',
  'lib/delta-suite-adapter/host-capability-contract.js', 'lib/client.js',
  'locale/en.json', 'locale/zh.json', 'icon.svg']
function ensure(isValid, description) {
  if (!isValid) throw new Error('Invalid Delta Suite release: ' + description)
}
export function readZip(buffer) {
  const entries = new Map()
  let cursor = 0
  while (cursor + 4 <= buffer.length) {
    const sig = buffer.readUInt32LE(cursor)
    if (sig === 0x02014b50 || sig === 0x06054b50) break
    ensure(sig === 0x04034b50 && cursor + 30 <= buffer.length, 'ZIP header')
    ensure((buffer.readUInt16LE(cursor + 6) & 8) === 0, 'ZIP data descriptor')
    const compression = buffer.readUInt16LE(cursor + 8)
    ensure(compression === 0 || compression === 8, 'ZIP compression')
    const size = buffer.readUInt32LE(cursor + 18)
    const nameLength = buffer.readUInt16LE(cursor + 26)
    const start = cursor + 30 + nameLength + buffer.readUInt16LE(cursor + 28)
    const end = start + size
    ensure(end <= buffer.length, 'truncated ZIP')
    const path = buffer.toString('utf8', cursor + 30, cursor + 30 + nameLength)
    ensure(!path.startsWith('/') && !path.includes('..') && !path.includes('\\'), 'unsafe ZIP path')
    ensure(!entries.has(path), 'duplicate ZIP entry')
    if (!path.endsWith('/')) {
      const packed = buffer.subarray(start, end)
      entries.set(path, compression === 0 ? packed : inflateRawSync(packed))
    }
    cursor = end
  }
  ensure(entries.size > 0, 'empty ZIP')
  return entries
}
export function readTgz(buffer) {
  const archive = gunzipSync(buffer)
  const entries = new Map()
  let cursor = 0
  while (cursor + 512 <= archive.length) {
    const header = archive.subarray(cursor, cursor + 512)
    if (header.every(value => value === 0)) break
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '')
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '')
    const path = (prefix ? prefix + '/' : '') + name
    const length = parseInt(header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim() || '0', 8)
    ensure(Number.isSafeInteger(length) && length >= 0, 'invalid TAR size')
    const start = cursor + 512
    ensure(start + length <= archive.length, 'truncated TAR')
    const type = header.toString('ascii', 156, 157)
    if ((type === '0' || type === '\0' || type === '') && path.startsWith('package/')) {
      const relative = path.slice('package/'.length)
      ensure(!relative.includes('..') && !relative.includes('\\'), 'unsafe TAR path')
      ensure(!entries.has(relative), 'duplicate TAR entry')
      entries.set(relative, archive.subarray(start, start + length))
    }
    cursor = start + Math.ceil(length / 512) * 512
  }
  ensure(entries.size > 0, 'empty TGZ')
  return entries
}
/**
 * Scan emitted JavaScript without mistaking source comments for executable
 * references. Keep string, template, and regular-expression text conservative:
 * forbidden names in runtime text still block the release. No compiler API is
 * used because the project installs native TypeScript 7 (CLI-only).
 */
export function hasUnsafeHostPatch(source) {
  let executable = ''
  let quote = null
  let isEscaped = false
  let isBlockComment = false
  let isLineComment = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]
    if (isLineComment) {
      if (char === '\n' || char === '\r') {
        isLineComment = false
        executable += char
      }
      continue
    }
    if (isBlockComment) {
      if (char === '*' && next === '/') {
        isBlockComment = false
        i++
      } else if (char === '\n' || char === '\r') {
        executable += char
      }
      continue
    }
    if (quote !== null) {
      executable += char
      if (isEscaped) isEscaped = false
      else if (char === '\\') isEscaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '\x60') {
      quote = char
      executable += char
    } else if (char === '/' && next === '/') {
      isLineComment = true
      i++
    } else if (char === '/' && next === '*') {
      isBlockComment = true
      i++
    } else {
      executable += char
    }
  }
  return executable.includes('workspaceRegistry') || executable.includes('protected-default-workspace')
}

// ZIP3 pins the audited transition adapter and author-provided theme exactly.
// Unavailable native sidebar layout features must stay on the Harness fallback.
// Reviewed 2026-11-18: removed native running-status DOM text rewriting.
// Reviewed 2026-11-18: removed native page heading DOM text rewriting.
// Reviewed 2026-11-18: native Settings labels are no longer rewritten.
// Reviewed 2026-11-18: removed sidebar navigation label patching and restore state.
// Reviewed 2026-11-18: restored native More visibility in client and ZIP3 theme.
// Reviewed 2026-11-18: removed native view-options menu sorting.
// Reviewed 2026-11-18: removed workspace menu sorting and separator overrides; safeguards retained.
// Reviewed 2026-11-18: footer session menu order/separator mutation removed; delete markers retained.
// Reviewed 2026-11-18: removed session context menu ordering and injected separators.
// Reviewed 2026-11-18: native session menu action labels remain Harness-owned.
// Reviewed 2026-11-18: removed native Feedback menu DOM hiding and theme CSS selector.
// Reviewed 2026-11-18: removed native account trigger capture-click blocking and dead bypass state.
// Reviewed 2026-11-18: removed private ShortcutsService registry dispatch/invoke monkeypatch.
// Reviewed 2026-11-18: removed global capture-phase Ctrl/Cmd+K interception; modal Escape scoped to Delta.
// Reviewed 2026-11-18: native footer restored; removed Delta avatar/account/update DOM proxy and Host menu suppression.
// Reviewed 2026-11-18: search palette no longer guesses native Settings buttons or exposes an unsupported Settings quick action.
// Reviewed 2026-11-18: removed private sidebar nav text-click for Plugins and Schedules; unsupported plugin catalog actions are hidden.
// Reviewed 2026-11-18: retired right sidebar guide DOM shortcut mirror and synthetic element clicks.
// Reviewed 2026-11-18: shortcut catalog rows are display-only unless backed by explicit Delta action routes; no synthetic registry invocation.
// Reviewed 2026-11-18: Search Palette copies slash commands via Clipboard API; no Host editor DOM injection.
// Reviewed 2026-11-18: explicit session-scoped composer Slot uses public revision-guarded InputActions; unscoped search remains copy-only.
// Reviewed 2026-11-18: retired private workspace expansion storage reads and synthetic row clicks; native expansion is Host-owned.
// Reviewed 2026-11-18: retired cloned native new-session button, synthetic click forwarding, and CSS hiding of the actual Host control.
// Reviewed 2026-11-18: retired native sidebar search proxy/input mirroring and restored original Harness search slot.
// Reviewed 2026-11-18: replaced private service-search sidebar insertion with a public composer Search Palette entry.
// Reviewed 2026-11-18: PR #392 scoped legacy Host sidebar placement; this is superseded by public Slot ownership.
// Reviewed 2026-11-18: retired private three-column resizing, synthetic edge buttons, persisted layout widths and Host splitter pointer interception; native layout is authoritative.
// Reviewed 2026-11-18: native hover-card class injection, global mouseover scanner and private card CSS removed; official Slot preserved.
// Reviewed 2026-11-18: retired native Harness modal panel drag and mask/panel overrides;
// Host owns native Dialog chrome; Delta-owned dialogs retain their own CSS and service guards.
// Reviewed 2026-11-18: retired native workspace lock-row DOM deletion and broad
// Host menu/footer Flex rules; service ACL and locked/sole-workspace guards remain.
// Reviewed 2026-11-18: native menu danger color/class injection and broad Host
// menu/separator CSS retired; Delta-owned context menu keeps its own danger treatment.
// Reviewed 2026-11-18: native Settings rows and empty Ungrouped buckets no longer
// rely on private DOM/text hiding. Protected-session ACL and tombstone guards remain.
// Reviewed 2026-11-19: disabled legacy sidebar layout activation and Settings-nav order writes.
// Reviewed 2026-11-19: retired native turn error row scanning, collapse handlers and private CSS.
// Reviewed 2026-11-19: retired global modal-open marker and Host sidebar-fill mutation; Delta backdrops remain scoped.
// Reviewed 2026-11-19: retired global Vision paste/drop capture and private Host composer writes; Host Vision ops preserved.
// Reviewed 2026-11-19: retired native session/workspace lock-row badges and styling; Host owns native row decorations.
// Reviewed 2026-11-19: retired active Host center/header/Composer/trajectory CSS geometry; native layouts restored.
// Reviewed 2026-11-19: retired 65 inactive data-delta-compat selector branches (11 dead-only rules).
// Reviewed 2026-11-19: retired active Host sidebar toggle/logo-row hiding and private Windows menu offset.
// Reviewed 2026-11-19: retired active native session/workspace list, scrollbars and scroll-fade CSS.
// Transitional protection DOM and Host command guards remain outside native layout ownership.
const ZIP3_THEME_BLOB = '59e08f634fc81452166ed0ffe4e0d16f9e349218'
const LEGACY_COMPAT_ATTRIBUTE_WRITES = [
  /\.\s*setAttribute\s*\(\s*(['"`])data-delta-compat(?:-status)?\1/i,
  /\[\s*(['"`])setAttribute\1\s*\]\s*\(\s*(['"`])data-delta-compat(?:-status)?\2/i,
]
const LEGACY_COMPAT_DATASET_WRITE = /(?:\.\s*dataset|\[\s*['"`]dataset['"`]\s*\])(?:\s*\[\s*['"`]deltaCompat(?:Status)?['"`]\s*\]|\s*\.\s*deltaCompat(?:Status)?)\s*(?:\?\?=|&&=|\|\|=|>>>=|>>=|<<=|\*\*=|[+\-*\/%&|^]=|=(?!=|>))/
const LEGACY_VISION_COMPOSER_TAKEOVER = [
  /\binstallClientVisionBridge\s*\(/,
  /\b(?:document|window)\.addEventListener\s*\(\s*(['"`])(?:paste|drop)\1\s*,[\s\S]{0,180}\bcapture\s*:\s*true/,
  /\bdocument\.execCommand\s*\(\s*(['"`])insertText\1/,
  /\bwindow\.HTML(?:Input|TextArea)Element\.prototype/,
]
const RETIRED_NATIVE_LOCK_ROW_BADGES = [
  'dtd-session-lock-badge', 'dtd-workspace-lock-badge',
  'data-dtd-session-locked', 'data-dtd-workspace-locked',
]
const RETIRED_HOST_CENTER_THEME_MARKERS = [
  '[class*="mP3x-q_centerCol"]',
  '[class~="an3WzG_header"]',
  '[class*="F07MqG_dock"]',
  '[class*="eciBTa_root"]',
  '[class~="Wd4N7W_searchIcon"]',
  '--dsh-chat-content-width',
  '--dsh-composer-card-max-width',
  '--dsh-composer-side-clearance',
  '--dtd-center-gutter',
]
const RETIRED_HOST_SIDEBAR_THEME_MARKERS = [
  '[data-sidebar-toggle]',
  '[data-sidebar-opener]',
  '[data-sidebar-right-toggle]',
  '[data-sidebar-right-expand]',
  '[class*="wtg9ga_logoRow"]',
  '[class*="SidebarRoot_logoRow"]',
  '[class*="wtg9ga_brandIdentity"]',
  '[class*="SidebarRoot_brand"]',
  '[class*="FishLogo"]',
  '--dsh-windows-menu-start',
]
const RETIRED_NATIVE_SIDEBAR_LIST_THEME_MARKERS = [
  '[data-sidebar-scrollport]',
  '[data-sidebar-list-area]',
  '[data-row-key^="session:"]',
  '[class*="scrollFade"]',
  '[class*="wtg9ga_scrollFade"]',
  '[class*="regionArea"]',
  '[class*="rowResting"]',
]
const ZIP3_COMPAT_REGIONS = [
  {
    begin: 'function installSidebarCompatibility(',
    end: '\ntype SearchTabId',
    sha1: 'b0c811ca65f3d0d6739ce9bdfcfd645e441b768a',
  },
  {
    begin: 'function installHostSearch(',
    end: '\nwindow.__ModuleLoader__.load(',
    sha1: '12af34dad51f22d6111bdecc8717424f869ce618',
  },
]

function checkedRegion(source, { begin, end, sha1 }) {
  const from = source.indexOf(begin)
  ensure(from >= 0 && source.indexOf(begin, from + begin.length) === -1,
    'ZIP3 adapter region missing or duplicated: ' + begin)
  const to = source.indexOf(end, from + begin.length)
  ensure(to > from, 'ZIP3 adapter region boundary: ' + begin)
  const actual = createHash('sha1').update(source.slice(from, to)).digest('hex')
  ensure(actual === sha1, 'ZIP3 approved compatibility adapter changed: ' + begin)
}

export function verifyApprovedZip3Client(client, sourceText = readFileSync(
  new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url), 'utf8'
)) {
  const source = sourceText.replace(/\r\n/g, '\n')
  for (const region of ZIP3_COMPAT_REGIONS) checkedRegion(source, region)
  ensure(!LEGACY_VISION_COMPOSER_TAKEOVER.some(pattern => pattern.test(source)),
    'retired Vision composer takeover in client source')
  ensure(!RETIRED_NATIVE_LOCK_ROW_BADGES.some(marker => source.includes(marker)),
    'retired native lock row badge in client source')

  const ownedMatch = client.match(/\bconst OWNED_CSS = ("(?:\\.|[^"\\])*");/)
  ensure(Boolean(ownedMatch), 'ZIP3 stylesheet missing from emitted client')
  let theme
  try { theme = JSON.parse(ownedMatch[1]) } catch { ensure(false, 'ZIP3 stylesheet encoding') }
  ensure(!RETIRED_NATIVE_LOCK_ROW_BADGES.some(marker => theme.includes(marker)),
    'retired native lock row badge in emitted theme')
  ensure(!RETIRED_HOST_CENTER_THEME_MARKERS.some(marker => theme.includes(marker)),
    'retired Host center CSS in emitted theme')
  ensure(!/data-delta-compat/i.test(theme),
    'retired compat-gated Host CSS in emitted theme')
  ensure(!RETIRED_HOST_SIDEBAR_THEME_MARKERS.some(marker => theme.includes(marker)),
    'retired Host sidebar control CSS in emitted theme')
  ensure(!RETIRED_NATIVE_SIDEBAR_LIST_THEME_MARKERS.some(marker => theme.includes(marker)),
    'retired native sidebar list CSS in emitted theme')
  const canonical = theme.replace(/\r\n/g, '\n').replace(/\\([0-9A-F]{6})/g,
    (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  const bytes = Buffer.from(canonical)
  const blob = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
  ensure(blob === ZIP3_THEME_BLOB, 'ZIP3 approved theme differs')

  for (const name of ['installSidebarCompatibility', 'installHostSearch']) {
    ensure((client.match(new RegExp('function ' + name + '\\(', 'g')) ?? []).length === 1,
      'ZIP3 emitted adapter registration missing or duplicated: ' + name)
  }
  ensure(!LEGACY_VISION_COMPOSER_TAKEOVER.some(pattern => pattern.test(client)),
    'retired Vision composer takeover in emitted client')
  ensure(!RETIRED_NATIVE_LOCK_ROW_BADGES.some(marker => client.includes(marker)),
    'retired native lock row badge in emitted client')
  // The exact reviewed adapter regions are pinned by ZIP3_COMPAT_REGIONS.
  // Keep emitted-fixture compatibility while rejecting legacy native layout takeover.
  ensure(client.includes('dtd-host-search') &&
    !client.includes('syncModalChromeOverlay') &&
    !client.includes('data-delta-modal-open') &&
    !client.includes('dtd-native-search') &&
    !LEGACY_COMPAT_ATTRIBUTE_WRITES.some(pattern => pattern.test(client)) &&
    !LEGACY_COMPAT_DATASET_WRITE.test(client) &&
    !client.includes('data-dtd-nav-tail') &&
    !client.includes('navParent.insertBefore(shell, navigationRow)'),
    'ZIP3 emitted sidebar adapter incomplete or legacy native layout takeover retained')
  ensure(!client.includes('dtd-search-dialog-backdrop') && !client.includes('openSearchDialog(') &&
    !client.includes('workspaceRegistry') && !client.includes('app.asar'),
    'non-ZIP3 Host DOM or legacy search takeover')
}

export function verifyEntries(entries, version, format) {
  for (const path of required) ensure(entries.has(path), format + ' missing ' + path)
  const manifest = JSON.parse(entries.get('package.json').toString())
  ensure(manifest.name === packageName, format + ' name')
  ensure(manifest.version === version, format + ' version')
  ensure(manifest.dsh?.client?.platform === 'web', format + ' client platform')
  ensure(manifest.exports?.['./client'] === './lib/client.js', format + ' client export')
  const patch = entries.get('cordis.patch.yml').toString()
  ensure(patch.includes('id: dsh-delta-suite') && patch.includes(packageName), format + ' patch')
  const host = entries.get('lib/index.js').toString()
  ensure(host.includes('negotiateHostCapabilities') && host.includes('DELTA_HOST_CONTRACT_VERSION'), format + ' Host capability contract')
  // The legacy module is a re-export shim after the adapter split. Validate
  // the shipped link AND the concrete contract implementation in both archives
  // rather than requiring an implementation body in the compatibility shim.
  const compatibility = entries.get('lib/host-capabilities.js').toString()
  ensure(/^\s*export\s+\*\s+from\s+['"]\.\/delta-suite-adapter\/host-capability-contract\.js['"];?\s*$/m.test(compatibility),
    format + ' capability compatibility export')
  const contract = entries.get('lib/delta-suite-adapter/host-capability-contract.js').toString()
  ensure(/\bexport\s+const\s+DELTA_HOST_CONTRACT_VERSION\s*=/.test(contract) &&
    /\bexport\s+function\s+negotiateHostCapabilities\s*\(/.test(contract),
    format + ' capability module')
  ensure(!hasUnsafeHostPatch(host), format + ' unsafe Host patch')
  const client = entries.get('lib/client.js').toString()
  ensure(client.includes('window.__ModuleLoader__.load({'), format + ' boot registration')
  ensure(client.includes('settings.section') && client.includes('sidebar.brand.mark'), format + ' UI modules')
  ensure(client.includes('data-delta-ui'), format + ' appearance lifecycle')
  verifyApprovedZip3Client(client)
  ensure(!client.includes('__DELTA_SUITE_STYLE__') &&
    !client.includes('__DELTA_SUITE_LOCALES__'), format + ' build markers')
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(entries.get('locale/' + lang + '.json').toString())
    ensure(locale.meta?.title && locale.ui?.newConversation, format + ' locale ' + lang)
  }
}
export function verifyRelease(zipPath, tgzPath, version) {
  ensure(/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version), 'version syntax')
  ensure(basename(zipPath) === 'fongap-labs-dsh-delta-suite.zip', 'ZIP name')
  ensure(basename(tgzPath) === 'fongap-labs-dsh-delta-suite.tgz', 'TGZ name')
  verifyEntries(readZip(readFileSync(zipPath)), version, 'ZIP')
  verifyEntries(readTgz(readFileSync(tgzPath)), version, 'TGZ')
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = new Map()
    for (let i = 2; i < process.argv.length; i += 2) {
      ensure(['--zip', '--tgz', '--version'].includes(process.argv[i]) &&
        process.argv[i + 1] && !args.has(process.argv[i]), 'arguments')
      args.set(process.argv[i], process.argv[i + 1])
    }
    ensure(args.size === 3, 'expected --zip --tgz --version')
    verifyRelease(args.get('--zip'), args.get('--tgz'), args.get('--version'))
    console.log('Verified Delta Suite ' + packageName + '@' + args.get('--version'))
  } catch (error) { console.error(error); process.exitCode = 1 }
}

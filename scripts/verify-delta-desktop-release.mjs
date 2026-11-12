#!/usr/bin/env node
// Validate both portable archives before an Action Worker release is published.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { basename } from 'node:path'
import { pathToFileURL } from 'node:url'

const packageName = '@fongap-labs/dsh-delta-desktop'
const required = ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/host-capabilities.js', 'lib/client.js',
  'locale/en.json', 'locale/zh.json', 'icon.svg']
function ensure(isValid, description) {
  if (!isValid) throw new Error('Invalid Delta Desktop release: ' + description)
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

// ZIP3 ships its own sidebar/search compatibility implementation. A global
// substring ban would reject the authoritative stylesheet and this reviewed
// adapter even when no new Host takeover code was added. Freeze the approved
// adapter regions and exact theme instead of silently lifting the guard.
const ZIP3_THEME_BLOB = '8d893d7ecfe4a82703aa17ed4935ecdf4b773773'
const ZIP3_COMPAT_REGIONS = [
  {
    begin: 'function installSidebarCompatibility(',
    end: '\\ntype SearchTabId',
    sha1: '49331cff8aca2746bdde51a3eb45d7f0d8236eb5',
  },
  {
    begin: 'function installHostSearch(',
    end: '\\nwindow.__ModuleLoader__.load(',
    sha1: 'd091e49064452ad098bb98bbaa287ed96f538d37',
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
  new URL('../packages/dsh-delta-desktop/src/client.ts', import.meta.url), 'utf8'
)) {
  const source = sourceText.replace(/\\r\\n/g, '\\n')
  for (const region of ZIP3_COMPAT_REGIONS) checkedRegion(source, region)

  const ownedMatch = client.match(/\\bconst OWNED_CSS = ("(?:\\\\.|[^"\\\\])*");/)
  ensure(Boolean(ownedMatch), 'ZIP3 stylesheet missing from emitted client')
  let theme
  try { theme = JSON.parse(ownedMatch[1]) } catch { ensure(false, 'ZIP3 stylesheet encoding') }
  const canonical = theme.replace(/\\r\\n/g, '\\n').replace(/\\\\([0-9A-F]{6})/g,
    (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  const bytes = Buffer.from(canonical)
  const blob = createHash('sha1').update('blob ' + bytes.length + '\\0').update(bytes).digest('hex')
  ensure(blob === ZIP3_THEME_BLOB, 'ZIP3 approved theme differs')

  for (const name of ['installSidebarCompatibility', 'installHostSearch']) {
    ensure((client.match(new RegExp('function ' + name + '\\\\(', 'g')) ?? []).length === 1,
      'ZIP3 emitted adapter registration missing or duplicated: ' + name)
  }
  ensure(client.includes('dtd-native-search') && client.includes('data-delta-compat'),
    'ZIP3 emitted sidebar adapter incomplete')
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
  ensure(patch.includes('id: dsh-delta-desktop') && patch.includes(packageName), format + ' patch')
  const host = entries.get('lib/index.js').toString()
  ensure(host.includes('negotiateHostCapabilities') && host.includes('DELTA_HOST_CONTRACT_VERSION'), format + ' Host capability contract')
  ensure(entries.get('lib/host-capabilities.js').toString().includes('negotiateHostCapabilities'), format + ' capability module')
  ensure(!hasUnsafeHostPatch(host), format + ' unsafe Host patch')
  const client = entries.get('lib/client.js').toString()
  ensure(client.includes('window.__ModuleLoader__.load({'), format + ' boot registration')
  ensure(client.includes('settings.section') && client.includes('sidebar.brand.mark'), format + ' UI modules')
  ensure(client.includes('data-delta-ui'), format + ' appearance lifecycle')
  verifyApprovedZip3Client(client)
  ensure(!client.includes('__DELTA_DESKTOP_STYLE__') &&
    !client.includes('__DELTA_DESKTOP_LOCALES__'), format + ' build markers')
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(entries.get('locale/' + lang + '.json').toString())
    ensure(locale.meta?.title && locale.ui?.newConversation, format + ' locale ' + lang)
  }
}
export function verifyRelease(zipPath, tgzPath, version) {
  ensure(/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version), 'version syntax')
  ensure(basename(zipPath) === 'fongap-labs-dsh-delta-desktop.zip', 'ZIP name')
  ensure(basename(tgzPath) === 'fongap-labs-dsh-delta-desktop.tgz', 'TGZ name')
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
    console.log('Verified Delta Desktop ' + packageName + '@' + args.get('--version'))
  } catch (error) { console.error(error); process.exitCode = 1 }
}

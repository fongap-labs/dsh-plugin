#!/usr/bin/env node
// Validate both portable archives before an Action Worker release is published.
import { readFileSync } from 'node:fs'
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
  ensure(!host.includes('workspaceRegistry') && !host.includes('protected-default-workspace'), format + ' unsafe Host patch')
  const client = entries.get('lib/client.js').toString()
  ensure(client.includes('window.__ModuleLoader__.load({'), format + ' boot registration')
  ensure(client.includes('settings.section') && client.includes('sidebar.brand.mark'), format + ' UI modules')
  ensure(client.includes('data-delta-ui'), format + ' appearance lifecycle')
  ensure(!client.includes('installSidebarCompatibility') && !client.includes('data-delta-compat') &&
    !client.includes('dtd-native-search'), format + ' private DOM coupling')
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

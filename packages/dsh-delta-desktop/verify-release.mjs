#!/usr/bin/env node
// Validate Delta Desktop's actual portable ZIP/TGZ, not source-level assertions.
// This module does not import another Delta product or bypass the central release.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { Script, createContext } from 'node:vm'
import { gunzipSync, inflateRawSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

const NAME = '@fongap-labs/dsh-delta-desktop'
const REQUIRED = [
  'package.json', 'src/index.js', 'src/index.d.ts', 'src/client.js',
  'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json',
]
function ensure(ok, reason) {
  if (!ok) throw new Error('Invalid Delta Desktop release: ' + reason)
}
function validPath(path) {
  ensure(path && !path.startsWith('/') && !path.includes('..') && !path.includes('\\'),
    'unsafe archive path')
}
export function readZip(buffer) {
  const result = new Map()
  let pos = 0
  while (pos + 4 <= buffer.length) {
    const sig = buffer.readUInt32LE(pos)
    if (sig === 0x02014b50 || sig === 0x06054b50) break
    ensure(sig === 0x04034b50 && pos + 30 <= buffer.length, 'ZIP header')
    ensure((buffer.readUInt16LE(pos + 6) & 8) === 0, 'ZIP data descriptors')
    const method = buffer.readUInt16LE(pos + 8)
    ensure(method === 0 || method === 8, 'ZIP compression')
    const size = buffer.readUInt32LE(pos + 18)
    const nameLength = buffer.readUInt16LE(pos + 26)
    const extraLength = buffer.readUInt16LE(pos + 28)
    const dataAt = pos + 30 + nameLength + extraLength
    const end = dataAt + size
    ensure(end <= buffer.length, 'truncated ZIP')
    const path = buffer.toString('utf8', pos + 30, pos + 30 + nameLength)
    validPath(path)
    ensure(!result.has(path), 'duplicate ZIP entry')
    if (!path.endsWith('/')) {
      const data = buffer.subarray(dataAt, end)
      result.set(path, method === 0 ? data : inflateRawSync(data))
    }
    pos = end
  }
  ensure(result.size > 0, 'empty ZIP')
  return result
}
export function readTgz(buffer) {
  const result = new Map()
  const raw = gunzipSync(buffer)
  let pos = 0
  while (pos + 512 <= raw.length) {
    const header = raw.subarray(pos, pos + 512)
    if (header.every(b => b === 0)) break
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '')
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '')
    const path = (prefix ? prefix + '/' : '') + name
    const size = parseInt(header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim() || '0', 8)
    ensure(Number.isSafeInteger(size) && size >= 0 && pos + 512 + size <= raw.length,
      'truncated or malformed TAR')
    const type = header.toString('ascii', 156, 157)
    if (type === '0' || type === '\0' || type === '') {
      ensure(path.startsWith('package/'), 'invalid TGZ root')
      const relative = path.slice('package/'.length)
      validPath(relative)
      ensure(!result.has(relative), 'duplicate TGZ entry')
      result.set(relative, raw.subarray(pos + 512, pos + 512 + size))
    }
    pos += 512 + Math.ceil(size / 512) * 512
  }
  ensure(result.size > 0, 'empty TGZ')
  return result
}
export function verifyDesktopEntries(entries, version, format) {
  for (const file of REQUIRED) ensure(entries.has(file), format + ' missing ' + file)
  const pkg = JSON.parse(entries.get('package.json').toString())
  ensure(pkg.name === NAME, format + ' product identity')
  ensure(pkg.version === version, format + ' requested version')
  ensure(pkg.exports?.['.']?.default === './src/index.js', format + ' Host export')
  ensure(pkg.exports?.['./client'] === './src/client.js', format + ' Client export')
  ensure(pkg.dsh?.client?.platform === 'web', format + ' web Client declaration')
  ensure(pkg.dsh?.bundle?.patch === './cordis.patch.yml', format + ' bundle Patch')
  ensure(!(pkg.dependencies && Object.keys(pkg.dependencies).some(x =>
    x === '@fongap-labs/dsh-delta-suite' || x === '@fongap-labs/dsh-delta-code')),
  format + ' runtime product independence')
  const patch = entries.get('cordis.patch.yml').toString()
  ensure(patch.includes('dsh-delta-desktop') && patch.includes(NAME), format + ' Patch identity')
  ensure(!/\bdisabled:\s*true\b/.test(patch), format + ' unreviewed native UI removal')
  const host = entries.get('src/index.js').toString()
  ensure(/export\s+const\s+inject\b/.test(host) &&
    /export\s+function\s+apply\b/.test(host), format + ' executable Host entry')
  const client = entries.get('src/client.js').toString()
  const registered = []
  const context = createContext({
    globalThis: { __ModuleLoader__: { load(entry) { registered.push(entry) } } },
  })
  new Script(client, { filename: 'dsh-delta-desktop/client.js' })
    .runInContext(context, { timeout: 1000 })
  ensure(registered.length === 1, format + ' exactly one Client registration')
  ensure(registered[0]?.id === NAME &&
    typeof registered[0]?.factory === 'function', format + ' Client module factory')
}
// pnpm pack removes publication-only publishConfig from the TGZ manifest.
// Compare all other fields, including identity, runtime exports, DSH metadata,
// dependencies and scripts, rather than requiring identical JSON bytes.
export function verifyDesktopPackageParity(zipManifest, tgzManifest) {
  const zip = JSON.parse(zipManifest.toString())
  const tgz = JSON.parse(tgzManifest.toString())
  delete zip.publishConfig
  delete tgz.publishConfig
  ensure(isDeepStrictEqual(zip, tgz), 'package.json runtime fields differ between ZIP and TGZ')
}
export function verifyDesktopRelease(zipPath, tgzPath, version) {
  ensure(/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version),
    'unsupported version; current generic builder supports stable or beta only')
  ensure(basename(zipPath) === 'fongap-labs-dsh-delta-desktop.zip', 'ZIP asset name')
  ensure(basename(tgzPath) === 'fongap-labs-dsh-delta-desktop.tgz', 'TGZ asset name')
  const zip = readZip(readFileSync(zipPath))
  const tgz = readTgz(readFileSync(tgzPath))
  verifyDesktopEntries(zip, version, 'ZIP')
  verifyDesktopEntries(tgz, version, 'TGZ')
  verifyDesktopPackageParity(zip.get('package.json'), tgz.get('package.json'))
  for (const file of REQUIRED.filter(file => file !== 'package.json')) {
    ensure(zip.get(file).equals(tgz.get(file)), file + ' differs between ZIP and TGZ')
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const values = new Map()
    for (let i = 2; i < process.argv.length; i += 2) {
      ensure(['--zip', '--tgz', '--version'].includes(process.argv[i]) &&
        process.argv[i + 1] && !values.has(process.argv[i]), 'arguments')
      values.set(process.argv[i], process.argv[i + 1])
    }
    ensure(values.size === 3, 'requires --zip, --tgz and --version')
    verifyDesktopRelease(values.get('--zip'), values.get('--tgz'), values.get('--version'))
    console.log('Verified Delta Desktop ' + NAME + '@' + values.get('--version'))
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

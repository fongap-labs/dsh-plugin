#!/usr/bin/env node
// Reject Code Worker ZIP/TGZ releases whose browser client fails the same
// __ModuleLoader__.load registration contract used by DeepSeek Harness.
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createContext, Script } from 'node:vm'
import { pathToFileURL } from 'node:url'
import { readZip, readTgz } from './verify-delta-desktop-release.mjs'

const PACKAGE = '@fongap-labs/dsh-delta-code'
const REQUIRED = ['package.json', 'lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'icon.svg']

function ensure(ok, reason) {
  if (!ok) throw new Error('Invalid Delta Code release: ' + reason)
}

export function verifyCodeClient(source, expectedId) {
  const registrations = []
  const context = createContext({
    window: { __ModuleLoader__: { load(entry) { registrations.push(entry) } } },
  })
  const seed = new Script('const NAME = "previous-plugin"; const ROW_KEY = "previous-row";')
  seed.runInContext(context)
  const script = new Script(source, { filename: 'dsh-delta-code/client.js' })
  // The same client must survive both a shared global scope and a reload.
  script.runInContext(context, { timeout: 1000 })
  script.runInContext(context, { timeout: 1000 })
  ensure(registrations.length === 2, 'client failed to register on both loads')
  for (const entry of registrations) {
    ensure(entry?.id === expectedId, 'client registered wrong package id')
    ensure(typeof entry.factory === 'function', 'client factory missing')
  }
}

export function verifyCodeEntries(entries, version, format) {
  for (const file of REQUIRED) ensure(entries.has(file), format + ' missing ' + file)
  const manifest = JSON.parse(entries.get('package.json').toString())
  ensure(manifest.name === PACKAGE, format + ' package name')
  ensure(manifest.version === version, format + ' version')
  ensure(manifest.exports?.['./client'] === './lib/client.js', format + ' client export')
  ensure(manifest.dsh?.client?.platform === 'web', format + ' client platform')
  ensure(entries.get('cordis.patch.yml').toString().includes(PACKAGE), format + ' patch identity')
  verifyCodeClient(entries.get('lib/client.js').toString(), manifest.name)
}

export function verifyCodeRelease(zipPath, tgzPath, version) {
  ensure(/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(version), 'version')
  ensure(basename(zipPath) === 'fongap-labs-dsh-delta-code.zip', 'ZIP asset name')
  ensure(basename(tgzPath) === 'fongap-labs-dsh-delta-code.tgz', 'TGZ asset name')
  const zip = readZip(readFileSync(zipPath))
  const tgz = readTgz(readFileSync(tgzPath))
  verifyCodeEntries(zip, version, 'ZIP')
  verifyCodeEntries(tgz, version, 'TGZ')
  ensure(zip.get('lib/client.js').equals(tgz.get('lib/client.js')), 'client differs between ZIP and TGZ')
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
    verifyCodeRelease(args.get('--zip'), args.get('--tgz'), args.get('--version'))
    console.log('Verified Delta Code ' + PACKAGE + '@' + args.get('--version'))
  } catch (error) { console.error(error); process.exitCode = 1 }
}

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const desktopPackage = JSON.parse(readFileSync(new URL('packages/dsh-desktop-delta/package.json', root), 'utf8'))
const tauriConfig = JSON.parse(readFileSync(new URL('packages/dsh-desktop-delta/src-tauri/tauri.conf.json', root), 'utf8'))
const cargoManifest = readFileSync(new URL('packages/dsh-desktop-delta/src-tauri/Cargo.toml', root), 'utf8')
const cargoVersion = cargoManifest.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1]

test('desktop package versions agree and match a release tag', () => {
  assert.ok(cargoVersion, 'Cargo.toml must declare a package version')
  assert.equal(desktopPackage.version, tauriConfig.version)
  assert.equal(desktopPackage.version, cargoVersion)

  const tag = process.env.GITHUB_REF_NAME ?? ''
  if (tag.startsWith('dsh-desktop-delta-v')) {
    const taggedVersion = tag.match(/^dsh-desktop-delta-v(.+)$/)?.[1]
    assert.equal(taggedVersion, desktopPackage.version, 'release tag must match the desktop package version')
  }
})

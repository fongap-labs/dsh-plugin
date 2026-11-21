import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { verifyDesktopPackageParity } from '../packages/dsh-delta-desktop/verify-release.mjs'

const root = join(import.meta.dirname, '..')
for (const name of ['dsh-delta-suite', 'dsh-delta-code']) {
  test(name + ' is built as a portable Linux-hosted bundle', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'projects', name, 'release.manifest.json'), 'utf8'))
    const build = manifest.builds[0]
    assert.equal(build.runner_profile, 'linux-standard')
    assert.equal(build.target, 'portable')
    assert.equal(build.setup_rust, false)
    assert.equal(build.script, name + '/build-release.mjs')
    assert.ok(existsSync(join(root, 'packages', build.script)))
    assert.deepEqual(build.assets.sort(), [
      'fongap-labs-' + name + '.zip', 'fongap-labs-' + name + '.tgz',
    ].sort())
  })
}
test('generic builder retains package manifest restoration', () => {
  const source = readFileSync(join(root, 'scripts/build-release.mjs'), 'utf8')
  assert.match(source, /finally\s*\{\s*await writeFile\(packagePath, original\)/)
  assert.match(source, /pack:bundles/)
  assert.match(source, /--frozen-lockfile/)
})

test('Desktop release accepts only pnpm publication metadata normalization', () => {
  const manifest = JSON.parse(readFileSync(
    join(root, 'packages/dsh-delta-desktop/package.json'), 'utf8'))
  const zip = { ...manifest, version: '0.1.0-beta.1' }
  const tgz = { ...zip }
  delete tgz.publishConfig
  const packed = value => Buffer.from(JSON.stringify(value))

  assert.doesNotThrow(() => verifyDesktopPackageParity(packed(zip), packed(tgz)))

  const wrongExport = { ...tgz, exports: { ...tgz.exports, './client': './wrong.js' } }
  assert.throws(() => verifyDesktopPackageParity(packed(zip), packed(wrongExport)),
    /package.json runtime fields differ/)
  const wrongDsh = { ...tgz, dsh: { ...tgz.dsh, bundle: { patch: './wrong.yml' } } }
  assert.throws(() => verifyDesktopPackageParity(packed(zip), packed(wrongDsh)),
    /package.json runtime fields differ/)
  const wrongVersion = { ...tgz, version: '0.1.0-beta.2' }
  assert.throws(() => verifyDesktopPackageParity(packed(zip), packed(wrongVersion)),
    /package.json runtime fields differ/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseReleaseArgs } from '../packages/dsh-desktop-delta/build-release.mjs'

test('desktop release manifests match the governed product discovery contract', async () => {
  const m = JSON.parse(await readFile(new URL('../projects/dsh-desktop-delta/release.manifest.json', import.meta.url)))
  assert.equal(m.schema_version, 1)
  assert.equal(m.root, 'packages')
  assert.equal(m.release_key, 'dsh-desktop-delta')
  assert.equal(m.target_repository, 'fongap-labs/dsh-plugin')
  assert.deepEqual(m.builds.map(x => x.target), ['linux-x64', 'windows-x64', 'macos-arm64'])
  const assets = new Set()
  for (const b of m.builds) {
    assert.equal(b.script, 'dsh-desktop-delta/build-release.mjs')
    assert.equal(b.setup_rust, true)
    assert.ok(b.assets.includes(b.attest_asset))
    for (const asset of b.assets) {
      assert.ok(!assets.has(asset), 'duplicate asset: ' + asset)
      assets.add(asset)
    }
  }
})

test('release arguments reject unsupported runner and version combinations', () => {
  const good = ['--target', 'linux-x64', '--version', '0.1.0-beta.1', '--output-dir', '/tmp/release']
  assert.equal(parseReleaseArgs(good, 'linux', 'x64').version, '0.1.0-beta.1')
  assert.throws(() => parseReleaseArgs(good, 'win32', 'x64'), /requires/)
  assert.throws(() => parseReleaseArgs(['--target', 'macos-arm64', '--version', '1.0.0', '--output-dir', '/tmp/release'], 'darwin', 'x64'), /requires/)
  assert.throws(() => parseReleaseArgs(['--target', 'linux-x64', '--version', '1.0.0-rc.1', '--output-dir', '/tmp/release'], 'linux', 'x64'), /Invalid/)
  assert.throws(() => parseReleaseArgs(['--target', 'linux-x64', '--version', '1.0.0', '--output-dir', '/tmp/release', '--target', 'linux-x64'], 'linux', 'x64'), /Expected/)
})

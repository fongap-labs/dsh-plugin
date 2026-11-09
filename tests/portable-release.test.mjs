import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
for (const name of ['dsh-desktop-delta', 'dsh-code-worker', 'plugin-template']) {
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

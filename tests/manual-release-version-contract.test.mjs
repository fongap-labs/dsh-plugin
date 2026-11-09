import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
const packages = ['dsh-code-worker', 'dsh-desktop-delta', 'dsh-theme-delta', 'plugin-template']

test('source manifests contain only non-release placeholders', () => {
  assert.equal(json('package.json').version, '0.0.0')
  for (const name of packages) {
    const manifest = json('packages/' + name + '/package.json')
    assert.equal(manifest.version, '0.0.0', name + ' must not pin a release version')
    assert.equal(manifest.private, false)
  }
})

test('only the central manual release workflow can select a plugin version', () => {
  const scripts = json('package.json').scripts
  assert.equal(scripts.release, undefined)
  assert.equal(scripts['release:dry-run'], undefined)
  assert.equal(existsSync(join(root, 'scripts/release.mjs')), false)
  const builder = readFileSync(join(root, 'scripts/build-release.mjs'), 'utf8')
  assert.match(builder, /manifest\.version !== '0\.0\.0'/)
  assert.match(builder, /const patched = \{ \.\.\.manifest, version, private: false \}/)
  assert.match(builder, /finally\s*\{\s*await writeFile\(packagePath, original\)/)
  const docs = readFileSync(join(root, 'README.md'), 'utf8')
  assert.match(docs, /手动 · 发布应用/)
  assert.match(docs, /requested_version/)
})

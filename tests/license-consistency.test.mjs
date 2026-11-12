import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const licenses = [
  'LICENSE',
  'packages/shared/LICENSE',
  'packages/dsh-delta-code/LICENSE',
  'packages/dsh-delta-desktop/LICENSE',
]
const manifests = [
  'package.json',
  'packages/shared/package.json',
  'packages/dsh-delta-code/package.json',
  'packages/dsh-delta-desktop/package.json',
]

test('repository and workspace packages consistently declare MIT', () => {
  const canonical = read('LICENSE')
  assert.match(canonical, /^MIT License\r?\n/)
  assert.match(canonical, /Copyright \(c\) 2026 Fongap Labs/)
  assert.match(canonical, /THE SOFTWARE IS PROVIDED "AS IS"/)
  for (const path of licenses) assert.equal(read(path), canonical, path)
  for (const path of manifests) {
    const manifest = JSON.parse(read(path))
    assert.equal(manifest.license, 'MIT', path)
    if (path !== 'package.json') assert.ok(manifest.files.includes('LICENSE'), path)
  }
})

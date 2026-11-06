import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const rootPackage = JSON.parse(read('package.json'))
const deltaPackage = JSON.parse(read('packages/dsh-desktop-delta/package.json'))
const release = JSON.parse(read('projects/dsh-desktop-delta/release.manifest.json'))

test('Delta Desktop uses the root Apache-2.0 license in source, package and release', () => {
  assert.equal(rootPackage.license, 'Apache-2.0')
  assert.equal(deltaPackage.license, 'Apache-2.0')
  assert.equal(release.license_expression, 'Apache-2.0')
  const rootLicense = read('LICENSE')
  assert.match(rootLicense, /Apache License\s+Version 2\.0/)
  assert.equal(read('packages/dsh-desktop-delta/LICENSE'), rootLicense)
  assert.ok(deltaPackage.files?.includes('README.md'))
})

test('Delta Desktop documentation advertises Apache-2.0 and keeps historical releases distinct', () => {
  const repositoryReadme = read('README.md')
  const deltaReadme = read('packages/dsh-desktop-delta/README.md')
  assert.match(repositoryReadme, /Apache-2\.0/)
  assert.match(deltaReadme, /Apache-2\.0/)
  assert.match(deltaReadme, /MIT/)
  assert.doesNotMatch(deltaReadme, /\[MIT[^\]]*\]\(LICENSE\)/)
})

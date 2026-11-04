import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readme = readFileSync(new URL('../packages/dsh-suite-delta/README.md', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-suite-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const deletion = readFileSync(new URL('../packages/dsh-suite-delta/src/host/session-delete.ts', import.meta.url), 'utf8')
const search = readFileSync(new URL('../packages/dsh-suite-delta/src/host/search.ts', import.meta.url), 'utf8')

test('documentation describes the actual cold-session deletion route and its Host dependency', () => {
  assert.match(readme, /sessionPersistence/)
  assert.match(readme, /\/dsh-ui-delta\/session-delete/)
  assert.match(readme, /Harness/)
  assert.match(routes, /route\('\/dsh-ui-delta\/session-delete'/)
  assert.match(routes, /await deleteColdSession\(/)
  assert.match(client, /id: 'session\.delta-delete'/)
  assert.match(client, /window\.confirm/)
  assert.match(deletion, /await rm\(actual, \{ recursive: true, force: false \}\)/)
  assert.match(deletion, /host\.get\?\.\('sessionPersistence'\)/)
  assert.doesNotMatch(deletion, /const service = \(name: string\)/)
})

test('search documentation is aligned with configured providers and optional keyless fallbacks', () => {
  assert.match(readme, /SearXNG/)
  assert.match(readme, /Python/)
  assert.match(readme, /ddgs/)
  assert.match(readme, /DSH_DDGS_PYTHON/)
  assert.doesNotMatch(readme, /\\n\\n/)
  assert.match(search, /publicSearch: typeof searchPublicInstances = searchPublicInstances/)
  assert.match(search, /await publicSearch\(/)
  assert.match(search, /searchPythonDdgs/)
  assert.ok(search.indexOf('await publicSearch(') < search.indexOf('await keyless('),
    'public search should be attempted before local ddgs')
})

test('release history remains intact and the change is recorded as a fragment', () => {
  assert.match(changelog, /^# Changelog\n\n## \[Unreleased\]\n/)
  assert.match(changelog, /## \[0\.1\.0-beta\.1\]/)
  const fragment = readFileSync(new URL('../changelog.d/delta-suite-docs-source-cleanup-20261104.md', import.meta.url), 'utf8')
  const entries = fragment.trim().split('\n').filter(line => line.startsWith('- '))
  assert.equal(entries.length, 4)
})

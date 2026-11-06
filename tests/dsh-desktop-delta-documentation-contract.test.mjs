import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const readme = readFileSync(new URL('../packages/dsh-desktop-delta/README.md', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
const deletion = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/session-delete.ts', import.meta.url), 'utf8')
const search = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/search.ts', import.meta.url), 'utf8')

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

test('released history remains intact and pending entries use a single Chinese changelog', () => {
  assert.match(changelog, /^# \u66f4\u65b0\u65e5\u5fd7\n\n## \[Unreleased\]\n/)
  assert.match(changelog, /## \[0\.1\.0-beta\.1\]/)
  assert.equal(existsSync(new URL('../changelog.d', import.meta.url)), false)
  const unreleased = changelog.split(/\n## \[0\.1\.0-beta\.1\]/)[0]
  const entries = unreleased.split('\n').filter(line => line.startsWith('- '))
  assert.ok(entries.length > 0, 'pending release entries must be retained')
  assert.ok(entries.every(line => /^- (?:\u65b0\u589e|\u4fee\u590d|\u7ef4\u62a4)(?: \[[a-z, ]+\])?: .+/.test(line)))
  assert.match(unreleased, /\u4fee\u590d: \u914d\u7f6e\u6587\u4ef6\u91c7\u7528\u539f\u5b50\u5199\u5165/)
  assert.match(unreleased, /\u7ef4\u62a4: \u66f4\u65b0\u6587\u4ef6\u5939、\u641c\u7d22、\u4f1a\u8bdd\u5220\u9664\u53ca\u9690\u79c1\u8bbe\u7f6e\u8bf4\u660e/)
})

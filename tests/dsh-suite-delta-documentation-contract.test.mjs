import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

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

test('released history remains intact and pending entries use a single Chinese changelog', () => {
  assert.match(changelog, /^# 更新日志\n\n## \[Unreleased\]\n/)
  assert.match(changelog, /## \[0\.1\.0-beta\.1\]/)
  assert.equal(existsSync(new URL('../changelog.d', import.meta.url)), false)
  const unreleased = changelog.split(/\n## \[0\.1\.0-beta\.1\]/)[0]
  const entries = unreleased.split('\n').filter(line => line.startsWith('- '))
  assert.ok(entries.length > 0, 'pending release entries must be retained')
  assert.ok(entries.every(line => /^- (?:新增|修复|维护)(?: \[[a-z, ]+\])?: .+/.test(line)))
  assert.match(unreleased, /修复: 配置文件采用原子写入/)
  assert.match(unreleased, /维护: 更新文件夹、搜索、会话删除及隐私设置说明/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readme = readFileSync(new URL('../packages/dsh-suite-delta/README.md', import.meta.url), 'utf8')
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-suite-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const deletion = readFileSync(new URL('../packages/dsh-suite-delta/src/host/session-delete.ts', import.meta.url), 'utf8')
const search = readFileSync(new URL('../packages/dsh-suite-delta/src/host/search.ts', import.meta.url), 'utf8')

test('Delta Suite documentation reflects the real cold-session deletion boundary', () => {
  assert.match(readme, /## 会话删除的安全边界/)
  assert.match(readme, /实验性的冷会话永久删除/)
  assert.match(readme, /不能保证跨版本兼容或多步骤原子回滚/)
  assert.match(readme, /日常整理优先使用 Harness 原生归档/)
  assert.doesNotMatch(readme, /Delta Suite 不直接执行物理删除/)
  assert.match(routes, /route\('\/dsh-ui-delta\/session-delete'/)
  assert.match(routes, /await deleteColdSession\(/)
  assert.match(client, /id: 'session\.delta-delete'/)
  assert.match(client, /window\.confirm/)
  assert.match(deletion, /await rm\(actual, \{ recursive: true, force: false \}\)/)
  assert.match(deletion, /host\.get\?\.\('sessionPersistence'\)/)
  assert.doesNotMatch(deletion, /const service = \(name: string\)/)
})

test('Delta Suite search docs distinguish public SearXNG from optional Python ddgs', () => {
  assert.match(readme, /Python 是最终兜底，不是全部搜索方式的前置依赖/)
  assert.match(readme, /公共 SearXNG/)
  assert.match(readme, /## 集成式搜索与研究链路\n/)
  assert.doesNotMatch(readme, /默认搜索依赖宿主进程可调用 Python/)
  assert.doesNotMatch(readme, /\\n\\n/)
  assert.match(search, /publicSearch: typeof searchPublicInstances = searchPublicInstances/)
  assert.match(search, /await publicSearch\(/)
  assert.match(search, /searchPythonDdgs/)
  assert.ok(search.indexOf('await publicSearch(') < search.indexOf('await keyless('),
    'public search should be attempted before local ddgs')
})

test('changelog keeps release history intact and has a concise unreleased section', () => {
  assert.match(changelog, /^# Changelog\n\n## \[Unreleased\]\n/)
  assert.match(changelog, /### 新增/)
  assert.match(changelog, /### 修复/)
  assert.match(changelog, /## \[0\.1\.0-beta\.1\]/)
  assert.ok(!changelog.endsWith('\n\n'), 'avoid excessive blank lines at EOF')
})

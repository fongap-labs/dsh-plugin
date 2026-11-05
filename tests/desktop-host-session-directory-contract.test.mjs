import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const host = read('../packages/dsh-desktop-delta/HOST_API.md')
const readme = read('../packages/dsh-desktop-delta/README.md')
const proposal = read('../packages/dsh-desktop-delta/SESSION_DIRECTORY_API_PROPOSAL.md')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')

test('Harness directory capabilities are not advertised before the public transport exists', () => {
  const capabilityLine = host.match(/当前只返回 ([^\n]+)\./)?.[1] ?? ''
  assert.notEqual(capabilityLine, '')
  for (const capability of ['sessions.list', 'sessions.search', 'sessions.create', 'sessions.directory.follow']) {
    assert.equal(capabilityLine.includes(capability), false, capability)
    assert.equal(rust.includes('"' + capability + '"'), false, capability)
  }
})

test('the proposal distinguishes public Gateway APIs from the SDK stdio contract', () => {
  assert.match(proposal, /@deepseek-ai\/dsh-api-session-controller/)
  assert.match(proposal, /当前 sdk profile/)
  assert.match(proposal, /session\/list/)
  assert.match(proposal, /session\/search/)
  assert.match(proposal, /session\/create/)
  assert.match(proposal, /session\/directory\/follow/)
  assert.match(proposal, /cursor/)
  assert.match(proposal, /snapshotRevision/)
  assert.match(proposal, /不读取 Harness 私有会话文件、数据库或安装目录/)
})

test('the README clearly labels the current history as Delta-local only', () => {
  assert.match(readme, /只列出由 Delta 创建的对话/)
  assert.match(readme, /不会把本机列表冒充 Harness 全量会话目录/)
})

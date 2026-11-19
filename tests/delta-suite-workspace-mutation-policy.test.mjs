import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(fileURLToPath(
  new URL('../packages/dsh-delta-suite/src/client.ts', import.meta.url)), 'utf8')
const begin = source.indexOf('type WorkspaceMutationBlock =')
const end = source.indexOf('// Keep this one compatibility adapter lifecycle-owned', begin)
assert.ok(begin >= 0 && end > begin, 'workspace policy source must remain testable')
const fragment = source.slice(begin, end)
const compiled = ts.transpileModule(fragment + '\nthis.policy = readWorkspaceMutationPolicy',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const context = {}
runInNewContext(compiled, context, { timeout: 1000 })
const readWorkspaceMutationPolicy = context.policy
assert.equal(typeof readWorkspaceMutationPolicy, 'function')

const rows = () => [
  { workspaceId: 'one', path: '/projects/one', sessionIds: ['ordinary', 'session-protected'] },
  { workspaceId: 'two', path: '/projects/two', sessionIds: ['other'] },
]
const state = (override = {}) => ({
  lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {},
  ...override,
})
const policy = (snapshot = rows(), overrides = {}) =>
  readWorkspaceMutationPolicy(state(overrides), () => ({ items: snapshot }))

test('complete workspace snapshots preserve allowed actions and sole/default rules', () => {
  assert.equal(policy().deleteWorkspace('two', true), undefined)
  assert.equal(policy().unarchive('ordinary'), undefined)
  assert.equal(policy([rows()[0]]).deleteWorkspace('one', false), 'sole-workspace-protected')
  assert.equal(policy([
    { workspaceId: 'default', path: '/deepseek-harness/default-workspace', sessionIds: ['ordinary'] },
    rows()[1],
  ]).deleteWorkspace('default', true), 'protected-default-workspace')
})

test('locked session aliases and workspace path locks reject deletions and unarchive', () => {
  const direct = policy(rows(), { lockedSessionIds: ['protected'] })
  assert.equal(direct.deleteWorkspace('one', true), 'session-locked')
  assert.equal(direct.deleteWorkspace('two', true), undefined)
  assert.equal(direct.unarchive('session-protected').reason, 'session-locked')
  const lockedWorkspace = policy(rows(), { lockedWorkspaceIds: ['/projects/two'] })
  assert.equal(lockedWorkspace.deleteWorkspace('two', true), 'workspace-locked')
  assert.equal(lockedWorkspace.unarchive('other').reason, 'workspace-locked')
  const deleted = policy(rows(), { deletedSessionIds: ['other'] })
  assert.equal(deleted.unarchive('session-other').reason, 'session-deleted')
})

test('malformed native snapshots fail closed even when no workspace is locked', () => {
  const cases = [
    [{ ...rows()[0], sessionIds: undefined }, rows()[1]],
    [{ ...rows()[0], sessionIds: [''] }, rows()[1]],
    [{ ...rows()[0], path: '/projects/two' }, rows()[1]],
    [{ ...rows()[0], workspaceId: 'two' }, rows()[1]],
    [{ ...rows()[0], path: '' }, rows()[1]],
    [{ ...rows()[0], workspaceId: ' ' }, rows()[1]],
  ]
  for (const invalid of cases) {
    const p = policy(invalid)
    assert.equal(p.deleteWorkspace('two', false), 'workspace-state-unavailable')
    assert.equal(p.unarchive('other').reason, 'workspace-state-unavailable')
  }
  const p = readWorkspaceMutationPolicy(state(), () => { throw Error('catalog unavailable') })
  assert.equal(p.deleteWorkspace('one', true), 'workspace-state-unavailable')
  assert.equal(p.unarchive('ordinary').reason, 'workspace-state-unavailable')
})

test('orphaned relocation does not authorize destructive changes under protection', () => {
  const protectedState = { lockedSessionIds: ['protected'], movedSessions: { protected: 'ghost' } }
  const p = policy(rows(), protectedState)
  assert.equal(p.deleteWorkspace('two', true), 'workspace-state-unavailable')
  assert.equal(p.unarchive('ordinary').reason, 'workspace-state-unavailable')
  const known = policy(rows(), { ...protectedState, movedSessions: { protected: 'one' } })
  assert.equal(known.deleteWorkspace('one', true), 'session-locked')
  assert.equal(known.deleteWorkspace('two', true), undefined)
  // A missing live mapping is not a reason to silently clear a durable lock.
  const locked = policy(rows(), { lockedWorkspaceIds: ['two'], movedSessions: { other: 'missing' } })
  assert.equal(locked.deleteWorkspace('one', true), 'workspace-state-unavailable')
})

test('unsafe states keep their specific lock/tombstone refusal before generic catalog failures', () => {
  const malformed = [{ ...rows()[0], sessionIds: null }, rows()[1]]
  const p = policy(malformed, { lockedSessionIds: ['protected'], deletedSessionIds: ['removed'] })
  assert.equal(p.unarchive('session-protected').reason, 'session-locked')
  assert.equal(p.unarchive('removed').reason, 'session-deleted')
  assert.equal(p.deleteWorkspace('one', true), 'workspace-state-unavailable')
})

test('without protected locks, orphan move history does not block otherwise valid workspace actions', () => {
  const p = policy(rows(), { movedSessions: { ordinary: 'previously-deleted' } })
  assert.equal(p.deleteWorkspace('two', true), undefined)
  assert.equal(p.unarchive('other'), undefined)
})

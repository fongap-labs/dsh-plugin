import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

// Test the live, read-only Search policy. Native Workspace mutations are Host-owned.
const source = readFileSync(fileURLToPath(
  new URL('../packages/delta-suite/src/client.ts', import.meta.url)), 'utf8')
const begin = source.indexOf('type WorkspaceProtectionState =')
const end = source.indexOf('function createClientFeatureManager()', begin)
assert.ok(begin >= 0 && end > begin, 'read-only search protection must be available')
const compiled = stripTypeScriptTypes(
  source.slice(begin, end) + '\nthis.policy = createSearchContentProtection', { mode: 'strip' })
const context = {}
runInNewContext(compiled, context, { timeout: 1000 })
const protect = context.policy
assert.equal(typeof protect, 'function')

const rows = () => [
  { workspaceId: 'one', path: '/projects/one', sessionIds: ['ordinary', 'session-protected'] },
  { workspaceId: 'two', path: '/projects/two', sessionIds: ['other'] },
]
const state = (overrides = {}) => ({
  isSearchProtectionReady: true,
  lockedSessionIds: [], lockedWorkspaceIds: [], deletedSessionIds: [], movedSessions: {},
  ...overrides,
})
const policy = (overrides = {}, snapshot = rows()) =>
  protect(state(overrides), () => ({ items: snapshot }))

test('ordinary search uses native results without rewriting Workspace operations', () => {
  const p = policy()
  assert.equal(p.canQuery, true)
  assert.equal(p.canUseNativeFallback, true)
  assert.equal(p.allowsWorkspace('one', '/projects/one'), true)
  assert.equal(p.allowsSession('ordinary', 'one'), true)
  assert.doesNotMatch(source, /function installWorkspaceMutationGuards\(/)
  assert.doesNotMatch(source, /workspaces\.delete\s*=|workspaces\.unarchiveSession\s*=/)
  assert.doesNotMatch(source, /function readWorkspaceMutationPolicy\(/)
})

test('Session locks and tombstones block matching aliases only within Delta Search', () => {
  const p = policy({ lockedSessionIds: ['protected'], deletedSessionIds: ['other'] })
  assert.equal(p.canQuery, true)
  assert.equal(p.canUseNativeFallback, false)
  assert.equal(p.allowsSession('session-protected'), false)
  assert.equal(p.allowsSession('protected'), false)
  assert.equal(p.allowsSession('other'), false)
  assert.equal(p.allowsSession('ordinary'), true)
})

test('locked Workspace membership and move overlays hide protected search hits', () => {
  const p = policy({ lockedWorkspaceIds: ['/projects/one'], movedSessions: { moved: 'one' } })
  assert.equal(p.canQuery, true)
  assert.equal(p.canUseNativeFallback, false)
  assert.equal(p.allowsWorkspace('one', '/projects/one'), false)
  assert.equal(p.allowsWorkspace('two', '/projects/two'), true)
  assert.equal(p.allowsSession('ordinary', 'one'), false)
  assert.equal(p.allowsSession('protected'), false)
  assert.equal(p.allowsSession('moved'), false)
  assert.equal(p.allowsSession('other', 'two'), true)
})

test('missing or malformed Host membership fails closed only when protected paths require it', () => {
  const unavailable = protect(state({ lockedWorkspaceIds: ['one'] }), () => { throw Error('missing Host snapshot') })
  assert.equal(unavailable.canQuery, false)
  assert.equal(unavailable.canUseNativeFallback, false)
  assert.equal(unavailable.allowsSession('ordinary'), false)
  assert.equal(unavailable.allowsWorkspace('two'), false)

  const malformed = policy({ lockedWorkspaceIds: ['one'] }, [
    { ...rows()[0], sessionIds: undefined }, rows()[1],
  ])
  assert.equal(malformed.canQuery, false)
  assert.equal(malformed.allowsSession('other'), false)
  const unknown = policy({ lockedWorkspaceIds: ['unknown'] })
  assert.equal(unknown.canQuery, false)
})

test('readiness unavailable never guesses authorization from the native Host DOM', () => {
  const p = policy({ isSearchProtectionReady: false })
  assert.equal(p.canQuery, false)
  assert.equal(p.canUseNativeFallback, false)
  assert.equal(p.allowsSession('ordinary'), false)
  assert.equal(p.allowsWorkspace('one'), false)
})

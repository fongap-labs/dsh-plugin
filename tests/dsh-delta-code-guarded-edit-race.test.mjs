import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, sep } from 'node:path'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const root = resolve('dsh-code-worker-guarded-race-workspace')
const execution = () => ({ signal: new AbortController().signal })

function simulatedHost(initial, hooks = {}) {
  const state = { exists: initial.exists, version: initial.version, content: initial.content }
  const observed = { reads: 0, stats: 0, attempted: [], committed: 0 }
  const fs = {
    async resolve(path) { return { path } },
    contains(parent, child) {
      return child.path === parent.path || child.path.startsWith(parent.path + sep)
    },
    async stat(target) {
      observed.stats += 1
      hooks.afterStat?.(state, observed)
      return state.exists ? { type: 'file', version: state.version } : undefined
    },
    async readText(target) {
      observed.reads += 1
      if (!state.exists) throw new Error('Host file absent')
      const snapshot = state.content
      hooks.afterRead?.(state, observed)
      return snapshot
    },
    async writeText(target, content, intent) {
      observed.attempted.push(intent)
      if (intent.kind === 'createIfAbsent') {
        if (state.exists) throw new Error('FS_ALREADY_EXISTS')
      } else if (intent.kind === 'replaceIfVersion') {
        if (!state.exists || intent.version !== state.version) {
          throw new Error('FS_STALE_VERSION')
        }
      } else {
        throw new Error('unexpected unguarded write')
      }
      state.exists = true
      state.version = 'committed-version'
      state.content = content
      observed.committed += 1
    },
  }
  return { ctx: { get: name => name === 'fs' ? fs : undefined }, state, observed }
}

function guardedTool(host) {
  return createMultiEditTool(host.ctx, normalizeConfig({
    workspaceRoot: root, execution: { fsWriteContract: 'guarded-intent' },
  }))
}

describe('Code Worker pinned Host write intents across concurrent edits', () => {
  it('rejects a preflight replacement when the file changes after the second read', async () => {
    const host = simulatedHost({ exists: true, version: 'v1', content: 'alpha' }, {
      afterRead(state, seen) {
        if (seen.reads === 2) {
          state.version = 'v2'
          state.content = 'external edit'
        }
      },
    })
    const result = await guardedTool(host).execute({ preflight: true, edits: [
      { path: 'file.txt', find: 'alpha', replace: 'beta' },
      { path: 'later.txt', content: 'must not write' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /FS_STALE_VERSION/)
    assert.match(result.results[1].note, /earlier batch write failed/)
    assert.deepEqual(host.observed.attempted[0], { kind: 'replaceIfVersion', version: 'v1' })
    assert.equal(host.observed.committed, 0)
    assert.equal(host.state.content, 'external edit')
  })

  it('rejects a non-preflight replacement using the version captured before reading', async () => {
    const host = simulatedHost({ exists: true, version: 'v1', content: 'alpha' }, {
      afterRead(state, seen) {
        if (seen.reads === 2) {
          state.version = 'v2'
          state.content = 'other writer'
        }
      },
    })
    const result = await guardedTool(host).execute({ edits: [
      { path: 'file.txt', find: 'alpha', replace: 'beta' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /FS_STALE_VERSION/)
    assert.deepEqual(host.observed.attempted[0], { kind: 'replaceIfVersion', version: 'v1' })
    assert.equal(host.state.content, 'other writer')
  })

  it('keeps preflight create-if-absent instead of silently overwriting a concurrently created file', async () => {
    const host = simulatedHost({ exists: false, version: undefined, content: undefined }, {
      afterStat(state, seen) {
        if (seen.stats === 2) {
          state.exists = true
          state.version = 'external-v1'
          state.content = 'created concurrently'
        }
      },
    })
    const result = await guardedTool(host).execute({ preflight: true, edits: [
      { path: 'new.txt', content: 'ours' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /FS_ALREADY_EXISTS/)
    assert.deepEqual(host.observed.attempted[0], { kind: 'createIfAbsent' })
    assert.equal(host.state.content, 'created concurrently')
    assert.equal(host.observed.committed, 0)
  })

  it('still permits a guarded replacement when the Host version has not changed', async () => {
    const host = simulatedHost({ exists: true, version: 'v1', content: 'alpha' })
    const result = await guardedTool(host).execute({ preflight: true, edits: [
      { path: 'file.txt', find: 'alpha', replace: 'beta' },
    ] }, execution())
    assert.equal(result.applied, 1)
    assert.equal(host.state.content, 'beta')
    assert.deepEqual(host.observed.attempted[0], { kind: 'replaceIfVersion', version: 'v1' })
  })

  it('rechecks legacy best-effort find/replace content before writing', async () => {
    let reads = 0
    let writes = 0
    const ctx = { get: name => name === 'fs' ? {
      resolve: async path => path,
      readText: async () => {
        reads += 1
        return reads === 1 ? 'alpha' : 'changed by another writer'
      },
      writeText: async () => { writes += 1 },
    } : undefined }
    const tool = createMultiEditTool(ctx, normalizeConfig({ workspaceRoot: root }))
    const result = await tool.execute({ edits: [
      { path: 'file.txt', find: 'alpha', replace: 'beta' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /file changed before replacement/)
    assert.equal(reads, 2)
    assert.equal(writes, 0)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, sep } from 'node:path'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const ROOT = resolve('code-worker-host-multi-edit-identity')
const execution = () => ({ signal: new AbortController().signal })

function host(initial, options = {}) {
  const files = new Map(Object.entries(initial).map(([path, content]) => [
    resolve(ROOT, path), { content, version: 'v1' },
  ]))
  const writes = []
  let version = 1
  const fs = {
    async resolve(path) {
      return { key: options.alias && path === resolve(ROOT, 'alias.txt')
        ? resolve(ROOT, 'real.txt')
        : path }
    },
    contains(parent, child) {
      return child.key === parent.key || child.key.startsWith(parent.key + sep)
    },
    async stat(target) {
      const record = files.get(target.key)
      return record ? { type: 'file', version: record.version } : undefined
    },
    async readText(target) {
      const record = files.get(target.key)
      if (!record) throw new Error('Host target missing')
      return record.content
    },
    async writeText(target, content, intent) {
      writes.push({ path: target.key, content, intent })
      const record = files.get(target.key)
      if (!record || intent?.kind !== 'replaceIfVersion' || record.version !== intent.version) {
        throw new Error('FS_STALE_VERSION')
      }
      if (options.throwAfterSecond && target.key === resolve(ROOT, 'second.txt')) {
        record.content = content
        record.version = 'external-unconfirmed'
        throw new Error('Host connection lost after second write')
      }
      const updated = { content, version: 'v' + ++version }
      files.set(target.key, updated)
      return { operation: 'update', version: updated.version }
    },
  }
  const ctx = { get: name => name === 'fs' ? fs : undefined }
  return {
    files, writes,
    tool: createMultiEditTool(ctx, normalizeConfig({
      workspaceRoot: ROOT, execution: { fsWriteContract: 'guarded-intent' },
    })),
  }
}

describe('Code Worker Host multi-edit identity and uncertain write evidence', () => {
  it('rejects aliases of the same canonical Host FS target before any batch write', async () => {
    const f = host({ 'real.txt': 'before' }, { alias: true })
    const result = await f.tool.execute({ preflight: true, edits: [
      { path: 'real.txt', content: 'first' },
      { path: 'alias.txt', content: 'second' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[1].note, /duplicate Host FS target identity/)
    assert.equal(result.results[0].ok, false)
    assert.deepEqual(f.writes, [])
    assert.equal(f.files.get(resolve(ROOT, 'real.txt')).content, 'before')
  })

  it('rejects canonical Host alias collisions with guarded rollback enabled', async () => {
    const f = host({ 'real.txt': 'before' }, { alias: true })
    const result = await f.tool.execute({
      preflight: true, rollbackOnFailure: true,
      edits: [{ path: 'alias.txt', content: 'first' }, { path: 'real.txt', content: 'second' }],
    }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[1].note, /duplicate Host FS target identity/)
    assert.deepEqual(f.writes, [])
  })

  it('marks a failed Host write as unconfirmed while compensating only earlier confirmed writes', async () => {
    const f = host({ 'first.txt': 'original-one', 'second.txt': 'original-two' }, {
      throwAfterSecond: true,
    })
    const result = await f.tool.execute({
      preflight: true, rollbackOnFailure: true,
      edits: [
        { path: 'first.txt', content: 'new-one' },
        { path: 'second.txt', content: 'new-two' },
      ],
    }, execution())
    assert.equal(result.applied, 0)
    assert.equal(result.rollback.restored, 1)
    assert.match(result.results[0].note, /restored after later batch failure/)
    assert.match(result.results[1].note, /Host write outcome unconfirmed; inspect target before retry/)
    assert.equal(f.files.get(resolve(ROOT, 'first.txt')).content, 'original-one')
    assert.equal(f.files.get(resolve(ROOT, 'second.txt')).content, 'new-two')
    assert.equal(f.writes.length, 3)
  })

  it('marks a failed legacy-style batch write as unconfirmed without claiming application', async () => {
    const f = host({ 'first.txt': 'original-one', 'second.txt': 'original-two' }, {
      throwAfterSecond: true,
    })
    const result = await f.tool.execute({
      preflight: true,
      edits: [
        { path: 'first.txt', content: 'new-one' },
        { path: 'second.txt', content: 'new-two' },
      ],
    }, execution())
    assert.equal(result.applied, 1)
    assert.match(result.results[1].note, /Host write outcome unconfirmed/)
    assert.equal(f.files.get(resolve(ROOT, 'second.txt')).content, 'new-two')
  })


  it('stops after an uncertain Host write under the default batch preflight', async () => {
    const f = host({ 'first.txt': 'original-one', 'second.txt': 'original-two' }, {
      throwAfterSecond: true,
    })
    const result = await f.tool.execute({
      edits: [
        { path: 'second.txt', content: 'new-two' },
        { path: 'first.txt', content: 'new-one' },
      ],
    }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /Host write outcome unconfirmed/)
    assert.match(result.results[1].note, /earlier batch write failed/)
    assert.equal(f.files.get(resolve(ROOT, 'first.txt')).content, 'original-one')
    assert.equal(f.writes.length, 1)
  })

  it('preserves explicit legacy best-effort continuation after an uncertain write', async () => {
    const f = host({ 'second.txt': 'original-two', 'first.txt': 'original-one' }, {
      throwAfterSecond: true,
    })
    const result = await f.tool.execute({
      preflight: false,
      edits: [
        { path: 'second.txt', content: 'new-two' },
        { path: 'first.txt', content: 'new-one' },
      ],
    }, execution())
    assert.equal(result.applied, 1)
    assert.match(result.results[0].note, /Host write outcome unconfirmed/)
    assert.equal(result.results[1].ok, true)
    assert.equal(f.files.get(resolve(ROOT, 'second.txt')).content, 'new-two')
  })
})

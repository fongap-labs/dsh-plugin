import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const exec = () => ({ signal: new AbortController().signal })
const context = { get: () => undefined }

describe('Code Worker optional multi-edit preflight', () => {
  it('blocks all writes if a later edit fails preflight, while preserving legacy behavior', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-preflight-'))
    try {
      await writeFile(join(root, 'existing.txt'), 'before')
      const tool = createMultiEditTool(context, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ preflight: true, edits: [
        { path: 'valid.txt', content: 'should-not-be-written' },
        { path: 'existing.txt', find: 'missing', replace: 'new' },
      ] }, exec())
      assert.equal(result.applied, 0)
      assert.ok(result.results.every(item => item.ok === false))
      await assert.rejects(readFile(join(root, 'valid.txt')), { code: 'ENOENT' })
      assert.equal(await readFile(join(root, 'existing.txt'), 'utf8'), 'before')
      const old = await tool.execute({ edits: [
        { path: 'valid.txt', content: 'legacy-success' },
        { path: 'existing.txt', find: 'missing', replace: 'new' },
      ] }, exec())
      assert.equal(old.applied, 1)
      assert.equal(await readFile(join(root, 'valid.txt'), 'utf8'), 'legacy-success')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects duplicate aliases, conflicting edit fields and path escapes before any write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-preflight-'))
    try {
      const tool = createMultiEditTool(context, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ preflight: true, edits: [
        { path: 'safe.txt', content: 'one' },
        { path: 'nested/../safe.txt', content: 'two' },
        { path: 'mixed.txt', content: 'overwrite', find: 'x', replace: 'y' },
        { path: '../outside.txt', content: 'bad' },
      ] }, exec())
      assert.equal(result.applied, 0)
      assert.match(result.results[1].note, /duplicate/)
      assert.match(result.results[2].note, /exactly one/)
      assert.match(result.results[3].note, /sandbox/)
      await assert.rejects(readFile(join(root, 'safe.txt')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('writes all valid edits after preflight and dryRun never writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-preflight-'))
    try {
      await writeFile(join(root, 'existing.txt'), 'alpha')
      const tool = createMultiEditTool(context, normalizeConfig({ workspaceRoot: root }))
      const edits = [
        { path: 'existing.txt', find: 'alpha', replace: 'beta' },
        { path: 'new.txt', content: 'value' },
      ]
      const preview = await tool.execute({ preflight: true, dryRun: true, edits }, exec())
      assert.equal(preview.applied, 2)
      assert.equal(await readFile(join(root, 'existing.txt'), 'utf8'), 'alpha')
      await assert.rejects(readFile(join(root, 'new.txt')), { code: 'ENOENT' })
      const applied = await tool.execute({ preflight: true, edits }, exec())
      assert.equal(applied.applied, 2)
      assert.ok(applied.results.every(item => item.ok))
      assert.equal(await readFile(join(root, 'existing.txt'), 'utf8'), 'beta')
      assert.equal(await readFile(join(root, 'new.txt'), 'utf8'), 'value')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stops subsequent writes when a replacement target changes after preflight', async () => {
    let reads = 0
    let writes = 0
    const host = {
      get(name) {
        if (name !== 'fs') return undefined
        return {
          resolve: async target => target,
          readText: async target => {
            reads += 1
            return reads === 1 ? 'alpha' : 'concurrently-changed'
          },
          writeText: async (target, content) => {
            writes += 1
          },
        }
      },
    }
    const tool = createMultiEditTool(host, normalizeConfig({ workspaceRoot: 'root' }))
    const result = await tool.execute({ preflight: true, edits: [
      { path: 'file.txt', find: 'alpha', replace: 'beta' },
      { path: 'later.txt', content: 'not-written' },
    ] }, exec())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /changed after preflight/)
    assert.match(result.results[1].note, /earlier batch write failed/)
    assert.equal(writes, 0)
  })

  it('reports partial writes accurately and stops after the first write-stage failure', async () => {
    const attempts = []
    const host = {
      get(name) {
        if (name !== 'fs') return undefined
        return {
          resolve: async target => target,
          readText: async () => '',
          writeText: async (target, content) => {
            attempts.push({ target, content })
            if (attempts.length === 2) throw new Error('host denied second write')
          },
        }
      },
    }
    const tool = createMultiEditTool(host, normalizeConfig({ workspaceRoot: 'root' }))
    const result = await tool.execute({ preflight: true, edits: [
      { path: 'first.txt', content: 'one' },
      { path: 'second.txt', content: 'two' },
      { path: 'third.txt', content: 'three' },
    ] }, exec())
    assert.equal(result.applied, 1)
    assert.equal(result.results[0].ok, true)
    assert.equal(result.results[1].ok, false)
    assert.match(result.results[1].note, /host denied second write/)
    assert.match(result.results[2].note, /earlier batch write failed/)
    assert.equal(attempts.length, 2)
  })

  it('validates unsafe paths and duplicate targets even when only dryRun is specified', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-dry-run-preflight-'))
    try {
      const tool = createMultiEditTool(context, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ dryRun: true, edits: [
        { path: 'safe.txt', content: 'would-write' },
        { path: '../escape.txt', content: 'must-not-write' },
        { path: 'same.txt', content: 'first' },
        { path: 'nested/../same.txt', content: 'duplicate' },
      ] }, exec())
      assert.equal(result.dryRun, true)
      assert.equal(result.applied, 0)
      assert.ok(result.results.every(item => item.ok === false))
      assert.match(result.results[1].note, /sandbox/)
      assert.match(result.results[3].note, /duplicate/)
      await assert.rejects(readFile(join(root, 'safe.txt')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('honors Host FS denial during dryRun instead of reporting a false preview success', async () => {
    let writes = 0
    const host = {
      get(name) {
        if (name !== 'fs') return undefined
        return {
          resolve: async () => { throw new Error('host refused dry run target') },
          readText: async () => '',
          writeText: async () => { writes += 1 },
        }
      },
    }
    const tool = createMultiEditTool(host, normalizeConfig({ workspaceRoot: 'root' }))
    const result = await tool.execute({ dryRun: true, edits: [
      { path: 'denied.txt', content: 'not-written' },
    ] }, exec())
    assert.equal(result.applied, 0)
    assert.equal(result.results[0].ok, false)
    assert.match(result.results[0].note, /host refused dry run target/)
    assert.equal(writes, 0)
  })

  it('does not silently enable expectedSha256 without explicit preflight', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-dry-run-hash-'))
    try {
      const tool = createMultiEditTool(context, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ dryRun: true, edits: [
        { path: 'new.txt', content: 'no', expectedSha256: '0'.repeat(64) },
      ] }, exec())
      assert.equal(result.applied, 0)
      assert.match(result.results[0].note, /requires preflight=true/)
      await assert.rejects(readFile(join(root, 'new.txt')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

})

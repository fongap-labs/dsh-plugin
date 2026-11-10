import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  normalizeConfig, readTextSafe, writeTextSafe, validateWriteTargetSafe,
} from '../packages/dsh-delta-code/lib/runtime.js'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'

const execution = () => ({ signal: new AbortController().signal })
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex')

describe('DSH Host filesystem authority', () => {
  it('refuses local fallback when Host FS has resolve but lacks read or write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-host-fs-'))
    try {
      await writeFile(join(root, 'existing.txt'), 'original', 'utf8')
      const ctx = { get: name => name === 'fs'
        ? { resolve: async path => path }
        : undefined }
      await assert.rejects(readTextSafe(ctx, execution(), root, 'existing.txt'), /Host FS missing resolve\/readText/)
      await assert.rejects(writeTextSafe(ctx, execution(), root, 'existing.txt', 'overwritten'), /Host FS missing resolve\/writeText/)
      assert.equal(await readFile(join(root, 'existing.txt'), 'utf8'), 'original')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses local fallback when the mounted Host FS lacks resolve', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-host-fs-'))
    try {
      const ctx = { get: name => name === 'fs' ? {
        readText: async () => 'host',
        writeText: async () => undefined,
      } : undefined }
      await assert.rejects(validateWriteTargetSafe(ctx, execution(), root, 'new.txt'), /Host FS missing resolve/)
      await assert.rejects(readTextSafe(ctx, execution(), root, 'new.txt'), /Host FS missing resolve\/readText/)
      await assert.rejects(writeTextSafe(ctx, execution(), root, 'new.txt', 'leak'), /Host FS missing resolve\/writeText/)
      await assert.rejects(readFile(join(root, 'new.txt'), 'utf8'), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('Code Worker overwrite version guard', () => {
  it('blocks the entire preflight batch when expectedSha256 does not match', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-hash-preflight-'))
    try {
      await writeFile(join(root, 'file.txt'), 'fresh', 'utf8')
      const tool = createMultiEditTool({ get: () => undefined }, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ preflight: true, edits: [
        { path: 'created.txt', content: 'must not exist' },
        { path: 'file.txt', content: 'stale overwrite', expectedSha256: digest('old') },
      ] }, execution())
      assert.equal(result.applied, 0)
      assert.match(result.results[1].note, /expectedSha256 mismatch/)
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'fresh')
      await assert.rejects(readFile(join(root, 'created.txt'), 'utf8'), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('commits a guarded overwrite only while the original version still matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-hash-preflight-'))
    try {
      await writeFile(join(root, 'file.txt'), 'before', 'utf8')
      const tool = createMultiEditTool({ get: () => undefined }, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ preflight: true, edits: [
        { path: 'file.txt', content: 'after', expectedSha256: digest('before') },
      ] }, execution())
      assert.equal(result.applied, 1)
      assert.equal(result.results[0].ok, true)
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'after')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects source changes between preflight and guarded overwrite', async () => {
    let reads = 0
    let writes = 0
    const ctx = {
      get: name => name === 'fs' ? {
        resolve: async path => path,
        readText: async () => (++reads === 1 ? 'before' : 'concurrent edit'),
        writeText: async () => { writes += 1 },
      } : undefined,
    }
    const tool = createMultiEditTool(ctx, normalizeConfig({ workspaceRoot: process.cwd() }))
    const result = await tool.execute({ preflight: true, edits: [
      { path: 'file.txt', content: 'after', expectedSha256: digest('before') },
      { path: 'next.txt', content: 'should not write' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /changed after preflight/)
    assert.match(result.results[1].note, /earlier batch write failed/)
    assert.equal(writes, 0)
  })

  it('rejects ignored version guards in legacy and replace modes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-hash-preflight-'))
    try {
      await writeFile(join(root, 'file.txt'), 'before', 'utf8')
      const tool = createMultiEditTool({ get: () => undefined }, normalizeConfig({ workspaceRoot: root }))
      const legacy = await tool.execute({ edits: [
        { path: 'file.txt', content: 'after', expectedSha256: digest('before') },
      ] }, execution())
      assert.equal(legacy.applied, 0)
      assert.match(legacy.results[0].note, /requires preflight/)
      const replace = await tool.execute({ preflight: true, edits: [
        { path: 'file.txt', find: 'before', replace: 'after', expectedSha256: digest('before') },
      ] }, execution())
      assert.equal(replace.applied, 0)
      assert.match(replace.results[0].note, /only supported for content overwrite/)
      assert.equal(await readFile(join(root, 'file.txt'), 'utf8'), 'before')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

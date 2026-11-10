import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import {
  normalizeConfig, validateWriteTargetSafe, writeTextSafe,
} from '../packages/dsh-delta-code/lib/runtime.js'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'

const root = resolve('dsh-virtual-fs-write-contract')
const signal = new AbortController().signal
const execution = () => ({ signal: new AbortController().signal })
const guarded = () => normalizeConfig({ execution: { fsWriteContract: 'guarded-intent' } })
function host(info, options = {}) {
  const writes = []
  const calls = []
  const fs = {
    async resolve(path) {
      calls.push('resolve')
      return { key: path }
    },
    contains(parent, target) {
      calls.push('contains')
      return !options.escape &&
        (target.key === parent.key || target.key.startsWith(parent.key + sep))
    },
    async stat(target) {
      calls.push('stat')
      if (options.denyStat) throw new Error('Host denied stat')
      return info
    },
    async writeText(target, content, intent, writeSignal) {
      calls.push('writeText')
      writes.push({ target, content, intent, writeSignal })
      if (options.denyWrite) throw new Error('FS_STALE_VERSION')
      return { operation: info ? 'update' : 'create', version: 'next-version', before: null, after: content }
    },
    async readText() { return 'before' },
  }
  const mounted = options.noStat ? { ...fs, stat: undefined }
    : options.noContain ? { ...fs, contains: undefined } : fs
  return { ctx: { get: name => name === 'fs' ? mounted : undefined }, writes, calls }
}
describe('Code Worker explicit DSH FS write contract', () => {
  it('defaults to the installed legacy overwrite signature without probing', async () => {
    const legacy = host({ type: 'file', version: 'v1' })
    const settings = normalizeConfig(undefined)
    assert.equal(settings.fsWriteContract, 'legacy-overwrite')
    await writeTextSafe(legacy.ctx, { signal }, root, 'existing.txt', 'after', settings)
    assert.equal(legacy.writes.length, 1)
    assert.equal(legacy.writes[0].intent, 'overwrite')
    assert.strictEqual(legacy.writes[0].writeSignal, signal)
    assert.equal(legacy.calls.includes('stat'), false)
    assert.equal(legacy.calls.includes('contains'), false)
  })

  it('writes a present file using the opaque Host version as a guarded replacement', async () => {
    const modern = host({ type: 'file', version: 'opaque-v1' })
    await writeTextSafe(modern.ctx, { signal }, root, 'existing.txt', 'after', guarded())
    assert.deepEqual(modern.writes[0].intent, {
      kind: 'replaceIfVersion', version: 'opaque-v1',
    })
    assert.strictEqual(modern.writes[0].writeSignal, signal)
    assert.ok(modern.calls.includes('stat'))
    assert.ok(modern.calls.includes('contains'))
  })

  it('uses guarded create when the Host reports the target absent', async () => {
    const modern = host(undefined)
    await writeTextSafe(modern.ctx, { signal }, root, 'new.txt', 'created', guarded())
    assert.deepEqual(modern.writes[0].intent, { kind: 'createIfAbsent' })
  })

  it('propagates stale-version denial without local or unconditional retry', async () => {
    const modern = host({ type: 'file', version: 'v1' }, { denyWrite: true })
    await assert.rejects(
      writeTextSafe(modern.ctx, execution(), root, 'file.txt', 'after', guarded()),
      /FS_STALE_VERSION/,
    )
    assert.equal(modern.writes.length, 1)
    assert.deepEqual(modern.writes[0].intent, { kind: 'replaceIfVersion', version: 'v1' })
  })

  it('does not attempt writes with an incomplete Host or unsafe target', async () => {
    for (const opts of [{ noStat: true }, { noContain: true }, { escape: true }]) {
      const modern = host({ type: 'file', version: 'v1' }, opts)
      await assert.rejects(
        writeTextSafe(modern.ctx, execution(), root, 'file.txt', 'after', guarded()),
        /requires DSH Host FS|escapes workspace/,
      )
      assert.equal(modern.writes.length, 0)
    }
  })

  it('rejects unknown or nonregular versions and denied stat without writing', async () => {
    for (const [info, opts] of [
      [{ type: 'directory', version: 'v1' }, {}],
      [{ type: 'file' }, {}],
      [{ type: 'file', version: 123 }, {}],
      [{ type: 'file', version: 'v1' }, { denyStat: true }],
    ]) {
      const modern = host(info, opts)
      await assert.rejects(
        writeTextSafe(modern.ctx, execution(), root, 'file.txt', 'after', guarded()),
        /regular file|Host denied stat/,
      )
      assert.equal(modern.writes.length, 0)
    }
  })

  it('never falls back to local writes when guarded Host FS is absent', async () => {
    const missing = { get: () => undefined }
    await assert.rejects(
      writeTextSafe(missing, execution(), root, 'file.txt', 'after', guarded()),
      /requires a mounted DSH Host FS/,
    )
    await assert.rejects(
      validateWriteTargetSafe(missing, execution(), root, 'file.txt', guarded()),
      /requires a mounted DSH Host FS/,
    )
  })

  it('blocks a guarded preflight batch when Host containment rejects a target', async () => {
    const modern = host(undefined, { escape: true })
    const tool = createMultiEditTool(modern.ctx, normalizeConfig({
      workspaceRoot: root, execution: { fsWriteContract: 'guarded-intent' },
    }))
    const result = await tool.execute({ preflight: true, edits: [
      { path: 'file.txt', content: 'after' },
      { path: 'next.txt', content: 'after' },
    ] }, execution())
    assert.equal(result.applied, 0)
    assert.equal(modern.writes.length, 0)
    assert.ok(result.results.every(item => !item.ok))
  })

  it('rejects invalid explicit contract names before tool registration', () => {
    assert.throws(
      () => normalizeConfig({ execution: { fsWriteContract: 'auto-detect' } }),
      /execution.fsWriteContract/,
    )
  })
})

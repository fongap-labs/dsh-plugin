import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, sep } from 'node:path'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const root = resolve('code-worker-guarded-batch-recovery')
const exec = (controller = new AbortController()) => ({ signal: controller.signal })
const edits = [
  { path: 'first.txt', content: 'our-first' },
  { path: 'second.txt', content: 'our-second' },
]

function simulatedHost(options = {}) {
  const files = new Map([
    [resolve(root, 'first.txt'), { content: 'original-first', version: 'v1' }],
    [resolve(root, 'second.txt'), { content: 'original-second', version: 'v1' }],
  ])
  const writes = []
  let sequence = 1
  const fs = {
    async resolve(path) { return { key: path } },
    contains(parent, target) {
      return target.key === parent.key || target.key.startsWith(parent.key + sep)
    },
    async stat(target) {
      const f = files.get(target.key)
      return f ? { type: 'file', version: f.version } : undefined
    },
    async readText(target) {
      const f = files.get(target.key)
      if (!f) throw new Error('Host FS file absent')
      return f.content
    },
    async writeText(target, content, intent, signal) {
      writes.push({ path: target.key, content, intent, signal })
      if (options.denySecond && target.key.endsWith(sep + 'second.txt')) {
        if (options.changeFirstBeforeRollback) {
          files.set(resolve(root, 'first.txt'), { content: 'external change', version: 'external-v3' })
        }
        throw new Error('Host refused second write')
      }
      if (options.denyRecovery && content === 'original-first') {
        throw new Error('Host refused compensation')
      }
      const previous = files.get(target.key)
      if (intent?.kind === 'createIfAbsent') {
        if (previous) throw new Error('FS_NOT_OBSERVED')
      } else if (intent?.kind === 'replaceIfVersion') {
        if (!previous || intent.version !== previous.version) {
          throw new Error('FS_STALE_VERSION')
        }
      } else {
        throw new Error('unsafe write intent')
      }
      const version = 'v' + ++sequence
      files.set(target.key, { content, version })
      options.afterWrite?.({ target, content, version, files, writes })
      if (options.omitOutcome) return undefined
      return { operation: previous ? 'update' : 'create', version, before: previous?.content ?? null, after: content }
    },
  }
  return {
    ctx: { get: name => name === 'fs' ? fs : undefined },
    files, writes,
    tool: createMultiEditTool({ get: name => name === 'fs' ? fs : undefined },
      normalizeConfig({ workspaceRoot: root, execution: { fsWriteContract: 'guarded-intent' } })),
  }
}

describe('Code Worker guarded batch compensation', () => {
  it('restores earlier confirmed writes when a later Host write fails', async () => {
    const host = simulatedHost({ denySecond: true })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 0)
    assert.equal(result.rollback.attempted, 1)
    assert.equal(result.rollback.restored, 1)
    assert.equal(result.rollback.failed, 0)
    assert.equal(result.results[0].ok, false)
    assert.match(result.results[0].note, /restored after later batch failure/)
    assert.match(result.results[1].note, /Host refused second write/)
    assert.equal(host.files.get(resolve(root, 'first.txt')).content, 'original-first')
    assert.equal(host.files.get(resolve(root, 'second.txt')).content, 'original-second')
    assert.deepEqual(host.writes[2].intent, { kind: 'replaceIfVersion', version: 'v2' })
  })

  it('never overwrites a third party edit made after our successful write', async () => {
    const host = simulatedHost({ denySecond: true, changeFirstBeforeRollback: true })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 1)
    assert.equal(result.rollback.attempted, 1)
    assert.equal(result.rollback.restored, 0)
    assert.equal(result.rollback.failed, 1)
    assert.equal(result.results[0].ok, true)
    assert.match(result.results[0].note, /recovery refused: FS_STALE_VERSION/)
    assert.equal(host.files.get(resolve(root, 'first.txt')).content, 'external change')
  })

  it('reports a denied restoration instead of claiming a rollback', async () => {
    const host = simulatedHost({ denySecond: true, denyRecovery: true })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 1)
    assert.equal(result.rollback.failed, 1)
    assert.match(result.results[0].note, /Host refused compensation/)
    assert.equal(host.files.get(resolve(root, 'first.txt')).content, 'our-first')
  })

  it('refuses automatic restoration of newly created files at preflight', async () => {
    const host = simulatedHost()
    const result = await host.tool.execute({
      preflight: true, rollbackOnFailure: true,
      edits: [{ path: 'first.txt', content: 'edited' }, { path: 'new.txt', content: 'new' }],
    }, exec())
    assert.equal(result.applied, 0)
    assert.equal(host.writes.length, 0)
    assert.match(result.results[1].note, /requires an existing file/)
    assert.equal(host.files.has(resolve(root, 'new.txt')), false)
  })

  it('requires opt-in, full preflight and guarded Host contract', async () => {
    const host = simulatedHost()
    const noPreflight = await host.tool.execute({ rollbackOnFailure: true, edits }, exec())
    assert.equal(noPreflight.applied, 0)
    assert.equal(host.writes.length, 0)
    assert.match(noPreflight.results[0].note, /requires preflight=true/)
    const legacy = createMultiEditTool(host.ctx, normalizeConfig({ workspaceRoot: root }))
    const result = await legacy.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /guarded-intent Host FS/)
    assert.equal(host.writes.length, 0)
  })

  it('stops the batch when a successful Host write does not return its version', async () => {
    const host = simulatedHost({ omitOutcome: true })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 1)
    assert.equal(host.writes.length, 1)
    assert.equal(result.rollback.attempted, 0)
    assert.match(result.rollback.skippedReason, /lacked version/)
    assert.match(result.results[0].note, /recovery unavailable/)
    assert.match(result.results[1].note, /batch stopped/)
    assert.equal(host.files.get(resolve(root, 'first.txt')).content, 'our-first')
  })

  it('never bypasses cancellation to perform compensation', async () => {
    const controller = new AbortController()
    const host = simulatedHost({
      afterWrite: () => controller.abort(),
    })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits },
      exec(controller))
    assert.equal(result.applied, 1)
    assert.equal(result.rollback.attempted, 0)
    assert.match(result.rollback.skippedReason, /cancelled/)
    assert.equal(host.writes.length, 1)
  })

  it('preserves legacy partial-write behavior when recovery is not requested', async () => {
    const host = simulatedHost({ denySecond: true })
    const result = await host.tool.execute({ preflight: true, edits }, exec())
    assert.equal(result.applied, 1)
    assert.equal(result.rollback, undefined)
    assert.equal(host.files.get(resolve(root, 'first.txt')).content, 'our-first')
    assert.equal(host.writes.length, 2)
  })

  it('applies all version-guarded edits when the batch succeeds', async () => {
    const host = simulatedHost()
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 2)
    assert.equal(result.rollback, undefined)
    assert.deepEqual(result.results.map(x => x.ok), [true, true])
    assert.equal(host.files.get(resolve(root, 'second.txt')).content, 'our-second')
  })

  it('rejects snapshots larger than 2 MiB before writing', async () => {
    const host = simulatedHost()
    host.files.set(resolve(root, 'first.txt'), { content: 'x'.repeat(2 * 1024 * 1024 + 1), version: 'v1' })
    const result = await host.tool.execute({ preflight: true, rollbackOnFailure: true, edits }, exec())
    assert.equal(result.applied, 0)
    assert.match(result.results[0].note, /snapshot exceeds 2 MiB/)
    assert.equal(host.writes.length, 0)
  })
})

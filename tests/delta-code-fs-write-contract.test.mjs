import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import {
  normalizeConfig, validateWriteTargetSafe, writeTextSafe,
} from '../packages/delta-code/lib/runtime.js'
import { createMultiEditTool } from '../packages/delta-code/lib/tools/multi-edit.js'

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

  it('adapts native unguarded writes by omitting expected without moving the abort signal', async () => {
    const native = host({ type: 'file', version: 'opaque-v1' })
    const settings = normalizeConfig({ execution: { fsWriteContract: 'native-unguarded' } })
    await validateWriteTargetSafe(native.ctx, { signal }, root, 'existing.txt', settings)
    await writeTextSafe(native.ctx, { signal }, root, 'existing.txt', 'after', settings)
    assert.equal(native.writes.length, 1)
    assert.equal(native.writes[0].intent, undefined)
    assert.strictEqual(native.writes[0].writeSignal, signal)
    assert.equal(native.calls.includes('stat'), false)
    assert.ok(native.calls.includes('contains'))
  })

  it('fails closed on native unguarded writes without Host or containment', async () => {
    const settings = normalizeConfig({ execution: { fsWriteContract: 'native-unguarded' } })
    await assert.rejects(
      writeTextSafe({ get: () => undefined }, { signal }, root, 'file.txt', 'after', settings),
      /native-unguarded requires a mounted DSH Host FS/,
    )
    for (const options of [{ noContain: true }, { escape: true }]) {
      const native = host({ type: 'file', version: 'v1' }, options)
      await assert.rejects(
        writeTextSafe(native.ctx, { signal }, root, 'file.txt', 'after', settings),
        /native-unguarded requires|escapes workspace/,
      )
      assert.equal(native.writes.length, 0)
    }
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

describe('Host-authoritative per-session filesystem sandbox policy', () => {
  it('forwards current session policy to every write without widening permissions or passing legacy sentinel', async () => {
    const f = host({ type: 'file', version: 'v1' })
    const fs = f.ctx.get('fs')
    fs.sandboxMode = 'workspace-write'
    const session = { id: 'session-a' }
    let mode = 'danger-full-access'
    const policies = []
    const requests = []
    const writes = []
    const resolver = { resolve(request) {
      requests.push(request)
      const policy = { mode, workspaceRoot: root, sessionId: request.session.id }
      policies.push(policy)
      return policy
    } }
    fs.writeText = async (...args) => { writes.push(args); return { version: 'next' } }
    const ctx = { get: name => name === 'sandboxPolicy' ? resolver : f.ctx.get(name) }
    const exec = { agent: { session }, signal }
    const settings = normalizeConfig(undefined)
    await writeTextSafe(ctx, exec, root, 'file.txt', 'first', settings)
    mode = 'read-only'
    await writeTextSafe(ctx, exec, root, 'file.txt', 'second', settings)
    assert.deepEqual(requests, [{ session }, { session }])
    assert.equal(writes[0][2], undefined)
    assert.strictEqual(writes[0][3], signal)
    assert.strictEqual(writes[0][4], policies[0])
    assert.strictEqual(writes[1][4], policies[1])
    assert.equal(writes[0][4].mode, 'danger-full-access')
    assert.equal(writes[1][4].mode, 'read-only')
  })

  it('fails closed if a confining Host has no policy service', async () => {
    const f = host({ type: 'file', version: 'v1' })
    f.ctx.get('fs').sandboxMode = 'workspace-write'
    await assert.rejects(writeTextSafe(f.ctx, execution(), root, 'file.txt', 'after', normalizeConfig(undefined)),
      /sandbox policy unavailable/)
    assert.equal(f.writes.length, 0)
  })

  it('retains guarded intent and never retries Host denial unguarded', async () => {
    const f = host({ type: 'file', version: 'v1' })
    const fs = f.ctx.get('fs')
    fs.sandboxMode = 'workspace-write'
    const session = { id: 's' }
    const policy = { mode: 'read-only', workspaceRoot: root }
    let count = 0
    fs.writeText = async (_target, _content, intent, actualSignal, actualPolicy) => {
      count++
      assert.deepEqual(intent, { kind: 'replaceIfVersion', version: 'v1' })
      assert.strictEqual(actualSignal, signal)
      assert.strictEqual(actualPolicy, policy)
      throw Error('FS_SANDBOX_DENIED')
    }
    const ctx = { get: name => name === 'sandboxPolicy'
      ? { resolve(request) { assert.strictEqual(request.session, session); return policy } }
      : f.ctx.get(name) }
    await assert.rejects(writeTextSafe(ctx, { agent: { session }, signal }, root, 'file.txt', 'after', guarded()),
      /FS_SANDBOX_DENIED/)
    assert.equal(count, 1)
  })
})

it('does not let a full-access Host session escape the Delta workspace via canonical aliases', async () => {
  const f = host({ type: 'file', version: 'v1' }, { escape: true })
  f.ctx.get('fs').sandboxMode = 'workspace-write'
  const ctx = { get: name => name === 'sandboxPolicy'
    ? { resolve: () => ({ mode: 'danger-full-access', workspaceRoot: root }) } : f.ctx.get(name) }
  await assert.rejects(writeTextSafe(ctx, execution(), root, 'file.txt', 'after', normalizeConfig(undefined)),
    /escapes workspace/)
  assert.equal(f.writes.length, 0)
})

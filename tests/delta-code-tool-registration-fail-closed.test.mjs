import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dshToolRegistrar } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/tool-registration.js'
import { mountDeltaCodeFeatures } from '../packages/delta-code/lib/delta-code-kernel/feature.js'

const tool = (name) => ({
  name,
  description: 'Test registration contract',
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'object', properties: {} }, render: () => [{ type: 'text', text: 'ok' }] },
  async execute() { return {} },
})
const stats = { wrap: (definition) => definition }

describe('Delta Code DSH registration fail-closed boundary', () => {
  it('rejects a missing Host tools service instead of silently declaring a tool mounted', () => {
    const warnings = []
    const registrar = dshToolRegistrar({ logger: { warn: (message) => warnings.push(message) } }, stats)
    assert.throws(() => registrar.register(tool('code_missing')), /tools service unavailable/)
    assert.ok(warnings.some(message => message.includes('code_missing')))
  })

  it('unmounts already registered tools if Host tools disappear during feature assembly', () => {
    const active = new Set()
    let isAvailable = true
    const ctx = {
      get tools() {
        return isAvailable ? { register(definition) {
          active.add(definition.name)
          isAvailable = false
          return () => { active.delete(definition.name) }
        } } : undefined
      },
    }
    assert.throws(() => mountDeltaCodeFeatures([
      { id: 'feature-one', tools: [tool('code_one')] },
      { id: 'feature-two', tools: [tool('code_two')] },
    ], dshToolRegistrar(ctx, stats)), /tools service unavailable/)
    assert.equal(active.size, 0)
  })

  it('still supports a Host registry that registers successfully without an explicit disposer', () => {
    const calls = []
    const ctx = { tools: { register(definition) { calls.push(definition.name) } } }
    const registrar = dshToolRegistrar(ctx, stats)
    assert.doesNotThrow(() => registrar.register(tool('code_legacy')))
    assert.deepEqual(calls, ['code_legacy'])
  })
})

describe('DSH MultiEdit failure propagation', () => {
  it('propagates failed and partially applied batches while retaining outcomes and successful results', async () => {
    let registered
    const ctx = { tools: { register(definition) { registered = definition } } }
    let outcome = { applied: 0, results: [{ path: 'a.ts', ok: false, action: 'skipped', note: 'permission denied' }] }
    const definition = { ...tool('code_multi_edit'), execute: async () => outcome }
    dshToolRegistrar(ctx, stats).register(definition)
    const exec = { signal: new AbortController().signal }
    await assert.rejects(registered.execute({}, exec), /permission denied/)
    outcome = { applied: 1, results: [{ path: 'a.ts', ok: true, action: 'replace' }, { path: 'b.ts', ok: false, action: 'skipped' }] }
    await assert.rejects(registered.execute({}, exec), /"applied":1/)
    outcome = { applied: 1, results: [{ path: 'a.ts', ok: true, action: 'replace' }] }
    assert.deepEqual(await registered.execute({}, exec), outcome)
  })
})

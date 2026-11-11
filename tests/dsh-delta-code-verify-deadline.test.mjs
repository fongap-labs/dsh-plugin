import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runPreparedVerify } from '../packages/dsh-delta-code/lib/tools/verify.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const settings = normalizeConfig({ execution: { allowCommands: true } })
const prepared = timeoutMs => ({
  script: 'test', plan: { project: 'node', command: 'npm', args: ['run', 'test'] },
  cwd: process.cwd(), timeoutMs,
})

describe('Delta Code Host verification deadlines', () => {
  it('reports unconfirmed outcome and requests Host cancellation when done never settles', async () => {
    let hostSignal
    let calls = 0
    const ctx = { subprocess: { spawn(spec) {
      calls++
      hostSignal = spec.signal
      return { done: new Promise(() => {}) }
    } } }
    await assert.rejects(
      runPreparedVerify(ctx, settings, { signal: new AbortController().signal }, prepared(25)),
      /deadline exceeded; execution outcome unconfirmed/,
    )
    assert.equal(calls, 1)
    assert.equal(hostSignal.aborted, true)
  })

  it('reacts to user cancellation without waiting for an unresponsive Host', async () => {
    let hostSignal
    const ctx = { subprocess: { spawn(spec) {
      hostSignal = spec.signal
      return { done: new Promise(() => {}) }
    } } }
    const controller = new AbortController()
    const pending = runPreparedVerify(ctx, settings, { signal: controller.signal }, prepared(1000))
    controller.abort()
    await assert.rejects(pending, /verification cancelled/)
    assert.equal(hostSignal.aborted, true)
  })
})

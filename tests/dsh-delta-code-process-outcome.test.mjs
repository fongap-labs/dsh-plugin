import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assessProcessOutcome } from '../packages/dsh-delta-code/lib/delta-code-adapter/contracts/process-outcome.js'

const good = { exitCode: 0, signal: null, timedOut: false, lossy: false }

describe('Delta Code completed subprocess evidence', () => {
  it('only marks complete zero-exit results successful', () => {
    assert.deepEqual(assessProcessOutcome(good), {
      status: 'succeeded', complete: true, reason: 'clean-exit',
    })
  })

  it('never treats malformed, signaled or cancelled-looking outcomes as success', () => {
    for (const result of [
      null, undefined, {},
      { ...good, exitCode: null },
      { ...good, exitCode: -1 },
      { ...good, exitCode: undefined },
      { ...good, signal: undefined },
      { ...good, signal: 'SIGTERM' },
      { ...good, timedOut: undefined },
      { ...good, timedOut: true },
      { ...good, exitCode: NaN },
    ]) {
      assert.equal(assessProcessOutcome(result).status, 'uncertain')
      assert.equal(assessProcessOutcome(result).complete, false)
    }
  })

  it('distinguishes a known nonzero exit from an uncertain termination', () => {
    assert.deepEqual(assessProcessOutcome({ ...good, exitCode: 1 }), {
      status: 'failed', complete: false, reason: 'nonzero-exit',
    })
    assert.deepEqual(assessProcessOutcome({ ...good, lossy: true }), {
      status: 'succeeded', complete: false, reason: 'incomplete-output',
    })
    assert.equal(assessProcessOutcome({ ...good, lossy: undefined }).complete, false)
  })
})

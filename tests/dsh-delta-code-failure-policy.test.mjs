import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyFailure, retryReadOnly } from '../packages/dsh-delta-code/lib/tools/failure-policy.js'

describe('Delta Code Worker bounded recovery policy', () => {
  it('classifies denial before transport, unknown outcomes and test failures', () => {
    assert.equal(classifyFailure('HTTP 403 access denied; HTTP 503'), 'permission')
    assert.equal(classifyFailure(Error('Host refused')), 'permission')
    assert.equal(classifyFailure(Error('HTTP 429 rate limited')), 'transient')
    assert.equal(classifyFailure(Error('ETIMEDOUT')), 'transient')
    assert.equal(classifyFailure(Error('assertion failed')), 'verification')
    assert.equal(classifyFailure(Error('tool output lost')), 'unknown')
  })

  it('retries a transient read-only request within its strict bound', async () => {
    let attempts = 0
    const value = await retryReadOnly(async () => {
      attempts++
      if (attempts === 1) throw Error('HTTP 503')
      return 'ok'
    }, new AbortController().signal)
    assert.equal(value, 'ok')
    assert.equal(attempts, 2)
  })

  it('never retries permission denial or unknown outcomes', async () => {
    for (const message of ['HTTP 403 forbidden', 'unknown process state']) {
      let attempts = 0
      await assert.rejects(retryReadOnly(async () => {
        attempts++
        throw Error(message)
      }, new AbortController().signal), /HTTP 403|unknown process/)
      assert.equal(attempts, 1)
    }
  })
})

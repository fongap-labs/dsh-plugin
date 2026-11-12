import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { gatewayRetryAfterMs, registerGatewayRetryCoordinator } from '../packages/dsh-delta-code/lib/gateway-retry-coordination.js'

function failure(ms, code = 'gateway_attempt_budget_exhausted', failureKinds = undefined) {
  return {
    code: 'RATE_LIMIT',
    message: `503: ${JSON.stringify({
      message: 'exhausted',
      details: {
        gateway_code: code, retryable: true, retry_after_ms: ms,
        ...(failureKinds ? { failure_kinds: failureKinds } : {}),
      },
    })}`,
  }
}
function fixture() {
  let handler
  let prepend
  let enabled = true
  const logs = []
  let now = 100
  const waits = []
  const ctx = {
    logger: { info: text => logs.push(text) },
    on(name, callback, priority) {
      assert.equal(name, 'agent/request-error')
      handler = callback
      prepend = priority
      return () => { handler = undefined }
    },
  }
  const dispose = registerGatewayRetryCoordinator(ctx, () => enabled, {
    now: () => now,
    async wait(ms) {
      waits.push(ms)
      now += ms
      return true
    },
  })
  return {
    get handler() { return handler },
    get prepend() { return prepend },
    setEnabled(value) { enabled = value },
    advance(ms) { now += ms },
    dispose, waits, logs,
  }
}

describe('Gateway request retry coordination', () => {
  it('reads only Gateway-owned retry-after JSON and rejects malformed or unrelated errors', () => {
    assert.equal(gatewayRetryAfterMs(failure(242000).message), 242000)
    assert.equal(gatewayRetryAfterMs(failure(6000, 'gateway_no_dispatchable_node').message), 6000)
    assert.equal(gatewayRetryAfterMs('503: {"message":"upstream provider error"}'), null)
    assert.equal(gatewayRetryAfterMs('429: {"details":{"retry_after_ms":1000}}'), null)
    assert.equal(gatewayRetryAfterMs('random gateway_attempt_budget_exhausted retry_after_ms=242000'), null)
    assert.equal(gatewayRetryAfterMs(failure(0).message), null)
    assert.equal(gatewayRetryAfterMs(failure(1.1).message), null)
    assert.equal(gatewayRetryAfterMs(failure(242000).message + 'garbage'), null)
  })
  it('preempts stock DSH retries when Gateway says to wait 242 seconds', async () => {
    const f = fixture()
    try {
      let nativeCalls = 0
      assert.equal(f.prepend, true)
      const decision = await f.handler({ failure: failure(242000), retryPolicy: { mode: 'normal', maxDelayMs: 10000 } }, async () => {
        nativeCalls++
        return { kind: 'retry' }
      })
      assert.equal(decision, undefined)
      assert.equal(nativeCalls, 0, 'entire Gateway fallback plan must not be replayed in 0.5 seconds')
      assert.equal(f.logs.length, 1)
      assert.equal(f.logs[0].includes('242000'), false, 'log only safe reason without raw provider body')
    } finally { f.dispose() }
  })
  it('honors the Gateway no-replay contract for mixed 429/timeout exhaustion without disabling pure 429 recovery', async () => {
    const f = fixture()
    try {
      let nativeCalls = 0
      const next = async () => { nativeCalls++; return { kind: 'retry' } }
      // Gateway #402 sets x-should-retry:false for this exact failure shape.
      // The Provider adapter does not guarantee that header reaches DSH.
      const mixed = failure(6000, 'gateway_attempt_budget_exhausted', { rate_limit: 4, headers_timeout: 4 })
      assert.equal(gatewayRetryAfterMs(mixed.message), 6000)
      assert.equal(await f.handler({
        failure: mixed, retryPolicy: { mode: 'normal', maxDelayMs: 10000 },
      }, next), undefined)
      assert.equal(nativeCalls, 0, 'mixed timeout/rate-limit exhaustion must not repeat the whole Gateway plan')
      assert.deepEqual(f.waits, [], 'a forbidden replay must not schedule another wait')

      // Pure rate-limit exhaustion remains retryable after the advertised wait.
      const pure = failure(6000, 'gateway_attempt_budget_exhausted', { rate_limit: 4 })
      assert.deepEqual(await f.handler({
        failure: pure, retryPolicy: { mode: 'normal', maxDelayMs: 10000 },
      }, next), { kind: 'retry' })
      assert.equal(nativeCalls, 1)
      assert.deepEqual(f.waits, [6000])
    } finally { f.dispose() }
  })
  it('extends short Gateway waits only after the existing native retry decision', async () => {
    const f = fixture()
    try {
      const result = await f.handler({ failure: failure(6000), retryPolicy: { mode: 'normal', maxDelayMs: 10000 } }, async () => {
        f.advance(550)
        return { kind: 'retry' }
      })
      assert.deepEqual(result, { kind: 'retry' })
      assert.deepEqual(f.waits, [5450])
    } finally { f.dispose() }
  })
  it('does not duplicate a native Retry-After delay or retry decision', async () => {
    const f = fixture()
    try {
      const result = await f.handler({
        failure: { ...failure(6000), providerRetryAfterMs: 6000 },
        retryPolicy: { mode: 'normal', maxDelayMs: 10000 },
      }, async () => ({ kind: 'retry' }))
      assert.deepEqual(result, { kind: 'retry' })
      assert.deepEqual(f.waits, [])
      const final = await f.handler({ failure: failure(6000) }, async () => undefined)
      assert.equal(final, undefined)
      assert.deepEqual(f.waits, [])
    } finally { f.dispose() }
  })
  it('delegates to Host when unrelated, disabled or an explicit always-retry policy', async () => {
    const f = fixture()
    try {
      let calls = 0
      const next = async () => { calls++; return { kind: 'retry' } }
      assert.deepEqual(await f.handler({ failure: { code: 'SERVER', message: '503 upstream' } }, next), { kind: 'retry' })
      f.setEnabled(false)
      assert.deepEqual(await f.handler({ failure: failure(242000) }, next), { kind: 'retry' })
      f.setEnabled(true)
      assert.deepEqual(await f.handler({ failure: failure(242000), retryPolicy: { mode: 'always' } }, next), { kind: 'retry' })
      assert.equal(calls, 3)
    } finally { f.dispose() }
  })
  it('halts on cancelled short retry and unregisters on dispose', async () => {
    const f = fixture()
    const aborted = new AbortController()
    aborted.abort()
    assert.equal(await f.handler({ failure: failure(3000), signal: aborted.signal }, async () => ({ kind: 'retry' })), undefined)
    f.dispose()
    assert.equal(f.handler, undefined)
  })
})

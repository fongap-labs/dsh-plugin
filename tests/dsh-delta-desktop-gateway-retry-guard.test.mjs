import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const built = relative => pathToFileURL(fixture(`packages/dsh-delta-desktop/lib/${relative}`)).href
const { installGatewayRetryGuard, isDeferredGatewayExhaustion } = await import(built('host-gateway-retry-guard.js'))

const gatewayFailure = (wait, code = 'gateway_attempt_budget_exhausted', status = 503) => ({
  code: 'RATE_LIMIT',
  message: `${status}: ${JSON.stringify({
    message: 'Transient failures exhausted the compatible-model failover plan for "Code-Max".',
    details: { requested_model: 'Code-Max', attempts: 8, dispatches: 8, gateway_code: code, retryable: true, retry_after_ms: wait },
  })}`,
})

test('gateway exhaustion with long wait blocks only immediate full-step retry', () => {
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(242000)), true)
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(5000)), true)
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(4999)), false)
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(1000)), false)
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(242000, 'gateway_upstream_exhausted')), false)
  assert.equal(isDeferredGatewayExhaustion(gatewayFailure(242000, 'gateway_attempt_budget_exhausted', 429)), false)
  assert.equal(isDeferredGatewayExhaustion({ message: '503: broken json' }), false)
  assert.equal(isDeferredGatewayExhaustion({ message: 'unrelated 503' }), false)
  assert.equal(isDeferredGatewayExhaustion(null), false)
  assert.equal(isDeferredGatewayExhaustion({ message: '503: ' + 'x'.repeat(20000) }), false)
})

test('Host waterfall guard is first, suppresses exhausted retries and delegates other failures', async () => {
  let handler, options, disposed = false, delegated = 0
  const ctx = {
    on(name, callback, value) {
      assert.equal(name, 'agent/request-error')
      handler = callback
      options = value
      return () => { disposed = true }
    },
  }
  const dispose = installGatewayRetryGuard(ctx)
  assert.deepEqual(options, { prepend: true })
  const downstream = async () => { delegated++; return { kind: 'retry' } }
  assert.equal(await handler({ failure: gatewayFailure(242000) }, downstream), undefined)
  assert.equal(delegated, 0, 'the DSH native retry waterfall must not run after confirmed long Gateway exhaustion')
  assert.deepEqual(await handler({ failure: gatewayFailure(1000) }, downstream), { kind: 'retry' })
  assert.deepEqual(await handler({ failure: { code: 'SERVER', message: 'ordinary upstream unavailable' } }, downstream), { kind: 'retry' })
  assert.equal(delegated, 2, 'non-Gateway failures retain native DSH retry')
  dispose()
  assert.equal(disposed, true)
  assert.doesNotThrow(() => installGatewayRetryGuard({})())
})

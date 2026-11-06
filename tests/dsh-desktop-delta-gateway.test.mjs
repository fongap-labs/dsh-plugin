import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import {
  GatewayQueue,
  classifyGatewayFailure,
  registerGatewayReliability,
} from '../packages/dsh-suite-delta/lib/host/gateway-reliability.js'

const config = { providers: ['gateway'], origins: ['https://gateway.example.com'] }
const agent = (id) => ({ session: { id } })
const sid = 'session-gateway-test'
const failure = (message) => ({ message, code: 'SERVER' })
const terminal = (error) => ({ type: 'finish', reason: { kind: 'error', failure: error } })

function harness() {
  const listeners = new Map()
  const cleanup = []
  const ctx = {
    on(name, listener, prepend) {
      const list = listeners.get(name) ?? []
      prepend ? list.unshift(listener) : list.push(listener)
      listeners.set(name, list)
      return () => {
        const at = list.indexOf(listener)
        if (at >= 0) list.splice(at, 1)
      }
    },
    effect(callback) {
      cleanup.push(callback())
    },
    logger: { info() {} },
  }
  return { ctx, hook: (name) => listeners.get(name)?.[0], dispose: () => cleanup.forEach((fn) => fn()) }
}
async function collect(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}
async function prepare(host, id = sid, step = 1) {
  return host.hook('agent/pre-step')(
    { agent: agent(id), turn: 1, step, modelSelection: { provider: 'gateway' } },
    async () => ({ kind: 'enter' }),
  )
}

test('Cloudflare resource errors stop retry classification despite HTTP 503', () => {
  const raw = failure('503 {"error_code":1102,"retryable":false,"detail":"resource limit"}')
  const mapped = classifyGatewayFailure(raw)
  assert.equal(mapped.code, 'GATEWAY_RESOURCE_LIMIT')
  assert.match(mapped.message, /recorded task state/)
  assert.equal(raw.code, 'SERVER')
  assert.equal(classifyGatewayFailure(failure('503: {"retryable":false}')).code, 'GATEWAY_NON_RETRYABLE')
  assert.equal(classifyGatewayFailure(failure('503 not JSON')).code, 'SERVER')
  assert.equal(
    classifyGatewayFailure(failure('503: {"error":{"details":{"retry_after_ms":30000}}}')).providerRetryAfterMs,
    30000,
  )
  assert.equal(
    classifyGatewayFailure(failure('503: {"error":{"details":{"retryable":false}}}')).code,
    'GATEWAY_NON_RETRYABLE',
  )
})

test('a cancelled queued request does not dispatch and releases capacity for the next request', async () => {
  const queue = new GatewayQueue(1, 2)
  const release = await queue.acquire(undefined, Date.now() + 10_000)
  const abort = new AbortController()
  const cancelled = queue.acquire(abort.signal, Date.now() + 10_000)
  abort.abort()
  await assert.rejects(cancelled, /cancelled/)
  const following = queue.acquire(undefined, Date.now() + 10_000)
  release()
  release()
  const releaseNext = await following
  releaseNext()
  queue.close()
})

test('expired and overflowing queues fail explicitly and disposal rejects pending work', async () => {
  const queue = new GatewayQueue(1, 1)
  const release = await queue.acquire(undefined, Date.now() + 10_000)
  await assert.rejects(queue.acquire(undefined, Date.now() - 1), (error) => error.code === 'GATEWAY_DEADLINE')
  const waiting = queue.acquire(undefined, Date.now() + 10_000)
  await assert.rejects(queue.acquire(undefined, Date.now() + 10_000), (error) => error.code === 'GATEWAY_QUEUE_FULL')
  queue.close()
  await assert.rejects(waiting, /closed/)
  release()
})

test('queued deadlines expire without borrowing an inference slot', async () => {
  const queue = new GatewayQueue(1, 1)
  const release = await queue.acquire(undefined, Date.now() + 10_000)
  await assert.rejects(queue.acquire(undefined, Date.now() + 20), (error) => error.code === 'GATEWAY_DEADLINE')
  release()
  const next = await queue.acquire(undefined, Date.now() + 10_000)
  next()
  queue.close()
})

test('gateway support is opt-in and invalid operator settings fail before registration', () => {
  registerGatewayReliability({})
  const host = harness()
  assert.throws(() => registerGatewayReliability(host.ctx, { ...config, maxConcurrent: 0 }), /maxConcurrent/)
  assert.throws(
    () => registerGatewayReliability(host.ctx, { ...config, origins: ['https://user:secret@example.com'] }),
    /origins/,
  )
  assert.equal(host.hook('llm/stream'), undefined)
})

test('one step keeps the same header deadline across retries and new steps get fresh state', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  await prepare(host)
  const recorded = []
  const call = async () =>
    collect(
      host.hook('llm/stream')(
        Object.freeze({ provider: 'gateway', model: 'Code-Max', sessionId: sid, messages: [] }),
        async function* () {
          const headers = host.hook('llm-pi-ai/request-headers')(
            { provider: 'gateway', baseURL: 'https://gateway.example.com/v1', sessionId: sid },
            new Headers(),
            () => new Headers(),
          )
          recorded.push(headers)
          yield terminal(failure('503 temporary failure'))
        },
      ),
    )
  await call()
  await call()
  assert.equal(recorded[0].get('x-session-id'), sid)
  assert.equal(recorded[0].get('x-gateway-deadline-ms'), recorded[1].get('x-gateway-deadline-ms'))
  const event = {
    agent: agent(sid),
    provider: 'gateway',
    turn: 1,
    step: 1,
    failure: failure('503 temporary'),
    signal: new AbortController().signal,
  }
  let delegated = 0
  const next = async () => {
    delegated++
    return { kind: 'retry' }
  }
  assert.equal((await host.hook('agent/request-error')(event, next)).kind, 'retry')
  assert.equal(await host.hook('agent/request-error')(event, next), undefined)
  assert.equal(delegated, 1)
  await prepare(host, sid, 2)
  assert.equal((await host.hook('agent/request-error')({ ...event, step: 2 }, next)).kind, 'retry')
  host.dispose()
})

test('resource and partial-output failures never reach the native retry owner', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  await prepare(host)
  const options = { provider: 'gateway', model: 'Code-Max', sessionId: sid, messages: [] }
  const partial = await collect(
    host.hook('llm/stream')(options, async function* () {
      yield { type: 'text-delta', index: 0, text: 'partial response' }
      yield terminal({ code: 'TRANSPORT', message: 'Stream ended without finish_reason' })
    }),
  )
  assert.equal(partial.at(-1).reason.failure.code, 'GATEWAY_PARTIAL_RESPONSE')
  const result = await host.hook('agent/request-error')(
    { agent: agent(sid), provider: 'gateway', turn: 1, step: 1, failure: partial.at(-1).reason.failure },
    async () => {
      throw new Error('unexpected retry')
    },
  )
  assert.equal(result, undefined)
  host.dispose()
})

test('only a pre-output malformed SSE is reclassified as transport failure', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  await prepare(host)
  const chunks = await collect(
    host.hook('llm/stream')(
      { provider: 'gateway', model: 'Code-Max', sessionId: sid, messages: [] },
      async function* () {
        yield terminal({ code: 'PI_AI_ERROR', message: 'Error reading response: malformed server-sent event JSON.' })
      },
    ),
  )
  assert.equal(chunks[0].reason.failure.code, 'TRANSPORT')
  host.dispose()
})

test('routing headers stay scoped to configured origins and separate auxiliary affinity', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  let headers
  await collect(
    host.hook('llm/stream')(
      { provider: 'gateway', model: 'Code-Max', sessionId: sid, purpose: 'auto-review', messages: [] },
      async function* () {
        headers = host.hook('llm-pi-ai/request-headers')(
          { provider: 'gateway', baseURL: 'https://gateway.example.com/v1', sessionId: sid, purpose: 'auto-review' },
          new Headers(),
          () => new Headers(),
        )
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    ),
  )
  assert.equal(headers.get('x-session-id'), `${sid}:auto-review`)
  const other = host.hook('llm-pi-ai/request-headers')(
    { provider: 'gateway', baseURL: 'https://other.example.com/v1', sessionId: sid },
    new Headers(),
    () => new Headers(),
  )
  assert.equal(other.get('x-gateway-deadline-ms'), null)
  assert.equal(other.get('x-session-id'), null)
  host.dispose()
})

test('other providers pass through without queueing or error rewriting', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  const original = terminal(failure('503 {"error_code":1102}'))
  const chunks = await collect(
    host.hook('llm/stream')({ provider: 'other', model: 'model', messages: [] }, async function* () {
      yield original
    }),
  )
  assert.equal(chunks[0], original)
  host.dispose()
})

test('conversation and review inference share one slot without interleaving', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  await prepare(host)
  let finishMain
  let mainStarted
  const started = new Promise((resolve) => {
    mainStarted = resolve
  })
  const gate = new Promise((resolve) => {
    finishMain = resolve
  })
  const order = []
  const main = collect(
    host.hook('llm/stream')(
      { provider: 'gateway', model: 'Code-Max', sessionId: sid, messages: [] },
      async function* () {
        order.push('main-start')
        mainStarted()
        await gate
        order.push('main-end')
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    ),
  )
  await started
  const review = collect(
    host.hook('llm/stream')(
      { provider: 'gateway', model: 'Code-Max', sessionId: sid, purpose: 'auto-review', messages: [] },
      async function* () {
        order.push('review-start')
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    ),
  )
  await Promise.resolve()
  assert.deepEqual(order, ['main-start'])
  finishMain()
  await Promise.all([main, review])
  assert.deepEqual(order, ['main-start', 'main-end', 'review-start'])
  host.dispose()
})

test('Retry-After beyond the remaining step budget does not delegate to a retry policy', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, { ...config, stepBudgetMs: 1000 })
  await prepare(host)
  const result = await host.hook('agent/request-error')(
    {
      agent: agent(sid),
      provider: 'gateway',
      turn: 1,
      step: 1,
      failure: { ...failure('temporary'), providerRetryAfterMs: 30_000 },
    },
    async () => {
      throw new Error('unexpected retry')
    },
  )
  assert.equal(result, undefined)
  host.dispose()
})

test('strict header support refuses successful output from adapters without the public hook', async () => {
  const host = harness()
  const warnings = []
  host.ctx.logger.warn = (message) => warnings.push(message)
  registerGatewayReliability(host.ctx, { ...config, requireHeaderSupport: true })
  await prepare(host)
  const result = await collect(
    host.hook('llm/stream')(
      { provider: 'gateway', model: 'Code-Max', sessionId: sid, messages: [] },
      async function* () {
        yield { type: 'text-delta', index: 0, text: 'unverified output' }
      },
    ),
  )
  assert.equal(result.length, 1)
  assert.equal(result[0].reason.failure.code, 'GATEWAY_HOST_UNSUPPORTED')
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /shared gateway deadlines/)
  host.dispose()
})

test('released pre-step events without model-selection metadata still retain the retry cap', async () => {
  const host = harness()
  registerGatewayReliability(host.ctx, config)
  await host.hook('agent/pre-step')({ agent: agent(sid), turn: 1, step: 1 }, async () => undefined)
  const event = { agent: agent(sid), provider: 'gateway', turn: 1, step: 1, failure: failure('temporary') }
  assert.equal((await host.hook('agent/request-error')(event, async () => ({ kind: 'retry' }))).kind, 'retry')
  assert.equal(
    await host.hook('agent/request-error')(event, async () => {
      throw new Error('unexpected retry')
    }),
    undefined,
  )
  host.dispose()
})

test('the released Cordis waterfall runs the retry guard before its native recovery listener', async () => {
  const ctx = new Context()
  let nativeCalls = 0
  const disposeNative = ctx.on('agent/request-error', async () => {
    nativeCalls++
    return { kind: 'retry' }
  })
  const fiber = ctx.plugin({
    name: 'gateway-reliability-test',
    apply(child) {
      registerGatewayReliability(child, config)
    },
  })
  await fiber.await()
  try {
    await ctx.waterfall('agent/pre-step', { agent: agent(sid), turn: 1, step: 1 }, async () => undefined)
    const event = { agent: agent(sid), turn: 1, step: 1, provider: 'gateway', failure: failure('temporary') }
    assert.equal((await ctx.waterfall('agent/request-error', event, async () => undefined)).kind, 'retry')
    assert.equal(await ctx.waterfall('agent/request-error', event, async () => undefined), undefined)
    assert.equal(nativeCalls, 1)
  } finally {
    await fiber.dispose()
    disposeNative()
  }
})

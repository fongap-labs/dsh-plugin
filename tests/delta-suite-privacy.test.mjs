import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/delta-suite/tsconfig.json')], { stdio: 'pipe' })
const built = relative => pathToFileURL(fixture(`packages/delta-suite/lib/${relative}`)).href
const { createSensitiveRedactor, redactModelRequest, restoreStream } = await import(built('privacy.js'))
const { registerPrivacyBridge } = await import(built('privacy-bridge.js'))
const { shouldBlockPrivacyHttpRequest, installHostPrivacyGuards } = await import(built('host-privacy.js'))

async function* iterable(values) { yield* values }
const collect = async stream => { const out = []; for await (const chunk of stream) out.push(chunk); return out }

function makePrivacyHarness({ deepSeekModelsEnabled = true, redactionEnabled = true } = {}) {
  let listener
  const llm = {
    async resolveModelInfo(_provider, model) {
      return { id: model, inputModalities: ['text'] }
    },
    async listModels(provider) {
      return provider === 'deepseek-official' || provider === 'deepseek-account'
        ? [{ id: 'deepseek-flash', inputModalities: ['text'] }]
        : [{ id: 'text-model', inputModalities: ['text'] }]
    },
    stream() {
      return iterable([{ type: 'finish', reason: { kind: 'stop' } }])
    },
  }
  const originalResolver = llm.resolveModelInfo
  const originalListModels = llm.listModels
  const scope = {
    llm,
    on(event, handler) {
      assert.equal(event, 'llm/stream')
      listener = handler
      return () => { if (listener === handler) listener = undefined }
    },
  }
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ['llm'])
      callback(scope)
    },
  }
  const dispose = registerPrivacyBridge(ctx, { deepSeekModelsEnabled, redactionEnabled })
  return {
    llm,
    originalResolver,
    originalListModels,
    getListener: () => listener,
    dispose,
  }
}

test('Host privacy request classifier rejects encoded, traversed, and alternate path spellings', () => {
  const blocked = [
    ['/api/telemetry', 'GET'],
    ['/api/telemetry/events?source=host', 'POST'],
    ['/api/product-analytics/', 'GET'],
    ['/api/sessionfeedback', 'POST'],
    ['/api/messagefeedback', 'GET'],
    ['/api/otel/v1/traces', 'POST'],
    ['/api/productanalytics/report', 'GET'],
    ['/api/productanalytics/track', 'post'],
    ['/API/%74elemetry', 'GET'],
    ['/api%2Ftelemetry', 'GET'],
    ['/api/%2574elemetry', 'GET'],
    ['/api%25252ftelemetry', 'GET'],
    ['/api\\telemetry', 'GET'],
    ['//api///telemetry', 'GET'],
    ['/api/misc/../telemetry', 'GET'],
    ['/api/%2e%2e/api/telemetry', 'GET'],
    ['/api/telemetry/../health', 'GET'],
    ['https://local.example/api/telemetry/../health?check=1', 'GET'],
    ['https://local.example/api%2Ftelemetry?q=%252f', 'POST'],
    ['/api/telemetry/%ZZ', 'GET'],
    ['/api/telemetry?goto=/api/safe', 'GET'],
  ]
  for (const [url, method] of blocked) {
    assert.equal(shouldBlockPrivacyHttpRequest(url, method), true,
      'privacy path escaped the Host request guard: ' + url)
  }
  const allowed = [
    [undefined, 'GET'], ['', 'POST'], ['api/telemetry', 'GET'],
    ['/api/telemetry-v2', 'POST'], ['/api/otels', 'GET'],
    ['/api/product-analytics-v2', 'POST'], ['/api/messagefeedback-other', 'POST'],
    ['/api/productanalytics', 'POST'], ['/api/productanalytics/track', 'GET'],
    ['/api/productanalytics/report2', 'GET'], ['/api/health', 'GET'],
    ['/api/misc/../health', 'POST'], ['/api/misc/../health/ready', 'GET'],
    ['https://local.example/', 'GET'], ['/api/%ZZ/other', 'GET'],
  ]
  for (const [url, method] of allowed) {
    assert.equal(shouldBlockPrivacyHttpRequest(url, method), false,
      'unrelated Host endpoint should retain native routing: ' + url)
  }
})

test('Host privacy event intercepts encoded telemetry requests and disposes cleanly', () => {
  const listeners = new Map()
  let excluded = false
  let disposedExclusion = false
  const ctx = {
    inject(deps, callback) {
      assert.deepEqual(deps, ['sessionLogDeepSeek'])
      return callback({ sessionLogDeepSeek: {
        registerExclusion(predicate) {
          excluded = predicate({ sessionId: 'sid-1' })
          return () => { disposedExclusion = true }
        },
      } })
    },
    on(event, listener) {
      listeners.set(event, listener)
      return () => { listeners.delete(event) }
    },
  }
  const stop = installHostPrivacyGuards(ctx)
  assert.equal(excluded, true, 'Host session-log requests are excluded via public service')
  const event = listeners.get('connection/request')
  assert.equal(typeof event, 'function')
  let forwarded = 0
  const request = (url, method) => {
    const response = {
      status: null, headers: null, body: '',
      writeHead(status, headers) { this.status = status; this.headers = headers },
      end(body) { this.body = body },
    }
    event({ url, method }, response, () => { forwarded++; return 'next' })
    return response
  }
  const blocked = request('/api/%2574elemetry/events', 'POST')
  assert.equal(blocked.status, 403)
  assert.equal(blocked.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(JSON.parse(blocked.body).error, 'PRIVACY_POLICY_BLOCKED')
  assert.equal(forwarded, 0, 'blocked request must not reach the native handler')
  assert.equal(request('/api/telemetry-v2', 'GET').status, null)
  assert.equal(forwarded, 1, 'an unrelated endpoint must preserve the native handler')
  assert.throws(() => listeners.get('session-telemetry/record')(), /prohibited/)
  stop()
  stop()
  assert.equal(disposedExclusion, true)
  assert.equal(listeners.size, 0, 'Host hooks must be released on plugin unload')
})

test('redaction masks common secrets and private contact data with reversible request-local markers', () => {
  const redactor = createSensitiveRedactor()
  const sampleKey = ['sk', 'ant', 'abcdefghijklmno0123456789'].join('-')
  const pemStart = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')
  const pemEnd = ['-----END', 'PRIVATE KEY-----'].join(' ')
  const source = [
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789',
    'password=short token=short',
    'key ' + sampleKey,
    'contact alice@example.com or +1 (415) 555-2671',
    `${pemStart}\nprivate-material\n${pemEnd}`,
  ].join('\n')
  const masked = redactor.redact(source)
  assert.equal(redactor.hasMatches(), true)
  assert.doesNotMatch(masked, /abcdefghijkl|short|sk-ant-|alice@example|415\) 555|private-material/)
  assert.match(masked, /password=⟦dtd:/)
  assert.equal(redactor.restore(masked), source)
})

test('redaction checksums payment cards and date/checksum-valid resident-ID formats to limit false positives', () => {
  const redactor = createSensitiveRedactor()
  const validCard = '4111 1111 1111 1111'
  const invalidCard = '4111111111111112'
  const validId = '000000200001010013'
  const invalidId = '000000200001010014'
  const source = `${validCard}; ${invalidCard}; ${validId}; ${invalidId}`
  const masked = redactor.redact(source)
  assert.equal(masked.includes(validCard), false)
  assert.equal(masked.includes(validId), false)
  assert.equal(masked.includes(invalidCard), true)
  assert.equal(masked.includes(invalidId), true)
  assert.equal(redactor.restore(masked), source)
})

test('request redaction clones text and tool arguments without altering attachments or source history', () => {
  const image = { type: 'image', attachment: { attachmentId: 'image-1', mediaType: 'image/png' } }
  const file = { type: 'file', attachment: { attachmentId: 'file-1' } }
  const request = {
    provider: 'route', model: 'text',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'password=hidden-value' }, image, file,
      { type: 'tool-call', arguments: '{"token":"another-secret"}' },
    ] }],
    tools: [{ name: 'lookup', description: 'Use token=tool-secret here', parameters: { type: 'object' } }],
  }
  const redactor = createSensitiveRedactor()
  const result = redactModelRequest(request, redactor)
  assert.notEqual(result, request)
  assert.notEqual(result.messages[0], request.messages[0])
  assert.notEqual(result.messages[0].content[0].text, request.messages[0].content[0].text)
  assert.equal(result.messages[0].content[1], image)
  assert.equal(result.messages[0].content[2], file)
  assert.doesNotMatch(JSON.stringify(result), /hidden-value|another-secret|tool-secret/)
  assert.match(request.messages[0].content[0].text, /hidden-value/, 'the durable source request is unchanged')
})

test('stream restoration handles markers split across text and tool argument chunks and preserves chunk metadata', async () => {
  const redactor = createSensitiveRedactor()
  const masked = redactor.redact('token=stream-secret-value')
  const marker = masked.slice('token='.length)
  const textParts = [marker.slice(0, 7), marker.slice(7, 19), marker.slice(19)]
  const chunks = await collect(restoreStream(iterable([
    { type: 'text-delta', index: 2, text: `Value ${textParts[0]}` },
    { type: 'text-delta', index: 2, text: textParts[1] },
    { type: 'text-delta', index: 2, text: textParts[2] },
    { type: 'block-end', index: 2, block: { type: 'text', text: masked.slice('token='.length) } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]), redactor))
  assert.match(chunks.map(chunk => chunk.text ?? '').join(''), /Value stream-secret-value/)
  assert.equal(chunks.find(chunk => chunk.type === 'text-delta')?.index, 2)

  const toolRedactor = createSensitiveRedactor()
  const toolMasked = toolRedactor.redact('api_key=tool-stream-secret')
  const toolMarker = toolMasked.slice('api_key='.length)
  const toolChunks = await collect(restoreStream(iterable([
    { type: 'tool-call-delta', index: 4, id: 'call-4', name: 'inspect', argumentsDelta: toolMarker.slice(0, 12) },
    { type: 'tool-call-delta', index: 4, id: 'call-4', argumentsDelta: toolMarker.slice(12) },
    { type: 'block-end', index: 4, block: { type: 'tool-call', arguments: toolMarker } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]), toolRedactor))
  assert.equal(toolChunks.filter(chunk => chunk.type === 'tool-call-delta').map(chunk => chunk.argumentsDelta).join(''), toolMarker)
  assert.equal(toolChunks.find(chunk => chunk.type === 'tool-call-delta')?.name, 'inspect')
  assert.equal(toolChunks.find(chunk => chunk.type === 'block-end')?.block.arguments, toolMarker)
  assert.doesNotMatch(JSON.stringify(toolChunks), /tool-stream-secret/)
})

test('disabled DeepSeek routes disappear from model catalogs and reject new requests, then restore on unload', async () => {
  const harness = makePrivacyHarness({ deepSeekModelsEnabled: false })
  assert.deepEqual(await harness.llm.listModels('deepseek-official'), [])
  assert.deepEqual(await harness.llm.listModels('deepseek-account'), [])
  assert.deepEqual(await harness.llm.listModels('text-route'), [{ id: 'text-model', inputModalities: ['text'] }])
  await assert.rejects(harness.llm.resolveModelInfo('deepseek-official', 'deepseek-flash'), /disabled/i)
  let nextCalled = false
  const result = await collect(harness.getListener()({ provider: 'deepseek-account', model: 'deepseek-flash', messages: [] }, () => {
    nextCalled = true
    return iterable([{ type: 'finish', reason: { kind: 'stop' } }])
  }))
  assert.equal(nextCalled, false)
  assert.equal(result.at(-1).reason.failure.code, 'DELTA_DEEPSEEK_MODELS_DISABLED')
  harness.dispose()
  assert.equal(harness.llm.resolveModelInfo, harness.originalResolver)
  assert.equal(harness.llm.listModels, harness.originalListModels)
})

test('removing Vision Bridge preserves native model image handling and optional redaction', async () => {
  const plain = makePrivacyHarness({ redactionEnabled: false })
  const image = { type: 'image', attachment: { attachmentId: 'native-image', mediaType: 'image/png' } }
  const request = { provider: 'text-route', model: 'text-model',
    messages: [{ role: 'user', content: [image, { type: 'text', text: 'password=example' }] }] }
  let called = false
  await collect(plain.getListener()(request, () => { called = true; return iterable([{ type: 'finish' }]) }))
  assert.equal(called, true)
  assert.equal(request.messages[0].content[0], image)
  const model = await plain.llm.resolveModelInfo('text-route', 'text-model')
  assert.deepEqual(model.inputModalities, ['text'])
  plain.dispose()
})

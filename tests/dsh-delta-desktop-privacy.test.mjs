import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/dsh-delta-desktop/tsconfig.json')], { stdio: 'pipe' })
const built = relative => pathToFileURL(fixture(`packages/dsh-delta-desktop/lib/${relative}`)).href
const { createSensitiveRedactor, redactModelRequest, restoreStream } = await import(built('privacy.js'))
const { isValidCredentialRef, requestVisionDescription } = await import(built('vision-protocol.js'))
const { registerPrivacyBridge } = await import(built('privacy-bridge.js'))

async function* iterable(values) { yield* values }
const collect = async stream => { const out = []; for await (const chunk of stream) out.push(chunk); return out }

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
  assert.equal(isValidCredentialRef('VISION_API_KEY'), true)
  assert.equal(isValidCredentialRef('vision-key'), false)
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

test('generic vision transport emits OpenAI-compatible, Anthropic Messages, and Ollama payloads', async () => {
  const cases = [
    { protocol: 'openai', baseURL: 'https://vision.example/v1', path: '/v1/chat/completions', inspect: body => body.messages[0].content[1].image_url.url.endsWith('AQID') },
    { protocol: 'anthropic', baseURL: 'https://vision.example', path: '/v1/messages', inspect: body => body.messages[0].content[1].source.data === 'AQID' },
    { protocol: 'ollama', baseURL: 'http://localhost:11434', path: '/api/chat', inspect: body => body.messages[0].images[0] === 'AQID' },
  ]
  for (const item of cases) {
    let captured
    const fetcher = async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) }
      const result = item.protocol === 'anthropic'
        ? { content: [{ type: 'text', text: 'A concise image description.' }] }
        : item.protocol === 'ollama'
          ? { message: { content: 'A concise image description.' } }
          : { choices: [{ message: { content: 'A concise image description.' } }] }
      return new Response(JSON.stringify(result), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    const description = await requestVisionDescription({ protocol: item.protocol, baseURL: item.baseURL, model: 'vision-model', maxTokens: 256 },
      { mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }, 'Describe this', 'test-secret-key', fetcher)
    assert.equal(description, 'A concise image description.')
    assert.ok(captured.url.endsWith(item.path))
    assert.equal(captured.init.redirect, 'error')
    assert.equal(item.inspect(captured.body), true)
    if (item.protocol === 'anthropic') assert.equal(captured.init.headers['x-api-key'], 'test-secret-key')
    else assert.equal(captured.init.headers.authorization, 'Bearer test-secret-key')
  }
})

test('vision transport rejects unsafe URLs, missing models, and oversized images without exposing request data', async () => {
  const image = { mediaType: 'image/jpeg', data: new Uint8Array([1]) }
  const config = { protocol: 'openai', baseURL: 'https://user:password@vision.example/v1', model: 'vision', maxTokens: 128 }
  await assert.rejects(requestVisionDescription(config, image, 'secret prompt', undefined, async () => { throw new Error('must not call') }), /invalid endpoint/)
  await assert.rejects(requestVisionDescription({ ...config, baseURL: 'https://vision.example/v1', model: '' }, image, '', undefined), /missing model/)
  await assert.rejects(requestVisionDescription({ ...config, baseURL: 'https://vision.example/v1' },
    { ...image, data: new Uint8Array(12 * 1024 * 1024 + 1) }, '', undefined), /image size/)
})

function makeVisionHarness({ visionFailure = false, redactionEnabled = true, visionEnabled = true,
  deepSeekModelsEnabled = true } = {}) {
  let listener
  const calls = []
  const warnings = []
  const llm = {
    async resolveModelInfo(_provider, model) { return { id: model, inputModalities: ['text'] } },
    async listModels(provider) {
      if (provider === 'deepseek-official' || provider === 'deepseek-account') {
        return [{ id: 'deepseek-flash', inputModalities: ['text'] }]
      }
      return provider === 'vision' ? [{ id: 'vision-model', inputModalities: ['text', 'image'] }]
        : [{ id: 'text-model', inputModalities: ['text'] }]
    },
    stream(options) {
      calls.push(options)
      return (async function* () {
        if (options.provider === 'vision') {
          if (visionFailure) throw new Error('private endpoint or image data must not appear in the UI')
          yield { type: 'text-delta', index: 0, text: 'A diagram with two boxes.' }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        const targetText = JSON.stringify(options)
        const marker = targetText.match(/⟦dtd:[^⟧]+⟧/)?.[0]
        assert.ok(marker, 'the original secret is masked before text-model egress')
        yield { type: 'text-delta', index: 0, text: 'Restored: ' + marker.slice(0, 8) }
        yield { type: 'text-delta', index: 0, text: marker.slice(8) }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  const originalResolver = llm.resolveModelInfo
  const originalListModels = llm.listModels
  const scope = { llm, on(event, handler) { assert.equal(event, 'llm/stream'); listener = handler } }
  const ctx = { inject(_services, callback) { callback(scope) }, logger: { warn(message) { warnings.push(message) } } }
  const config = { deepSeekModelsEnabled, redactionEnabled, visionEnabled, visionSource: 'existing', visionProvider: 'vision', visionModel: 'vision-model',
    visionProtocol: 'openai', visionBaseURL: '', visionCustomModel: '', visionCredentialRef: '' }
  const dispose = registerPrivacyBridge(ctx, config)
  return { llm, originalResolver, originalListModels, listener, calls, warnings, dispose, getListener: () => listener }
}

test('disabled DeepSeek routes disappear from model catalogs and reject new requests, then restore on unload', async () => {
  const harness = makeVisionHarness({ deepSeekModelsEnabled: false })
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

test('configured bridge advertises image admission temporarily and sends only descriptions to a text model', async () => {
  const harness = makeVisionHarness()
  const originalResolver = harness.originalResolver
  const resolved = await harness.llm.resolveModelInfo('text-route', 'text-model')
  assert.deepEqual(resolved.inputModalities, ['text', 'image'])
  const attachment = { attachmentId: 'img-1', mediaType: 'image/png' }
  const request = { provider: 'text-route', model: 'text-model', messages: [{ role: 'user', content: [
    { type: 'text', text: 'Inspect this; password=ultra-secret-value' },
    { type: 'image', attachment },
  ] }] }
  const emitted = await collect(harness.getListener()(request, () => iterable([{ type: 'finish', reason: { kind: 'stop' } }])))
  const targetRequest = harness.calls.find(call => call.provider === 'text-route')
  assert.ok(targetRequest)
  assert.equal(JSON.stringify(targetRequest).includes('ultra-secret-value'), false)
  assert.equal(targetRequest.messages[0].content.some(block => block.type === 'image'), false)
  assert.match(JSON.stringify(targetRequest), /A diagram with two boxes/)
  assert.match(emitted.map(chunk => chunk.text ?? '').join(''), /Restored: ultra-secret-value/)
  assert.deepEqual(emitted.at(-1).reason, { kind: 'stop' })
  harness.dispose()
  assert.equal(harness.llm.resolveModelInfo, originalResolver, 'the public resolver wrapper is removed on unload')
})

test('vision bridge fails closed without dispatching the original image to the text model', async () => {
  const harness = makeVisionHarness({ visionFailure: true })
  const request = { provider: 'text-route', model: 'text-model', messages: [{ role: 'user', content: [
    { type: 'text', text: 'Describe this picture.' },
    { type: 'image', attachment: { attachmentId: 'img-2', mediaType: 'image/png' } },
  ] }] }
  const emitted = await collect(harness.getListener()(request, () => iterable([{ type: 'finish', reason: { kind: 'stop' } }])))
  assert.equal(harness.calls.some(call => call.provider === 'text-route'), false)
  assert.equal(emitted.at(-1).reason.failure.code, 'DELTA_VISION_BRIDGE_FAILED')
  assert.doesNotMatch(emitted.at(-1).reason.failure.message, /private endpoint|image data/)
  assert.match(harness.warnings[0], /image was withheld/)
  harness.dispose()
})

test('disabled redaction preserves request text and disabled vision bridge refuses unsupported images', async () => {
  const unredacted = makeVisionHarness({ redactionEnabled: false })
  const textRequest = { provider: 'text-route', model: 'text-model', messages: [{ role: 'user', content: [
    { type: 'text', text: 'password=literal-demo-value' },
  ] }] }
  let nextCalled = false
  const next = iterable([{ type: 'text-delta', index: 0, text: 'ok' }, { type: 'finish', reason: { kind: 'stop' } }])
  await collect(unredacted.getListener()(textRequest, () => { nextCalled = true; return next }))
  assert.equal(nextCalled, true)
  assert.equal(unredacted.calls.length, 0)
  assert.equal(textRequest.messages[0].content[0].text, 'password=literal-demo-value')
  unredacted.dispose()

  const noVision = makeVisionHarness({ visionEnabled: false })
  const imageRequest = { provider: 'text-route', model: 'text-model', messages: [{ role: 'user', content: [
    { type: 'image', attachment: { attachmentId: 'img-3', mediaType: 'image/png' } },
  ] }] }
  let imageNextCalled = false
  const result = await collect(noVision.getListener()(imageRequest, () => {
    imageNextCalled = true
    return iterable([{ type: 'finish', reason: { kind: 'stop' } }])
  }))
  assert.equal(imageNextCalled, false)
  assert.equal(noVision.calls.length, 0)
  assert.equal(result.at(-1).reason.failure.code, 'DELTA_VISION_BRIDGE_FAILED')
  noVision.dispose()
})

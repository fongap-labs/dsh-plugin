import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const fixture = relative => fileURLToPath(new URL('../' + relative, import.meta.url))
execFileSync(process.execPath, [fixture('node_modules/typescript/bin/tsc'), '-p',
  fixture('packages/delta-ui/tsconfig.json')], { stdio: 'pipe' })
const built = relative => pathToFileURL(fixture(`packages/delta-ui/lib/${relative}`)).href
const { createSensitiveRedactor, redactModelRequest, restoreStream } = await import(built('privacy.js'))
const { installHostPrivacyGuards } = await import(built('host-privacy.js'))

async function* iterable(values) { yield* values }
const collect = async stream => { const out = []; for await (const chunk of stream) out.push(chunk); return out }


test('Session Log exclusion uses only the public service and never intercepts local routes', async () => {
  let registered = 0
  let released = 0
  let predicate
  const ctx = {
    inject(deps, callback) {
      assert.deepEqual(deps, ['sessionLogDeepSeek'])
      return callback({ sessionLogDeepSeek: {
        registerExclusion(exclude) {
          registered++
          predicate = exclude
          return async () => { released++ }
        },
      } })
    },
    on() { throw new Error('request and telemetry events must not be intercepted') },
  }
  const stop = installHostPrivacyGuards(ctx)
  assert.equal(registered, 1)
  assert.equal(predicate({ sessionId: 'mock-session' }), true)
  stop()
  stop()
  await Promise.resolve()
  assert.equal(released, 1, 'unmount releases the Host-owned registration exactly once')
})

test('missing official Session Log capability leaves ordinary Host behavior untouched', () => {
  assert.doesNotThrow(() => installHostPrivacyGuards({})())
  const stop = installHostPrivacyGuards({ inject: () => { throw new Error('missing optional service') } })
  assert.doesNotThrow(() => stop())
})

test('unsafe model, HTTP response, browser and local feedback interception is retired', () => {
  const source = name => readFileSync(fixture('packages/delta-ui/src/' + name), 'utf8')
  const bridge = source('privacy-bridge.ts')
  const host = source('host-privacy.ts')
  const cookies = source('host-auth-cookies.ts')
  const composition = source('delta-ui-composition.ts')
  assert.doesNotMatch(bridge, /Object\.defineProperty|listModels|resolveModelInfo|llm\.stream\(|ctx\.on\('llm\/stream'/)
  assert.doesNotMatch(host, /connection\/request|session-telemetry\/record|\/api\/messagefeedback/)
  assert.doesNotMatch(cookies, /prependListener|writeHead|setHeader|\.server\b/)
  assert.doesNotMatch(composition, /registerPrivacyBridge|installHostAuthCookiePruner/)
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


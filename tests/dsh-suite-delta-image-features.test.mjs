import { it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { publicView, updateConfig } from '../packages/dsh-suite-delta/lib/host/config.js'
import { mainModelView, resolveMainImageAccount } from '../packages/dsh-suite-delta/lib/host/main-model.js'
import { recognizeImage } from '../packages/dsh-suite-delta/lib/host/vision.js'
import { generateImage } from '../packages/dsh-suite-delta/lib/host/image-gen.js'
import { apply } from '../packages/dsh-suite-delta/lib/index.js'

const ctx = {
  agentDefaultModel: { currentSelection: () => ({ provider: 'custom', model: 'chat' }) },
  llm: {
    listConfigurableProviders: () => [{ provider: 'custom', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'custom'] }],
    resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
  },
  settings: { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { custom: {
    baseURL: 'https://model.example/v1', api: 'openai-completions', apiKeyEnv: 'TEST_IMAGE_KEY',
  } } } }] },
  credentials: { resolve: async ref => { assert.equal(ref, 'TEST_IMAGE_KEY'); return { value: 'test-secret' } } },
}
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJd8AAAAASUVORK5CYII='
function configStore(initial = {}) {
  let config = initial
  const read = fs.readFileSync
  mock.method(fs, 'readFileSync', (path, ...args) => String(path).endsWith('config.json') ? JSON.stringify(config) : read(path, ...args))
  mock.method(fs, 'writeFileSync', (_path, text) => { config = JSON.parse(text) })
  mock.method(fs, 'mkdirSync', () => {})
  mock.method(fs, 'chmodSync', () => {})
  syncBuiltinESMExports()
  return () => config
}
afterEach(() => { mock.restoreAll(); syncBuiltinESMExports() })

it('reuses the selected provider account while returning only safe model metadata', async () => {
  const account = await resolveMainImageAccount(ctx, 'vision')
  assert.equal(account.model, 'vision')
  assert.equal(account.baseURL, 'https://model.example/v1')
  assert.equal(account.apiKey, 'test-secret')
  const view = await mainModelView(ctx)
  assert.equal(view.ready, true)
  assert.equal(view.openAICompatible, true)
  assert.doesNotMatch(JSON.stringify(view), /test-secret|TEST_IMAGE_KEY|model\.example/)
  await assert.rejects(() => resolveMainImageAccount({ ...ctx, credentials: { resolve: async () => undefined } }), /API key is not configured/)
})

it('saves and validates vision parameters and sends them with the chosen model', async () => {
  configStore()
  await updateConfig({ section: 'visionModel', model: 'vision', temperature: 0.2, maxTokens: 1234 })
  assert.deepEqual(publicView().visionOptions, { temperature: 0.2, maxTokens: 1234 })
  await assert.rejects(() => updateConfig({ section: 'visionModel', maxTokens: -1 }), /invalid maxTokens/)
  await assert.rejects(() => updateConfig({ section: 'visionModel', temperature: 3 }), /invalid temperature/)
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://model.example/v1/chat/completions')
    assert.equal(init.headers.authorization, 'Bearer test-secret')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'vision')
    assert.equal(body.temperature, 0.2)
    assert.equal(body.max_tokens, 1234)
    assert.match(body.messages[0].content[1].image_url.url, /^data:image\/png;base64,/)
    return Response.json({ choices: [{ message: { content: 'recognized text' } }] })
  })
  assert.equal(await recognizeImage(Buffer.from(png, 'base64'), 'image/png', ctx), 'recognized text')
  await updateConfig({ section: 'visionModel', temperature: null, maxTokens: null })
  assert.deepEqual(publicView().visionOptions, {})
})

it('generates a downloadable image through the host route and rejects cross-site requests', async () => {
  configStore({ imageGen: { model: 'image-model' } })
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://model.example/v1/images/generations')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'image-model')
    assert.equal(body.prompt, 'a tree')
    assert.equal(body.size, '1536x1024')
    return Response.json({ data: [{ b64_json: png }] })
  })
  const routes = new Map()
  apply({ ...ctx, webServer: { register: route => routes.set(route.path, route) } })
  const invoke = async origin => {
    let code, result
    await routes.get('/dsh-ui-delta/image-generate').handler({
      method: 'POST', headers: { host: 'localhost:3000', origin },
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ prompt: 'a tree', size: '1536x1024' })) },
    }, { writeHead: status => { code = status }, end: body => { result = JSON.parse(body) } })
    return { code, result }
  }
  const response = await invoke('http://localhost:3000')
  assert.equal(response.code, 200)
  assert.equal(response.result.image, `data:image/png;base64,${png}`)
  assert.equal((await invoke('https://foreign.example')).code, 403)
})

it('reports image endpoint failures and rejects non-image responses', async () => {
  configStore()
  mock.method(globalThis, 'fetch', async () => new Response('private error details', { status: 401 }))
  await assert.rejects(() => generateImage('a tree', '1024x1024', ctx), /HTTP 401/)
  mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ b64_json: Buffer.from('<script/>').toString('base64') }] }))
  await assert.rejects(() => generateImage('a tree', '1024x1024', ctx), /unsupported image format/)
})

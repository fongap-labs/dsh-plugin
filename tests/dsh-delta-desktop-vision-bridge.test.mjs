import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  detectImageMime,
  savePastedImage,
  formatEvidenceBlock,
  parseStructuredOutput,
  parseYamlProfile,
  resolveVisionAccount,
  recognizeImage,
  readImageFile,
  registerVisionTools,
  installHostVisionOps,
  DELTA_VISION_PASTE_PATH,
  DELTA_VISION_RECOGNIZE_PATH,
  DELTA_VISION_STATUS_PATH,
  DELTA_VISION_CONFIG_PATH,
} from '../packages/dsh-delta-desktop/lib/host-vision.js'
import { createHostStateStore, defaultVisionSettings } from '../packages/dsh-delta-desktop/lib/host-state.js'

test('Vision Bridge: detectImageMime correctly identifies image formats', () => {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  assert.deepEqual(detectImageMime(pngHeader), { mime: 'image/png', ext: '.png' })

  // JPEG: FF D8 FF
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  assert.deepEqual(detectImageMime(jpegHeader), { mime: 'image/jpeg', ext: '.jpg' })

  // GIF: GIF89a (47 49 46 38 39 61)
  const gifHeader = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  assert.deepEqual(detectImageMime(gifHeader), { mime: 'image/gif', ext: '.gif' })

  // WEBP: RIFF....WEBP
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])
  assert.deepEqual(detectImageMime(webpHeader), { mime: 'image/webp', ext: '.webp' })

  // BMP: BM (42 4D)
  const bmpHeader = new Uint8Array([0x42, 0x4d, 0x00, 0x00])
  assert.deepEqual(detectImageMime(bmpHeader), { mime: 'image/bmp', ext: '.bmp' })

  // SVG: <svg ...
  const svgData = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>')
  assert.deepEqual(detectImageMime(svgData), { mime: 'image/svg+xml', ext: '.svg' })

  // Non-image / too short
  assert.equal(detectImageMime(new Uint8Array([0x01, 0x02])), undefined)
  assert.equal(detectImageMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), undefined) // ZIP
})

test('Vision Bridge: savePastedImage writes safely to private temp directory', async () => {
  const dummyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x01])
  const saved = await savePastedImage(dummyPng, 'image/png', 'test-screenshot.png')

  assert.ok(saved.path)
  assert.ok(saved.path.endsWith('.png'))
  assert.equal(saved.size, dummyPng.length)
  assert.equal(saved.mime, 'image/png')

  // Verify file exists on disk
  const content = await fs.readFile(saved.path)
  assert.equal(content.length, dummyPng.length)

  // Clean up
  await fs.unlink(saved.path).catch(() => {})
})

test('Vision Bridge: parseStructuredOutput and formatEvidenceBlock', () => {
  const sampleLLM = `
[OCR \u5168\u6587\u8f6c\u5199]
const app = express()
app.listen(3000)

[\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784]
\u4ee3\u7801\u7f16\u8f91\u5668\u754c\u9762，\u6df1\u8272\u4e3b\u9898，\u5de6\u4fa7\u884c\u53f7，\u53f3\u4fa7\u6709\u9519\u8bef\u6807\u8bb0

[\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba]
\u7aef\u53e3: 3000
\u5f02\u5e38: \u7aef\u53e3\u5360\u7528 EADDRINUSE
`
  const evidence = parseStructuredOutput(sampleLLM)
  assert.ok(evidence.transcription.includes('const app = express()'))
  assert.ok(evidence.layout.includes('\u4ee3\u7801\u7f16\u8f91\u5668\u754c\u9762'))
  assert.ok(evidence.entities.includes('EADDRINUSE'))
  assert.ok(evidence.summary.length > 0)

  const formatted = formatEvidenceBlock(evidence, 'C:/temp/error.png')
  assert.ok(formatted.includes('[Source: C:/temp/error.png]'))
  assert.ok(formatted.includes('[OCR \u5168\u6587\u8f6c\u5199]'))
  assert.ok(formatted.includes('const app = express()'))
})

test('Vision Bridge: resolveVisionAccount auto-detects multimodal models in DSH', async () => {
  // Mock DSH context with an image-capable Omni model and a text-only Code-Max model
  const mockCtx = {
    get(serviceName) {
      if (serviceName === 'llm' || serviceName === 'models') {
        return {
          models: {
            'fong:Omni': {
              input: ['text', 'image'],
              baseURL: 'https://api.135468.xyz/v1',
              apiKey: 'sk-test-omni-key',
            },
            'fong:Code-Max': {
              input: ['text'],
              baseURL: 'https://api.135468.xyz/v1',
              apiKey: 'sk-test-code-key',
            },
          },
        }
      }
      return undefined
    },
  }

  const defaultSettings = defaultVisionSettings()
  const account = await resolveVisionAccount(mockCtx, defaultSettings)

  assert.ok(account)
  assert.equal(account.provider, 'fong')
  assert.equal(account.model, 'Omni')
  assert.equal(account.baseURL, 'https://api.135468.xyz/v1')
  assert.equal(account.apiKey, 'sk-test-omni-key')
  assert.equal(account.source, 'host-settings')
})

test('Vision Bridge: registerVisionTools exposes read_image and modlens_read_image', async () => {
  const registered = []
  const mockTools = {
    register(def) {
      registered.push(def)
      return () => {
        const idx = registered.indexOf(def)
        if (idx >= 0) registered.splice(idx, 1)
      }
    },
  }
  const mockCtx = { tools: mockTools }

  const resolveAccount = async () => ({
    provider: 'test',
    model: 'mock-vl',
    baseURL: 'http://127.0.0.1:9999/v1',
    apiKey: 'mock-key',
    source: 'mock',
  })

  const unsub = registerVisionTools(mockCtx, resolveAccount)
  assert.equal(registered.length, 2)
  assert.equal(registered[0].name, 'read_image')
  assert.equal(registered[1].name, 'modlens_read_image')
  assert.ok(registered[0].parameters.properties.path)

  unsub()
  assert.equal(registered.length, 0)
})

test('Vision Bridge: installHostVisionOps mounts REST endpoints', async () => {
  const routes = new Map()
  const mockScope = {
    connection: {
      fetch: {
        register(spec) {
          routes.set(spec.path, spec)
          return () => routes.delete(spec.path)
        },
      },
    },
  }
  const mockCtx = {
    inject(deps, cb) {
      return cb(mockScope)
    },
    tools: { register() { return () => {} } },
  }

  const store = createHostStateStore('test-vision-profile')
  const cleanup = installHostVisionOps(mockCtx, store)

  assert.ok(routes.has(DELTA_VISION_PASTE_PATH))
  assert.ok(routes.has(DELTA_VISION_RECOGNIZE_PATH))
  assert.ok(routes.has(DELTA_VISION_STATUS_PATH))
  assert.ok(routes.has(DELTA_VISION_CONFIG_PATH))

  // Test status endpoint
  const statusHandler = routes.get(DELTA_VISION_STATUS_PATH).fetch
  const statusRes = await statusHandler()
  const statusJson = await statusRes.json()
  assert.equal(statusRes.status, 200)
  assert.equal(statusJson.ok, true)
  assert.ok(statusJson.visionSettings)

  // Test config endpoint update
  const configHandler = routes.get(DELTA_VISION_CONFIG_PATH).fetch
  const configRes = await configHandler({
    json: async () => ({ mode: 'instant-transcribe', customModel: 'qwen-vl-max' }),
  })
  const configJson = await configRes.json()
  assert.equal(configRes.status, 200)
  assert.equal(configJson.ok, true)
  assert.equal(configJson.vision.mode, 'instant-transcribe')
  assert.equal(configJson.vision.customModel, 'qwen-vl-max')

  cleanup()
  assert.equal(routes.size, 0)
})

test('Vision Bridge: parseYamlProfile extracts providers and multimodal models', () => {
  const sampleYaml = `
- id: llm-pi-ai
  config:
    providers:
      fong:
        baseURL: https://api.135468.xyz/v1
        apiKeyEnv: FONG_API_KEY
        models:
          - id: Code-Max
            input:
              - text
          - id: Omni
            input:
              - text
              - image
`
  const parsed = parseYamlProfile(sampleYaml)
  assert.equal(parsed.providers.length, 1)
  const prov = parsed.providers[0]
  assert.equal(prov.provider, 'fong')
  assert.equal(prov.baseURL, 'https://api.135468.xyz/v1')
  assert.equal(prov.apiKeyEnv, 'FONG_API_KEY')
  assert.equal(prov.models.length, 2)
  const omni = prov.models.find(m => m.id === 'Omni')
  assert.ok(omni)
  assert.deepEqual(omni.input, ['text', 'image'])
})

test('Vision Bridge: resolveVisionAccount supports openai-compat and gemini settings', async () => {
  const customSettings = {
    enabled: true,
    mode: 'auto',
    provider: 'openai-compat',
    customEndpoint: 'https://my-custom.endpoint.com/v1',
    customApiKey: 'sk-custom-secret',
    customModel: 'qwen-vl-plus',
    autoWrapModels: true,
  }
  const accCustom = await resolveVisionAccount({}, customSettings)
  assert.ok(accCustom)
  assert.equal(accCustom.provider, 'custom')
  assert.equal(accCustom.model, 'qwen-vl-plus')
  assert.equal(accCustom.baseURL, 'https://my-custom.endpoint.com/v1')
  assert.equal(accCustom.apiKey, 'sk-custom-secret')

  const geminiSettings = {
    enabled: true,
    mode: 'auto',
    provider: 'gemini',
    customEndpoint: '',
    customApiKey: 'AIzaSyTestGeminiKey',
    customModel: '',
    autoWrapModels: true,
  }
  const accGemini = await resolveVisionAccount({}, geminiSettings)
  assert.ok(accGemini)
  assert.equal(accGemini.provider, 'gemini')
  assert.equal(accGemini.model, 'gemini-1.5-flash')
  assert.equal(accGemini.baseURL, 'https://generativelanguage.googleapis.com')
  assert.equal(accGemini.apiKey, 'AIzaSyTestGeminiKey')
})

test('Vision Bridge: resolveVisionAccount scans disk cordis.patch.yml to find Omni', async () => {
  // Pass an empty context with no memory models; it should scan the real cordis.patch.yml
  const acc = await resolveVisionAccount({}, { provider: 'auto', enabled: true })
  assert.ok(acc, 'Should detect local model Omni from ~/.dsh/profiles/desktop/cordis.patch.yml')
  assert.equal(acc.provider, 'fong')
  assert.equal(acc.model, 'Omni')
  assert.equal(acc.baseURL, 'https://api.135468.xyz/v1')
  assert.equal(acc.apiKeyEnv, 'FONG_API_KEY')
})

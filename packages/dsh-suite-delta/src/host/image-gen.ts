import { readConfig } from './config.js'
import type { Context } from '@deepseek-ai/cordis'
import { resolveMainImageAccount } from './main-model.js'

const MAX_PROMPT_LENGTH = 4000
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_RESPONSE_BYTES = 18 * 1024 * 1024
const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536'])

const readLimitedText = async (response: Response, limit: number): Promise<string> => {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > limit) {
      await reader.cancel()
      throw new Error('image response is too large')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

const detectMediaType = (bytes: Buffer): string => {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  throw new Error('image provider returned an unsupported image format')
}

/** Generate one image through the OpenAI-compatible account selected in Host settings. */
export const generateImage = async (promptInput: unknown, sizeInput: unknown, ctx: Context): Promise<{ image: string; mediaType: string }> => {
  const prompt = typeof promptInput === 'string' ? promptInput.trim().slice(0, MAX_PROMPT_LENGTH) : ''
  if (!prompt) throw new Error('prompt required')
  const size = typeof sizeInput === 'string' && ALLOWED_SIZES.has(sizeInput) ? sizeInput : '1024x1024'

  const config = readConfig().imageGen || {}
  const account = await resolveMainImageAccount(ctx, config.model)
  const baseURL = account.baseURL
  const model = account.model
  if (!baseURL || !model) throw new Error('main model endpoint and model are required')

  let response: Response
  try {
    response = await fetch(`${baseURL}/images/generations`, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${account.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, n: 1,
        ...(/^(?:gpt-image-|chatgpt-image-)/i.test(model) ? {} : { response_format: 'b64_json' }),
      }),
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('image generation timed out')
    throw new Error('image generation request failed; check the endpoint and network connection')
  }
  if (!response.ok) throw new Error(`image provider returned HTTP ${response.status}`)

  let payload: unknown
  try {
    payload = JSON.parse(await readLimitedText(response, MAX_RESPONSE_BYTES))
  } catch (error) {
    if (error instanceof Error && error.message === 'image response is too large') throw error
    throw new Error('image provider returned an invalid response')
  }
  const encoded = (payload as { data?: Array<{ b64_json?: unknown }> } | null)?.data?.[0]?.b64_json
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('image provider did not return a base64 image')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('generated image has an invalid size')
  const mediaType = detectMediaType(bytes)
  return { image: `data:${mediaType};base64,${bytes.toString('base64')}`, mediaType }
}

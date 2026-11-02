import type { Context } from '@deepseek-ai/cordis'
import { readConfig } from './config.js'
import { resolveMainImageAccount } from './main-model.js'

const responseText = (content: unknown): string => {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.flatMap((part) => {
    if (!part || typeof part !== 'object') return []
    const text = (part as { text?: unknown }).text
    return typeof text === 'string' ? [text] : []
  }).join('\n').trim()
}

/** Read a pasted image with the exact model and account selected in Host settings. */
export const recognizeImage = async (bytes: Buffer, mime: string, ctx: Context): Promise<string> => {
  const config = readConfig()
  const account = await resolveMainImageAccount(ctx, config.visionModel)
  if (account.imageInputSupported === false) {
    throw new Error(`main model ${account.model} does not support image input`)
  }
  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  let response: Response
  try {
    response = await fetch(`${account.baseURL}/chat/completions`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${account.apiKey}` },
      body: JSON.stringify({
        model: account.model,
        ...(config.visionOptions?.temperature === undefined ? {} : { temperature: config.visionOptions.temperature }),
        ...(config.visionOptions?.maxTokens === undefined ? {} : { max_tokens: config.visionOptions.maxTokens }),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '请描述这张图片的内容，并逐字转写其中的文字。只输出识别结果。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(90_000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error('image recognition timed out')
    throw new Error('image recognition request failed; check the main model endpoint and network')
  }
  if (!response.ok) throw new Error(`main model image recognition returned HTTP ${response.status}`)

  let data: unknown
  try { data = await response.json() } catch { throw new Error('main model returned an invalid image recognition response') }
  const content = (data as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content
  const text = responseText(content)
  if (!text) throw new Error('main model returned no image recognition text')
  return text
}

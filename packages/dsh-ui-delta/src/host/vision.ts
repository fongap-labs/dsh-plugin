import { openKey, normalizeProviders, readConfig } from './config.js'

export const recognizeImage = async (bytes: Buffer, mime: string): Promise<string> => {
  const cfg = readConfig().vision || {}
  const providers = normalizeProviders('vision', cfg)
  const active = providers.find((provider) => provider.active) || providers[0]
  if (!active || !active.baseUrl || !active.model) {
    throw new Error('vision model is not configured')
  }
  const key = await openKey('vision', active)

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  const response = await fetch(`${active.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: active.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请描述这张图片的内容，并逐字转写其中的文字。只输出识别结果。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

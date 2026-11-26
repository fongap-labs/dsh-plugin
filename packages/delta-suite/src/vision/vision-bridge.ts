import { createHash } from 'node:crypto'
import type {
  BridgeRuntime, ChatContent, ChatImagePart, ChatMessage, ModelRecord, ProviderClient,
} from '../types.js'

export class VisionBridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisionBridgeError'
  }
}

interface CachedEvidence {
  expiresAt: number
  value: VisionEvidence
}

export interface VisionEvidence {
  schema_version: 1
  input: { kind: 'image'; reference: string }
  observations: Record<string, unknown>
  inferences: readonly unknown[]
  uncertainties: readonly unknown[]
  source: { provider: string; model: string; generatedAt: string }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function imageUrl(part: ChatImagePart): string | undefined {
  return part.image_url?.url ?? part.image?.url
}

function contentText(content: ChatContent): string {
  if (typeof content === 'string') return content
  return content.filter(part => part.type === 'text').map(part => part.text).join('\n')
}

function imageParts(content: ChatContent): ChatImagePart[] {
  if (typeof content === 'string') return []
  return content.filter((part): part is ChatImagePart => part.type === 'image_url' || part.type === 'input_image')
}

function parseEvidence(value: unknown): Record<string, unknown> {
  const record = asRecord(value)
  if (record) return record
  if (typeof value !== 'string') throw new VisionBridgeError('vision model returned no JSON evidence')
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as unknown
  const parsedRecord = asRecord(parsed)
  if (!parsedRecord) throw new VisionBridgeError('vision model returned a JSON value instead of an object')
  return parsedRecord
}

function firstMessageContent(response: { choices: readonly Record<string, unknown>[] }): unknown {
  const message = asRecord(response.choices[0]?.message)
  return message?.content
}

function providerFor(runtime: BridgeRuntime, configuredId: string | undefined): { provider: ProviderClient; model: ModelRecord } | undefined {
  const candidates = configuredId
    ? runtime.models.findByCapability(model => model.providerId === configuredId && model.capabilities.input?.image === true)
    : runtime.models.findByCapability(model => model.capabilities.input?.image === true)
  const model = candidates[0]
  if (!model) return undefined
  const provider = runtime.providers.get(model.providerId)
  return provider ? { provider, model } : undefined
}

/** Converts image inputs to explicit, cached JSON evidence for non-native models. */
export class VisionBridge {
  private readonly cache = new Map<string, CachedEvidence>()

  constructor(private readonly runtime: BridgeRuntime) {}

  private cacheKey(url: string, task: string): string {
    return createHash('sha256').update(url).update('\0').update(task).digest('hex')
  }

  async analyze(url: string, task: string): Promise<VisionEvidence> {
    if (!url) throw new VisionBridgeError('image input is empty')
    const key = this.cacheKey(url, task)
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
    const selected = providerFor(this.runtime, this.runtime.config.vision.primaryProvider)
      ?? (this.runtime.config.vision.allowFallback
        ? providerFor(this.runtime, this.runtime.config.vision.fallbackProvider)
        : undefined)
    if (!selected) {
      throw new VisionBridgeError('no model explicitly verified to support image input is available')
    }
    const prompt = [
      'Analyze the supplied image and return JSON only.',
      'Preserve the user task exactly; do not answer the task.',
      'Separate observations from inferences and list uncertainty instead of guessing.',
      'Use this shape: {"observations":{"ocr":[],"layout":[],"elements":[],"tables":[],"charts":[],"semantics":[],"relations":[]},"inferences":[],"uncertainties":[]}.',
      `User task: ${task || '(not supplied)'}`,
    ].join('\n')
    const response = await selected.provider.chat({
      model: selected.model.upstreamId,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url } },
        ],
      }],
      response_format: { type: 'json_object' },
    })
    const raw = parseEvidence(firstMessageContent(response))
    const evidence: VisionEvidence = {
      schema_version: 1,
      input: { kind: 'image', reference: `sha256:${createHash('sha256').update(url).digest('hex')}` },
      observations: asRecord(raw.observations) ?? raw,
      inferences: Array.isArray(raw.inferences) ? raw.inferences : [],
      uncertainties: Array.isArray(raw.uncertainties) ? raw.uncertainties : [],
      source: { provider: selected.provider.id, model: selected.model.id, generatedAt: new Date().toISOString() },
    }
    this.cache.set(key, { expiresAt: Date.now() + this.runtime.config.vision.cacheTtlMs, value: evidence })
    return evidence
  }

  async prepareMessages(model: ModelRecord | undefined, messages: readonly ChatMessage[]): Promise<readonly ChatMessage[]> {
    const imageMessages = messages.filter(message => imageParts(message.content).length > 0)
    if (imageMessages.length === 0) return messages
    // Only a positive metadata assertion keeps the native multimodal path.
    if (model?.capabilities.input?.image === true) return messages
    const output: ChatMessage[] = []
    for (const message of messages) {
      const parts = imageParts(message.content)
      if (parts.length === 0) {
        output.push(message)
        continue
      }
      const task = contentText(message.content)
      const evidence = []
      for (const part of parts) {
        const url = imageUrl(part)
        if (!url) throw new VisionBridgeError('image input is missing a URL or data URL')
        evidence.push(await this.analyze(url, task))
      }
      output.push({
        ...message,
        content: `${task}\n\n<delta-suite-vision-evidence>\n${JSON.stringify(evidence)}\n</delta-suite-vision-evidence>`,
      })
    }
    return output
  }

  clear(): void { this.cache.clear() }
}

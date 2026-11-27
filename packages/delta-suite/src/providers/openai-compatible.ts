import type {
  BridgeLogger, ChatChunk, ChatRequest, ChatResponse, CredentialResolver,
  ModelCapabilities, ProviderConfig, ProviderKind, ProviderModelMetadata, ProviderClient,
} from '../types.js'

const RETRYABLE_GET_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

export class ProviderRequestError extends Error {
  readonly status?: number
  readonly providerId: string

  constructor(providerId: string, message: string, status?: number) {
    super(message)
    this.name = 'ProviderRequestError'
    this.providerId = providerId
    this.status = status
  }
}

function messageFromUnknown(value: unknown): string {
  if (value instanceof Error) return value.message
  return String(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value.filter((item): item is string => typeof item === 'string')
  return list.length === value.length ? list : undefined
}

function explicitCapabilities(raw: Record<string, unknown>): ModelCapabilities {
  const fromProvider = asRecord(raw.capabilities)
  const capabilities: ModelCapabilities = fromProvider ? { ...fromProvider as ModelCapabilities } : {}
  const modalities = stringList(raw.input_modalities) ?? stringList(raw.modalities)
  if (modalities) {
    capabilities.input = {
      ...(capabilities.input ?? {}),
      text: modalities.includes('text'),
      image: modalities.includes('image'),
      audio: modalities.includes('audio'),
      video: modalities.includes('video'),
      file: modalities.includes('file'),
    }
  }
  const outputModalities = stringList(raw.output_modalities)
  if (outputModalities) {
    capabilities.output = {
      ...(capabilities.output ?? {}),
      text: outputModalities.includes('text'),
      image: outputModalities.includes('image'),
      audio: outputModalities.includes('audio'),
    }
  }
  const contextWindow = finiteNumber(raw.context_window ?? raw.context_length)
  if (contextWindow !== undefined) capabilities.contextWindow = contextWindow
  const maxOutputTokens = finiteNumber(raw.max_output_tokens)
  if (maxOutputTokens !== undefined) capabilities.maxOutputTokens = maxOutputTokens
  return capabilities
}

function providerModel(raw: unknown): ProviderModelMetadata | undefined {
  const record = asRecord(raw)
  if (!record) return undefined
  const id = typeof record?.id === 'string' && record.id.trim() !== '' ? record.id.trim() : undefined
  if (!id) return undefined
  const name = typeof record.name === 'string' ? record.name : undefined
  const ownedBy = typeof record.owned_by === 'string' ? record.owned_by : undefined
  const service = record.service === 'free' || record.service === 'subscription' || record.service === 'paid'
    ? record.service : undefined
  const protocols = stringList(record.protocols)
  return {
    id,
    name,
    ownedBy,
    capabilities: explicitCapabilities(record),
    service,
    protocols,
    contextWindow: finiteNumber(record.context_window ?? record.context_length),
    maxOutputTokens: finiteNumber(record.max_output_tokens),
    ...record,
  }
}

function endpointUrl(endpoint: string, path: string): string {
  return endpoint.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}

function jsonHeaders(config: ProviderConfig, token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(config.headers ?? {}),
  }
  if ((config.auth?.mode ?? 'none') === 'bearer' || config.auth?.mode === 'host-secret') {
    if (token) {
      const name = config.auth?.headerName?.trim() || 'Authorization'
      headers[name] = name.toLowerCase() === 'authorization' ? `Bearer ${token}` : token
    }
  }
  return headers
}

async function responseText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('response exceeds the configured size limit')
  }
  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('response exceeds the configured size limit')
  return text
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}

function providerError(providerId: string, response: Response, text: string): ProviderRequestError {
  const payload = asRecord(parseJson(text))
  const error = asRecord(payload?.error)
  const detail = typeof error?.message === 'string' ? error.message
    : typeof payload?.message === 'string' ? payload.message
      : `upstream request failed with HTTP ${response.status}`
  return new ProviderRequestError(providerId, detail.slice(0, 500), response.status)
}

export interface OpenAICompatibleOptions {
  fetch: typeof globalThis.fetch
  credentials: CredentialResolver
  logger?: BridgeLogger
}

/** Adapter for public OpenAI-compatible endpoints. It never reads credentials itself. */
export class OpenAICompatibleProvider implements ProviderClient {
  readonly id: string
  readonly kind: ProviderKind
  private readonly config: ProviderConfig
  private readonly options: OpenAICompatibleOptions

  constructor(config: ProviderConfig, options: OpenAICompatibleOptions) {
    if (!config.endpoint) throw new Error(`provider ${config.id}: endpoint is required`)
    this.id = config.id
    this.kind = config.kind
    this.config = config
    this.options = options
  }

  private async token(): Promise<string | undefined> {
    const mode = this.config.auth?.mode ?? 'none'
    if (mode === 'none') return undefined
    const reference = this.config.auth?.credentialRef
    if (!reference) throw new ProviderRequestError(this.id, 'credential reference is not configured')
    const value = await this.options.credentials.resolve(reference)
    if (!value) throw new ProviderRequestError(this.id, 'credential is unavailable or expired')
    return value
  }

  private async raw(path: string, init: RequestInit, signal: AbortSignal | undefined, retryGet: boolean): Promise<Response> {
    const token = await this.token()
    const timeout = this.config.timeoutMs ?? 60_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('request timeout'), timeout)
    const onAbort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const headers = { ...jsonHeaders(this.config, token), ...(init.headers ?? {}) }
      for (let attempt = 0; attempt < (retryGet ? 2 : 1); attempt += 1) {
        const response = await this.options.fetch(endpointUrl(this.config.endpoint ?? '', path), {
          ...init,
          headers,
          signal: controller.signal,
        })
        if (!retryGet || !RETRYABLE_GET_STATUSES.has(response.status) || attempt === 1) return response
        const retryAfter = Number(response.headers.get('retry-after') ?? '')
        const delay = Number.isFinite(retryAfter) ? Math.min(Math.max(retryAfter * 1000, 50), 5000) : 250
        await new Promise<void>(resolve => setTimeout(resolve, delay))
      }
      throw new Error('request retry budget exhausted')
    } catch (error) {
      if (error instanceof ProviderRequestError) throw error
      const message = messageFromUnknown(error)
      if (/abort|timeout/i.test(message)) throw new ProviderRequestError(this.id, 'request timed out or was cancelled')
      throw new ProviderRequestError(this.id, message.slice(0, 500))
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async listModels(signal?: AbortSignal): Promise<readonly ProviderModelMetadata[]> {
    const response = await this.raw('/models', { method: 'GET' }, signal, true)
    const text = await responseText(response)
    if (!response.ok) throw providerError(this.id, response, text)
    const payload = asRecord(parseJson(text))
    const data = Array.isArray(payload?.data) ? payload.data : []
    return Object.freeze(data.map(providerModel).filter((model): model is ProviderModelMetadata => model !== undefined))
  }

  async chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const body = { ...(this.config.requestDefaults ?? {}), ...request, stream: false }
    const response = await this.raw('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }, signal, false)
    const text = await responseText(response)
    if (!response.ok) throw providerError(this.id, response, text)
    const payload = asRecord(parseJson(text))
    if (!payload || !Array.isArray(payload.choices)) {
      throw new ProviderRequestError(this.id, 'upstream response is not a chat completion')
    }
    return payload as ChatResponse
  }

  async *streamChat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk> {
    const body = { ...(this.config.requestDefaults ?? {}), ...request, stream: true }
    const response = await this.raw('/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { Accept: 'text/event-stream' },
    }, signal, false)
    if (!response.ok) throw providerError(this.id, response, await responseText(response))
    if (!response.body) throw new ProviderRequestError(this.id, 'upstream did not return a stream body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const item = await reader.read()
        buffer += decoder.decode(item.value ?? new Uint8Array(), { stream: !item.done })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const value = line.slice(5).trim()
          if (value === '[DONE]') return
          const payload = asRecord(parseJson(value))
          if (payload && Array.isArray(payload.choices)) yield payload as ChatChunk
        }
        if (item.done) break
      }
    } finally {
      try { await reader.cancel() } catch { /* stream already closed */ }
    }
  }
}

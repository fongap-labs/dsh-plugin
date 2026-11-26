import type {
  BridgeRuntime, ChatChunk, ChatMessage, ChatRequest, ChatResponse, ModelRecord,
} from '../types.js'

export interface ApiResult {
  status: number
  json?: Record<string, unknown>
  stream?: AsyncIterable<ChatChunk>
}

export class BridgeApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'BridgeApiError'
    this.status = status
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function messages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) throw new BridgeApiError(400, 'messages must be an array')
  return value.map((item, index) => {
    const message = record(item)
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(String(message.role))) {
      throw new BridgeApiError(400, `messages[${index}] has an invalid role`)
    }
    if (typeof message.content !== 'string' && !Array.isArray(message.content)) {
      throw new BridgeApiError(400, `messages[${index}].content is required`)
    }
    return message as unknown as ChatMessage
  })
}

function modelOutput(model: ModelRecord): Record<string, unknown> {
  return {
    id: model.id,
    object: 'model',
    owned_by: model.providerId,
    capabilities: model.capabilities,
    protocols: model.protocols,
  }
}

function responseId(): string {
  return `delta-suite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function errorResult(error: unknown): ApiResult {
  if (error instanceof BridgeApiError) return { status: error.status, json: { error: { message: error.message, type: 'delta_bridge_error' } } }
  const message = error instanceof Error ? error.message : String(error)
  return { status: 502, json: { error: { message: message.slice(0, 500), type: 'upstream_error' } } }
}

/** In-process OpenAI-compatible API. Host adapters decide how and where it is exposed. */
export class OpenAICompatibleApi {
  constructor(private readonly runtime: BridgeRuntime) {}

  listModels(): ApiResult {
    return {
      status: 200,
      json: {
        object: 'list',
        data: this.runtime.models.listModels().map(modelOutput),
      },
    }
  }

  status(): ApiResult {
    const status = this.runtime.status.snapshot()
    return {
      status: 200,
      json: {
        object: 'delta-suite-status',
        updated_at: status.updatedAt,
        modules: status.modules,
        capabilities: status.capabilities,
        permissions: this.runtime.permissions.snapshot(),
        providers: [...this.runtime.providers.values()].map(provider => ({
          id: provider.id,
          kind: provider.kind,
          model_count: this.runtime.models.findByCapability(model => model.providerId === provider.id).length,
        })),
      },
    }
  }

  async chat(body: unknown): Promise<ApiResult> {
    try {
      const input = record(body)
      if (!input || typeof input.model !== 'string' || input.model.trim() === '') {
        throw new BridgeApiError(400, 'model is required')
      }
      const model = this.runtime.models.resolveModel(input.model)
      if (!model) throw new BridgeApiError(404, `model is not discovered or is ambiguous: ${input.model}`)
      if (model.status !== 'available') throw new BridgeApiError(503, `model is unavailable: ${input.model}`)
      if (!this.runtime.permissions.allows('provider-request')) {
        throw new BridgeApiError(403, 'provider requests are disabled by the permission policy')
      }
      const provider = this.runtime.providers.get(model.providerId)
      if (!provider) throw new BridgeApiError(503, `provider is unavailable: ${model.providerId}`)
      const chatMessages = messages(input.messages)
      const request = {
        ...input,
        model: model.upstreamId,
        messages: chatMessages,
      } as unknown as ChatRequest
      const prepared = await this.runtime.pipeline.prepare({ model, request, messages: chatMessages })
      const preparedRequest = { ...request, messages: prepared.messages }
      if (input.stream === true) {
        return {
          status: 200,
          stream: this.wrapStream(provider.streamChat(preparedRequest), input.model),
        }
      }
      const response = await provider.chat(preparedRequest)
      return { status: 200, json: { ...response, model: input.model } }
    } catch (error) {
      return errorResult(error)
    }
  }

  async dispatch(path: string, method: string, body?: unknown): Promise<ApiResult> {
    if (method.toUpperCase() === 'GET' && path.endsWith('/status')) return this.status()
    if (method.toUpperCase() === 'GET' && path.endsWith('/models')) return this.listModels()
    if (method.toUpperCase() === 'POST' && path.endsWith('/chat/completions')) return this.chat(body)
    return { status: 404, json: { error: { message: 'route not found', type: 'not_found' } } }
  }

  private async *wrapStream(stream: AsyncIterable<ChatChunk>, requestedModel: string): AsyncIterable<ChatChunk> {
    for await (const chunk of stream) yield { ...chunk, model: requestedModel }
  }
}

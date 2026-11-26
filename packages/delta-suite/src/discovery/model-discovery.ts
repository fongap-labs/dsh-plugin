import type {
  BridgeRuntime, ModelCapabilities, ModelRecord, ProviderClient, ProviderModelMetadata,
} from '../types.js'

function valueOrUnknown(value: unknown): unknown {
  return value === undefined ? 'unknown' : value
}

function normalizeCapabilities(metadata: ProviderModelMetadata): ModelCapabilities {
  const capabilities = metadata.capabilities ?? {}
  return {
    ...capabilities,
    input: {
      text: 'unknown',
      image: 'unknown',
      audio: 'unknown',
      video: 'unknown',
      file: 'unknown',
      ...(capabilities.input ?? {}),
    },
    output: {
      text: 'unknown',
      image: 'unknown',
      audio: 'unknown',
      structured: 'unknown',
      ...(capabilities.output ?? {}),
    },
    reasoning: capabilities.reasoning ?? 'unknown',
    toolCalling: capabilities.toolCalling ?? 'unknown',
    parallelToolCalling: capabilities.parallelToolCalling ?? 'unknown',
    streaming: capabilities.streaming ?? 'unknown',
    jsonSchema: capabilities.jsonSchema ?? 'unknown',
    contextWindow: valueOrUnknown(capabilities.contextWindow) as number | 'unknown',
    maxOutputTokens: valueOrUnknown(capabilities.maxOutputTokens) as number | 'unknown',
  }
}

export function modelRouteId(providerId: string, upstreamId: string): string {
  return `${providerId}/${upstreamId}`
}

export function toModelRecord(provider: ProviderClient, metadata: ProviderModelMetadata): ModelRecord {
  return {
    id: modelRouteId(provider.id, metadata.id),
    upstreamId: metadata.id,
    name: metadata.name,
    providerId: provider.id,
    providerKind: provider.kind,
    status: 'available',
    service: metadata.service ?? 'unknown',
    protocols: metadata.protocols ?? ['openai-compatible'],
    capabilities: normalizeCapabilities(metadata),
    source: 'metadata',
    updatedAt: Date.now(),
  }
}

export class ModelDiscoveryService {
  private timer: ReturnType<typeof setInterval> | undefined
  private stopped = false

  constructor(private readonly runtime: BridgeRuntime) {}

  async refresh(): Promise<{ refreshed: string[]; failed: string[] }> {
    const refreshed: string[] = []
    const failed: string[] = []
    if (!this.runtime.permissions.allows('provider-request')) {
      this.runtime.logger.warn?.('delta-suite: provider requests are disabled by the permission policy')
      return { refreshed, failed: [...this.runtime.providers.keys()] }
    }
    for (const provider of this.runtime.providers.values()) {
      if (this.stopped) break
      try {
        const models = await provider.listModels()
        this.runtime.models.removeProvider(provider.id)
        for (const metadata of models) this.runtime.models.registerModel(toModelRecord(provider, metadata))
        refreshed.push(provider.id)
        this.runtime.events.emit('models:updated', { providerId: provider.id, count: models.length })
      } catch (error) {
        failed.push(provider.id)
        this.runtime.logger.warn?.(`delta-suite: model discovery failed for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`)
        this.runtime.events.emit('models:failed', { providerId: provider.id })
      }
    }
    return { refreshed, failed }
  }

  start(): () => void {
    this.stopped = false
    if (this.runtime.config.discovery.refreshOnStart && this.runtime.providers.size > 0) void this.refresh()
    this.timer = setInterval(() => void this.refresh(), this.runtime.config.discovery.refreshIntervalMs)
    return () => this.stop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }
}

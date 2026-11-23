import { createSensitiveRedactor, redactModelRequest, restoreStream } from './privacy.js'
import Schema from '@deepseek-ai/schemastery'

/** Retain privacy controls without replacing the Host's image/model capabilities. */
export const Config = Schema.object({
  deepSeekModelsEnabled: Schema.boolean().default(true),
  redactionEnabled: Schema.boolean().default(true),
})

type Volatile<T> = T | { get(): T }
export interface DeltaPrivacyConfig {
  deepSeekModelsEnabled: Volatile<boolean>
  redactionEnabled: Volatile<boolean>
}
type LlmRequest = { provider: string; model: string; messages: readonly unknown[]; [key: string]: any }
type LlmChunk = { type: string; reason?: { kind?: string; failure?: { code?: string; message?: string } }; [key: string]: any }
type ModelInfo = { id: string; inputModalities?: readonly string[] }
type LlmService = {
  listModels?(provider: string, ...args: unknown[]): Promise<readonly ModelInfo[]> | readonly ModelInfo[]
  resolveModelInfo?(provider: string, model: string, signal?: AbortSignal): Promise<Record<string, any>>
  stream(options: LlmRequest): AsyncIterable<LlmChunk>
}
type HostContext = {
  inject(services: string[], callback: (scope: HostContext & { llm?: LlmService }) => void): void
  on(event: 'llm/stream', listener: (options: LlmRequest, next: () => AsyncIterable<LlmChunk>) => AsyncIterable<LlmChunk>): unknown
  logger?: { warn?(message: string): void }
  llm?: LlmService
}

function read<T>(value: Volatile<T>, fallback: T): T {
  try {
    const candidate = value as T & { get?: unknown }
    const current = candidate && typeof candidate === 'object' && typeof candidate.get === 'function'
      ? (candidate.get as () => T)() : value as T
    return current === undefined || current === null ? fallback : current
  } catch { return fallback }
}
function configSnapshot(config: DeltaPrivacyConfig) {
  return {
    deepSeekModelsEnabled: read(config.deepSeekModelsEnabled, true),
    redactionEnabled: read(config.redactionEnabled, true),
  }
}
const DEEPSEEK_PROVIDER_ROUTES = new Set(['deepseek-official', 'deepseek-account'])
function isDeepSeekProvider(provider: string): boolean { return DEEPSEEK_PROVIDER_ROUTES.has(provider) }

export function registerPrivacyBridge(ctx: HostContext, config: DeltaPrivacyConfig): () => void {
  let active = true
  let restoreModels: (() => void) | undefined
  let restoreResolver: (() => void) | undefined
  ctx.inject(['llm'], scope => {
    const llm = scope.llm ?? ctx.llm
    if (!active || !llm || typeof llm.stream !== 'function') return
    const originalList = llm.listModels
    if (typeof originalList === 'function') {
      const descriptor = Object.getOwnPropertyDescriptor(llm, 'listModels')
      const bound = originalList.bind(llm)
      const wrapped = async (provider: string, ...args: unknown[]): Promise<readonly ModelInfo[]> => {
        if (active && !configSnapshot(config).deepSeekModelsEnabled && isDeepSeekProvider(provider)) return []
        return await bound(provider, ...args)
      }
      try {
        Object.defineProperty(llm, 'listModels', {
          configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapped,
        })
        restoreModels = () => {
          if (llm.listModels !== wrapped) return
          if (descriptor) Object.defineProperty(llm, 'listModels', descriptor)
          else Reflect.deleteProperty(llm, 'listModels')
        }
      } catch { scope.logger?.warn?.('delta-suite: model policy adapter unavailable') }
    }
    const resolver = llm.resolveModelInfo
    if (typeof resolver === 'function') {
      const descriptor = Object.getOwnPropertyDescriptor(llm, 'resolveModelInfo')
      const bound = resolver.bind(llm)
      const wrapped = async (provider: string, model: string, signal?: AbortSignal): Promise<Record<string, any>> => {
        if (active && !configSnapshot(config).deepSeekModelsEnabled && isDeepSeekProvider(provider)) {
          throw new Error('DeepSeek model routes are disabled in Delta settings.')
        }
        return bound(provider, model, signal)
      }
      try {
        Object.defineProperty(llm, 'resolveModelInfo', {
          configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapped,
        })
        restoreResolver = () => {
          if (llm.resolveModelInfo !== wrapped) return
          if (descriptor) Object.defineProperty(llm, 'resolveModelInfo', descriptor)
          else Reflect.deleteProperty(llm, 'resolveModelInfo')
        }
      } catch { scope.logger?.warn?.('delta-suite: model policy resolver unavailable') }
    }
    scope.on('llm/stream', async function* (options, next) {
      const settings = configSnapshot(config)
      if (active && !settings.deepSeekModelsEnabled && isDeepSeekProvider(options.provider)) {
        yield { type: 'finish', reason: { kind: 'error',
          failure: { code: 'DELTA_DEEPSEEK_MODELS_DISABLED', message: 'DeepSeek model routes are disabled in Delta settings.' } } }
        return
      }
      if (!active || !settings.redactionEnabled) { yield* next(); return }
      const redactor = createSensitiveRedactor()
      const masked = redactModelRequest(options as Parameters<typeof redactModelRequest>[0], redactor)
      if (!redactor.hasMatches()) { yield* next(); return }
      // The original image blocks remain Host-owned, unchanged; no vision bridge.
      yield* restoreStream(llm.stream(masked as LlmRequest), redactor)
    })
  })
  return () => { active = false; restoreModels?.(); restoreResolver?.() }
}

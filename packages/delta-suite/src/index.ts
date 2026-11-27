import type { Context } from '@deepseek-ai/cordis'
import { Config, normalizeConfig } from './config.js'
import { ModelDiscoveryService } from './discovery/model-discovery.js'
import { createHostAdapter } from './host.js'
import { OpenAICompatibleApi } from './api/openai-compatible-api.js'
import { ModuleManager } from './core/lifecycle.js'
import { createCapabilityRegistry } from './core/capability-registry.js'
import { ModelCapabilityPipeline } from './core/pipeline.js'
import { createPermissionPolicy } from './core/permissions.js'
import { createEventBus, createModelRegistry, createRuntimeStatusRegistry } from './core/registry.js'
import { createProvider } from './providers/provider-factory.js'
import { ModelInstructionCapability } from './behavior/model-instructions.js'
import { VisionCapability } from './vision/vision-capability.js'
import type {
  BridgeConfig, BridgeHostContext, BridgeModule, BridgeRuntime, ProviderKind, RequestPipeline,
} from './types.js'

export { Config }
export { ModuleManager } from './core/lifecycle.js'
export { ModelCapabilityPipeline } from './core/pipeline.js'
export { ModelInstructionCapability } from './behavior/model-instructions.js'
export { VisionCapability } from './vision/vision-capability.js'
export { OpenAICompatibleProvider, ProviderRequestError } from './providers/openai-compatible.js'
export { OpenAICompatibleApi, BridgeApiError } from './api/openai-compatible-api.js'
export { VisionBridge, VisionBridgeError } from './vision/vision-bridge.js'
export { normalizeConfig } from './config.js'
export type * from './types.js'

export const name = '@fongap-labs/delta-suite'
export const inject: string[] = []

function moduleEnabled(kind: ProviderKind, config: BridgeRuntime['config']): boolean {
  return kind === 'duckai' ? config.modules.duckai
    : kind === 'chatgpt' ? config.modules.chatgpt
      : config.modules.customApi
}

function providerModule(kind: ProviderKind): BridgeModule {
  const id = kind === 'custom-api' ? 'custom-api' : kind
  return {
    id,
    version: '1',
    description: `User-authorized ${kind} model provider`,
    dependencies: ['core'],
    capabilities: ['model-provider', 'chat-completions', 'streaming'],
    start({ runtime }) {
      if (!moduleEnabled(kind, runtime.config)) return
      for (const config of runtime.config.providers) {
        if (config.kind !== kind || config.enabled === false) continue
        const provider = createProvider(config, runtime)
        runtime.providers.set(provider.id, provider)
      }
      return () => {
        for (const config of runtime.config.providers) {
          if (config.kind === kind) {
            runtime.providers.delete(config.id)
            runtime.models.removeProvider(config.id)
          }
        }
      }
    },
  }
}

export function createModules(): readonly BridgeModule[] {
  return [
    {
      id: 'core',
      version: '1',
      description: 'Stable registry, events, and runtime contracts',
      capabilities: ['module-registry', 'model-registry', 'capability-registry', 'permissions', 'runtime-status', 'events'],
      start() {},
    },
    providerModule('duckai'),
    providerModule('chatgpt'),
    providerModule('custom-api'),
    {
      id: 'model-discovery',
      version: '1',
      description: 'Dynamic provider model catalog',
      dependencies: ['core'],
      optionalDependencies: ['duckai', 'chatgpt', 'custom-api'],
      capabilities: ['model-discovery'],
      start({ runtime }) {
        if (!runtime.config.modules.modelDiscovery) return
        const service = new ModelDiscoveryService(runtime)
        return service.start()
      },
    },
    {
      id: 'capability-probe',
      version: '1',
      description: 'Explicitly opted-in, controlled capability verification',
      dependencies: ['core'],
      optionalDependencies: ['model-discovery'],
      capabilities: ['capability-probe'],
      start({ runtime }) {
        if (!runtime.config.modules.capabilityProbe) return
        runtime.logger.info?.('delta-suite: capability probing is opt-in and metadata-first')
      },
    },
    {
      id: 'behavior-enhancement',
      version: '1',
      description: 'Optional provider-independent model instruction guidance',
      dependencies: ['core'],
      capabilities: ['instruction-following', 'behavior-enhancement'],
      start({ runtime }) {
        if (!runtime.config.modules.behaviorEnhancement || !runtime.config.behavior.enabled) return
        const release = runtime.capabilities.register(new ModelInstructionCapability(
          runtime.config.behavior.systemPrompt,
          runtime.config.behavior.instructionMode,
        ))
        runtime.status.updateCapabilities(runtime.capabilities.snapshots())
        return () => {
          release()
          runtime.status.updateCapabilities(runtime.capabilities.snapshots())
        }
      },
    },
    {
      id: 'vision',
      version: '1',
      description: 'Cached structured visual evidence for non-native paths',
      dependencies: ['core'],
      optionalDependencies: ['model-discovery'],
      capabilities: ['vision-evidence', 'image-cache'],
      start({ runtime }) {
        if (!runtime.config.modules.vision) return
        const release = runtime.capabilities.register(new VisionCapability(runtime))
        runtime.status.updateCapabilities(runtime.capabilities.snapshots())
        return () => {
          release()
          runtime.status.updateCapabilities(runtime.capabilities.snapshots())
        }
      },
    },
    {
      id: 'api-service',
      version: '1',
      description: 'Local-by-default OpenAI-compatible API routes',
      dependencies: ['core'],
      optionalDependencies: ['model-discovery'],
      capabilities: ['openai-compatible-api', 'local-only-default'],
      start({ runtime }) {
        if (!runtime.config.modules.apiService || !runtime.config.api.enabled || !runtime.permissions.allows('local-api') || !runtime.host?.registerApi) return
        const api = new OpenAICompatibleApi(runtime)
        return runtime.host.registerApi(api)
      },
    },
  ]
}

export function createRuntime(config: BridgeConfig | undefined, host: BridgeHostContext = {}): BridgeRuntime {
  const normalized = normalizeConfig(config)
  const adapter = createHostAdapter(host)
  const events = createEventBus()
  const status = createRuntimeStatusRegistry()
  const runtime = {
    config: normalized,
    models: createModelRegistry(adapter.logger),
    providers: new Map(),
    capabilities: createCapabilityRegistry(events),
    pipeline: undefined as unknown as RequestPipeline,
    permissions: createPermissionPolicy(normalized),
    status,
    logger: adapter.logger,
    fetch: adapter.fetch,
    credentials: adapter.credentials,
    events,
    host: { registerApi: api => adapter.registerApi(api as OpenAICompatibleApi, normalized.api.pathPrefix) },
  } as Omit<BridgeRuntime, 'pipeline'> & { pipeline: RequestPipeline }
  runtime.pipeline = new ModelCapabilityPipeline(runtime as BridgeRuntime)
  return runtime as BridgeRuntime
}

export async function start(config: BridgeConfig | undefined, host: BridgeHostContext = {}) {
  const runtime = createRuntime(config, host)
  const manager = new ModuleManager()
  for (const module of createModules()) manager.register(module)
  if (runtime.config.enabled) await manager.startAll(runtime)
  return {
    runtime,
    manager,
    dispose() { manager.stopAll(runtime); runtime.events.clear() },
  }
}

export function apply(ctx: Context, config?: BridgeConfig): () => void {
  const runtime = createRuntime(config, ctx as unknown as BridgeHostContext)
  const manager = new ModuleManager()
  for (const module of createModules()) manager.register(module)
  let isClosed = false
  if (runtime.config.enabled) {
    void manager.startAll(runtime).catch(error => runtime.logger.error?.(`delta-suite: startup failed: ${String(error)}`))
  }
  const dispose = () => {
    if (isClosed) return
    isClosed = true
    manager.stopAll(runtime)
    runtime.events.clear()
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'delta-suite:plugin-disposal')
  return dispose
}

import type {
  BridgeEventBus, BridgeLogger, ModelRecord, ModelRegistry, RuntimeStatus, RuntimeStatusRegistry,
  ModuleSnapshot, CapabilitySnapshot,
} from '../types.js'

export function createEventBus(): BridgeEventBus {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  return {
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        try { listener(payload) } catch { /* listener failures are isolated */ }
      }
    },
    on(event, listener) {
      let bucket = listeners.get(event)
      if (!bucket) {
        bucket = new Set()
        listeners.set(event, bucket)
      }
      bucket.add(listener)
      return () => {
        bucket?.delete(listener)
        if (bucket?.size === 0) listeners.delete(event)
      }
    },
    clear() { listeners.clear() },
  }
}

export function createModelRegistry(logger: BridgeLogger): ModelRegistry {
  const models = new Map<string, ModelRecord>()
  return {
    registerModel(model) {
      const previous = models.get(model.id)
      models.set(model.id, Object.freeze({ ...model, capabilities: { ...model.capabilities } }))
      return () => {
        if (models.get(model.id)?.updatedAt === model.updatedAt) {
          if (previous) models.set(model.id, previous)
          else models.delete(model.id)
        }
      }
    },
    removeProvider(providerId) {
      for (const [id, model] of models) {
        if (model.providerId === providerId) models.delete(id)
      }
    },
    listModels() { return Object.freeze([...models.values()]) },
    resolveModel(id) {
      const exact = models.get(id)
      if (exact) return exact
      const candidates = [...models.values()].filter(model => model.upstreamId === id)
      if (candidates.length === 1) return candidates[0]
      if (candidates.length > 1) logger.warn?.(`delta-suite: ambiguous model id ${id}; use provider/model`)
      return undefined
    },
    findByCapability(predicate) { return Object.freeze([...models.values()].filter(predicate)) },
  }
}

export function createRuntimeStatusRegistry(): RuntimeStatusRegistry {
  let modules: readonly ModuleSnapshot[] = Object.freeze([])
  let capabilities: readonly CapabilitySnapshot[] = Object.freeze([])
  let updatedAt = Date.now()
  const touch = () => { updatedAt = Date.now() }
  return {
    updateModules(snapshots) { modules = Object.freeze([...snapshots]); touch() },
    updateCapabilities(snapshots) { capabilities = Object.freeze([...snapshots]); touch() },
    snapshot(): RuntimeStatus {
      return {
        modules: Object.freeze([...modules]),
        capabilities: Object.freeze([...capabilities]),
        updatedAt,
      }
    },
  }
}

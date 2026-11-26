import type {
  BridgeEventBus, CapabilityModule, CapabilityRegistry, CapabilitySnapshot,
} from '../types.js'

function snapshot(capability: CapabilityModule, state: CapabilitySnapshot['state'], error?: string): CapabilitySnapshot {
  return {
    id: capability.id,
    version: capability.version,
    description: capability.description,
    inputModalities: capability.inputModalities,
    priority: capability.priority ?? 100,
    state,
    ...(error ? { error } : {}),
  }
}

/** Core-owned registry; capabilities never need to import a provider implementation. */
export function createCapabilityRegistry(events: BridgeEventBus): CapabilityRegistry {
  const entries = new Map<string, { capability: CapabilityModule; state: CapabilitySnapshot['state']; error?: string }>()
  return {
    register(capability) {
      if (entries.has(capability.id)) throw new Error(`duplicate capability id: ${capability.id}`)
      for (const dependency of capability.dependencies ?? []) {
        if (!entries.has(dependency)) throw new Error(`capability dependency missing: ${dependency}`)
      }
      entries.set(capability.id, { capability, state: 'running' })
      events.emit('capability:registered', { id: capability.id })
      return () => {
        const entry = entries.get(capability.id)
        if (!entry) return
        try { void entry.capability.dispose?.() } catch { /* capability cleanup is isolated */ }
        entries.delete(capability.id)
        events.emit('capability:unregistered', { id: capability.id })
      }
    },
    unregister(id) {
      const entry = entries.get(id)
      if (!entry) return
      try { void entry.capability.dispose?.() } catch { /* capability cleanup is isolated */ }
      entries.delete(id)
      events.emit('capability:unregistered', { id })
    },
    get(id) { return entries.get(id)?.capability },
    list() {
      return Object.freeze([...entries.values()]
        .filter(entry => entry.state === 'registered' || entry.state === 'running')
        .sort((left, right) => (left.capability.priority ?? 100) - (right.capability.priority ?? 100))
        .map(entry => entry.capability))
    },
    snapshots() {
      return Object.freeze([...entries.values()].map(entry => snapshot(entry.capability, entry.state, entry.error)))
    },
  }
}

import type {
  BridgeModule, BridgeRuntime, ModuleContext, ModuleId, ModuleSnapshot, ModuleState,
} from '../types.js'

interface RecordState {
  module: BridgeModule
  state: ModuleState
  release?: () => void
  error?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Dependency-aware lifecycle with isolated failures and reverse-order cleanup. */
export class ModuleManager {
  private readonly modules = new Map<ModuleId, RecordState>()
  private closed = false

  register(module: BridgeModule): () => void {
    if (this.closed) throw new Error('module manager is closed')
    if (this.modules.has(module.id)) throw new Error(`duplicate module id: ${module.id}`)
    this.modules.set(module.id, { module, state: 'registered' })
    return () => {
      const entry = this.modules.get(module.id)
      if (!entry || entry.state === 'running' || entry.state === 'starting') return
      this.modules.delete(module.id)
    }
  }

  snapshots(): readonly ModuleSnapshot[] {
    return Object.freeze([...this.modules.values()].map(entry => ({
      id: entry.module.id,
      version: entry.module.version,
      state: entry.state,
      error: entry.error,
      capabilities: entry.module.capabilities,
    })))
  }

  async startAll(runtime: BridgeRuntime): Promise<readonly ModuleSnapshot[]> {
    if (this.closed) return this.snapshots()
    const order = this.resolveOrder()
    runtime.status.updateModules(this.snapshots())
    for (const id of order) {
      await this.startOne(id, runtime)
      runtime.status.updateModules(this.snapshots())
    }
    return this.snapshots()
  }

  private resolveOrder(): ModuleId[] {
    const visiting = new Set<ModuleId>()
    const visited = new Set<ModuleId>()
    const result: ModuleId[] = []
    const visit = (id: ModuleId) => {
      if (visited.has(id)) return
      if (visiting.has(id)) throw new Error(`module dependency cycle at ${id}`)
      const entry = this.modules.get(id)
      if (!entry) throw new Error(`module dependency missing: ${id}`)
      visiting.add(id)
      for (const dependency of entry.module.dependencies ?? []) visit(dependency)
      for (const dependency of entry.module.optionalDependencies ?? []) {
        if (this.modules.has(dependency)) visit(dependency)
      }
      visiting.delete(id)
      visited.add(id)
      result.push(id)
    }
    for (const id of this.modules.keys()) visit(id)
    return result
  }

  private async startOne(id: ModuleId, runtime: BridgeRuntime): Promise<void> {
    const entry = this.modules.get(id)
    if (!entry || entry.state === 'running' || entry.state === 'degraded') return
    for (const dependency of entry.module.dependencies ?? []) {
      const parent = this.modules.get(dependency)
      if (!parent || (parent.state !== 'running' && parent.state !== 'degraded')) {
        entry.state = 'failed'
        entry.error = `required dependency unavailable: ${dependency}`
        runtime.logger.warn?.(`delta-suite: ${id} disabled: ${entry.error}`)
        return
      }
    }
    entry.state = 'starting'
    try {
      const release = await entry.module.start({ runtime } satisfies ModuleContext)
      entry.release = typeof release === 'function' ? release : undefined
      entry.state = 'running'
      runtime.events.emit('module:started', { id })
    } catch (error) {
      entry.state = 'failed'
      entry.error = errorMessage(error)
      runtime.logger.error?.(`delta-suite: module ${id} failed: ${entry.error}`)
      runtime.events.emit('module:failed', { id, error: entry.error })
    }
  }

  stopAll(runtime: BridgeRuntime): void {
    if (this.closed) return
    this.closed = true
    const entries = [...this.modules.values()].reverse()
    for (const entry of entries) {
      try { entry.release?.() } catch (error) {
        runtime.logger.warn?.(`delta-suite: module ${entry.module.id} cleanup failed: ${errorMessage(error)}`)
      }
      entry.release = undefined
      entry.state = 'stopped'
    }
    runtime.status.updateModules(this.snapshots())
    runtime.events.emit('modules:stopped')
  }
}

/**
 * Delta Desktop feature registry.
 *
 * Feature ownership follows MECE domain boundaries. A feature registers once;
 * Host capabilities are prerequisites, never granted by a UI declaration.
 * Privileged operations remain governed by the Host and permission policy.
 */
export const DELTA_FEATURE_OWNERS = [
  'shell', 'sessions', 'discovery', 'context', 'security', 'integrations',
] as const

export const DELTA_EXTENSION_SURFACES = [
  'left-sidebar', 'right-sidebar', 'settings',
] as const

export type DeltaFeatureOwner = typeof DELTA_FEATURE_OWNERS[number]
export type DeltaExtensionSurface = typeof DELTA_EXTENSION_SURFACES[number]

export interface DeltaDesktopFeature<C> {
  /** Globally unique stable ID. */
  id: string
  /** Sole domain accountable for the behavior. */
  owner: DeltaFeatureOwner
  /** UI declaration only. Does not grant Host permissions. */
  surfaces?: readonly DeltaExtensionSurface[]
  /** Versioned Host capabilities required before activation. */
  requires?: readonly string[]
  /** Optional features may fail or be absent without preventing Shell startup. */
  optional?: boolean
  /** Return cleanup synchronously; arbitrary async setup cannot escape the mount gate. */
  install(context: C): () => void
}

export interface DeltaFeatureError {
  readonly id: string
  readonly error: unknown
}

export interface DeltaFeatureRuntime {
  readonly mounted: readonly string[]
  readonly skipped: readonly string[]
  dispose(): void
}

export class DeltaFeatureRegistry<C> {
  private readonly definitions = new Map<string, DeltaDesktopFeature<C>>()
  private mounted = false
  private disposed = false
  private readonly cleanups: Array<{ id: string; cleanup: () => void }> = []

  register(feature: DeltaDesktopFeature<C>): void {
    if (this.mounted || this.disposed) throw new Error('Delta feature registry is already mounted or disposed')
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(feature.id)) {
      throw new Error('Invalid Delta feature ID: ' + feature.id)
    }
    if (!DELTA_FEATURE_OWNERS.includes(feature.owner)) {
      throw new Error('Unknown Delta feature owner: ' + feature.owner)
    }
    if (feature.surfaces?.some(zone => !DELTA_EXTENSION_SURFACES.includes(zone))) {
      throw new Error('Unapproved Delta feature surface: ' + feature.id)
    }
    if (new Set(feature.surfaces).size !== (feature.surfaces?.length ?? 0)) {
      throw new Error('Duplicate Delta feature surface: ' + feature.id)
    }
    if (this.definitions.has(feature.id)) throw new Error('Duplicate Delta feature: ' + feature.id)
    this.definitions.set(feature.id, feature)
  }

  mount(
    context: C,
    capabilities: ReadonlySet<string>,
    onOptionalError?: (error: DeltaFeatureError) => void,
  ): DeltaFeatureRuntime {
    if (this.mounted || this.disposed) throw new Error('Delta features can only be mounted once')
    this.mounted = true
    const mounted: string[] = []
    const skipped: string[] = []
    try {
      for (const feature of this.definitions.values()) {
        const missing = (feature.requires ?? []).filter(capability => !capabilities.has(capability))
        if (missing.length) {
          if (!feature.optional) throw new Error('Missing required Host capabilities for ' + feature.id + ': ' + missing.join(', '))
          skipped.push(feature.id)
          continue
        }
        try {
          const cleanup = feature.install(context)
          if (typeof cleanup !== 'function') throw new Error('Feature must return a cleanup function: ' + feature.id)
          this.cleanups.push({ id: feature.id, cleanup })
          mounted.push(feature.id)
        } catch (error) {
          if (!feature.optional) throw error
          skipped.push(feature.id)
          try { onOptionalError?.({ id: feature.id, error }) } catch { /* diagnostics never alter boot */ }
        }
      }
    } catch (error) {
      this.dispose()
      throw error
    }
    return Object.freeze({
      mounted: Object.freeze(mounted),
      skipped: Object.freeze(skipped),
      dispose: () => this.dispose(),
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (let index = this.cleanups.length - 1; index >= 0; index--) {
      try { this.cleanups[index].cleanup() } catch { /* continue cleanup of sibling domains */ }
    }
    this.cleanups.length = 0
  }
}

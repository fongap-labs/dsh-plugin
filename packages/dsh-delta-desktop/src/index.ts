/**
 * Delta Desktop Host half. This is a Cordis plugin, NOT an Electron application.
 * The Host already owns the Session, policy, settings and transport services.
 */
export const name = '@fongap-labs/dsh-delta-desktop'
export const inject: readonly string[] = []
export function apply(): void {
  // The browser half provides the experimental Root Shell; no second Host.
}

// Copy from the independently maintained Delta Suite implementation.
// Shared, tested lifecycle design; deliberately not coupled to Suite activation.
export {
  DeltaFeatureRegistry,
  DELTA_FEATURE_OWNERS,
  DELTA_EXTENSION_SURFACES,
} from './kernel/feature-lifecycle-registry.js'
export type {
  DeltaSuiteFeature,
  DeltaFeatureOwner,
  DeltaExtensionSurface,
} from './kernel/feature-lifecycle-registry.js'

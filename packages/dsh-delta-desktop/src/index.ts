/**
 * DSH host entry. UI integration is client-owned through documented slots.
 * Do not monkey-patch Host workspaceRegistry or override Host business services.
 */
export const name = '@fongap-labs/dsh-delta-desktop'
export const inject: string[] = []
export {
  DELTA_HOST_CONTRACT_VERSION,
  DELTA_HOST_CAPABILITIES,
  negotiateHostCapabilities,
} from './host-capabilities.js'
export type { DeltaCapabilityManifest, DeltaHostCapability, DeltaCapabilityReport } from './host-capabilities.js'

export function apply(): () => void {
  // Until DSH publishes a versioned before-delete hook, deletion stays Host owned.
  return () => {}
}

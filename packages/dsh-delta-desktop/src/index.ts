import { registerCompactionStatusProjection } from './context-projection.js'
import { registerPrivacyBridge, type DeltaPrivacyConfig } from './privacy-bridge.js'

/**
 * DSH host entry. UI integration is client-owned through documented slots.
 * Privacy bridge owns its narrowly scoped, reversible LLM capability adapter.
 */
export const name = '@fongap-labs/dsh-delta-desktop'
export const inject: string[] = []
export { Config } from './privacy-bridge.js'
export {
  DELTA_HOST_CONTRACT_VERSION,
  DELTA_HOST_CAPABILITIES,
  negotiateHostCapabilities,
} from './host-capabilities.js'
export type { DeltaCapabilityManifest, DeltaHostCapability, DeltaCapabilityReport } from './host-capabilities.js'

export function apply(ctx: Parameters<typeof registerCompactionStatusProjection>[0] & Parameters<typeof registerPrivacyBridge>[0], config: DeltaPrivacyConfig): () => void {
  // Until DSH publishes a versioned before-delete hook, deletion stays Host owned.
  const disposeProjection = registerCompactionStatusProjection(ctx)
  const disposePrivacy = registerPrivacyBridge(ctx, config)
  return () => { disposePrivacy(); disposeProjection() }
}

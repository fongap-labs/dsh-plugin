/**
 * Delta Host capability contract v1.
 * Only explicit, versioned Host declarations grant an integration capability.
 * Host version strings, private DOM and method names are never evidence.
 */
export const DELTA_HOST_CONTRACT_VERSION = 1 as const

export const DELTA_HOST_CAPABILITIES = [
  'theme.tokens',
  'settings.section',
  'sidebar.brand',
  'sidebar.compose',
  'workspace.initial-collapse',
  'workspace.before-delete',
  'session.row',
  'conversation.status',
  'conversation.transport',
  'conversation.stream',
  'conversation.stop',
  'approval.request',
] as const

export type DeltaHostCapability = typeof DELTA_HOST_CAPABILITIES[number]
export type DeltaCapabilityManifest = Readonly<{
  contractVersion: number
  capabilities: readonly string[]
}>
export type DeltaCapabilityReport = Readonly<{
  compatible: boolean
  available: readonly DeltaHostCapability[]
  missing: readonly DeltaHostCapability[]
  reason: 'ready' | 'missing-manifest' | 'unsupported-contract' | 'missing-capabilities'
}>

export function negotiateHostCapabilities(
  manifest: DeltaCapabilityManifest | null | undefined,
  required: readonly DeltaHostCapability[],
): DeltaCapabilityReport {
  if (!manifest || !Number.isInteger(manifest.contractVersion) ||
      !Array.isArray(manifest.capabilities)) {
    return { compatible: false, available: [], missing: [...required], reason: 'missing-manifest' }
  }
  if (manifest.contractVersion !== DELTA_HOST_CONTRACT_VERSION) {
    return { compatible: false, available: [], missing: [...required], reason: 'unsupported-contract' }
  }
  const declared = new Set(manifest.capabilities.filter((value): value is string => typeof value === 'string'))
  const supported = new Set<string>(DELTA_HOST_CAPABILITIES)
  const available = DELTA_HOST_CAPABILITIES.filter(cap => declared.has(cap))
  const missing = [...new Set(required)].filter(cap => supported.has(cap) && !declared.has(cap))
  return {
    compatible: missing.length === 0,
    available,
    missing,
    reason: missing.length === 0 ? 'ready' : 'missing-capabilities',
  }
}

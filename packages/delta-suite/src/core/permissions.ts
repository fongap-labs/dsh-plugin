import type { NormalizedBridgeConfig, PermissionKey, PermissionPolicy } from '../types.js'

export function createPermissionPolicy(config: NormalizedBridgeConfig): PermissionPolicy {
  const values: Record<PermissionKey, boolean> = {
    'provider-request': config.permissions.providerRequests,
    'capability-execution': config.permissions.capabilityExecution,
    'local-api': config.permissions.localApi,
  }
  return {
    allows(permission) { return values[permission] === true },
    snapshot() { return Object.freeze({ ...values }) },
  }
}

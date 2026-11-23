/**
 * Retired Gateway Effort adapter.
 *
 * The available public Harness contracts do not provide a credential-opaque
 * authenticated catalog request. Resolving a secret to perform a separate
 * HTTP request would violate the Delta Suite Host boundary.
 *
 * Keep the historical exports for existing integrations, but do not mount
 * routes, access credentials or indicate that discovery succeeded.
 * Native model and reasoning controls remain Host-owned.
 */
export const DELTA_GATEWAY_EFFORT_PREVIEW_PATH = '/api/delta-suite/gateway-effort/preview'
export const DELTA_GATEWAY_EFFORT_APPLY_PATH = '/api/delta-suite/gateway-effort/apply'

/** @deprecated Host does not expose a verified credential-opaque discovery API. */
export function installHostGatewayEffortSync(_ctx: unknown): () => void {
  return () => {}
}

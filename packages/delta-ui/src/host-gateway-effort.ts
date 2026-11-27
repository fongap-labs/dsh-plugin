/**
 * Safe, fail-closed integration boundary.
 *
 * The current public Harness contracts do not expose an authenticated
 * credential-free Gateway catalog request. Delta UI therefore does not
 * register model-discovery or settings-write routes. It must never call
 * obtain raw credentials, inspect bearer tokens, or substitute its own proxy.
 *
 * A future Host-owned request capability can be implemented only after its
 * documented API and client permissions are independently verified.
 */
export const DELTA_GATEWAY_EFFORT_PREVIEW_PATH = '/api/delta-ui/gateway-effort/preview'
export const DELTA_GATEWAY_EFFORT_APPLY_PATH = '/api/delta-ui/gateway-effort/apply'
export type GatewayHostOptions = Readonly<Record<never, never>>

export function installHostGatewayEffortSync(
  _ctx: unknown,
  _options: GatewayHostOptions = {},
): () => void {
  return () => {}
}

/**
 * Gateway-specific coordination with the DSH Host retry waterfall.
 * Do not replace its native retry engine or patch its LLM transport.
 * A provider adapter can drop Retry-After before the agent loop sees it,
 * so the gateway's structured error body is the remaining evidence.
 */

interface LlmFailureLike {
  readonly message?: unknown
  readonly status?: unknown
}

interface RequestErrorLike {
  readonly failure?: LlmFailureLike
}

export interface GatewayRetryHookContext {
  on?(
    event: 'agent/request-error',
    listener: (event: RequestErrorLike, next: () => Promise<unknown>) => Promise<unknown>,
    options?: { prepend: boolean },
  ): (() => void) | undefined
}

const PREFIX = /^\s*503:\s*/u
const MIN_DEFERRED_MS = 5_000
const MAX_ERROR_MESSAGE_LENGTH = 16_384

/**
 * Only a *Gateway-confirmed* model-family exhaustion with a real long wait
 * should stop an immediate retry. The failure is surfaced normally by DSH;
 * a later user-initiated request remains possible.
 */
export function isDeferredGatewayExhaustion(failure: LlmFailureLike | null | undefined): boolean {
  const message = failure?.message
  if (typeof message !== 'string' || message.length > MAX_ERROR_MESSAGE_LENGTH) return false
  const match = PREFIX.exec(message)
  if (!match) return false
  let decoded: unknown
  try {
    decoded = JSON.parse(message.slice(match[0].length))
  } catch {
    return false
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return false
  const envelope = decoded as Record<string, unknown>
  const root = envelope.error && typeof envelope.error === 'object' && !Array.isArray(envelope.error)
    ? envelope.error as Record<string, unknown>
    : envelope
  const details = root.details
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false
  const data = details as Record<string, unknown>
  return (
    data.gateway_code === 'gateway_attempt_budget_exhausted' &&
    typeof data.retry_after_ms === 'number' &&
    Number.isFinite(data.retry_after_ms) &&
    data.retry_after_ms >= MIN_DEFERRED_MS
  )
}

/** Register before native retry listeners; other failures delegate unchanged. */
export function installGatewayRetryGuard(ctx: GatewayRetryHookContext): () => void {
  if (typeof ctx.on !== 'function') return () => {}
  const unsubscribe = ctx.on(
    'agent/request-error',
    ({ failure }, next) => isDeferredGatewayExhaustion(failure) ? Promise.resolve(undefined) : next(),
    { prepend: true },
  )
  return typeof unsubscribe === 'function' ? unsubscribe : () => {}
}

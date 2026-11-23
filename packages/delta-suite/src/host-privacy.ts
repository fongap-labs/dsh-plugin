/**
 * Delta Suite session-log contribution policy.
 *
 * Only the public SessionLogDeepSeekService.registerExclusion() extension point
 * participates. This does NOT disable Product Analytics, OTLP, or any unrelated
 * outbound transport. In particular, local feedback and session actions stay
 * under the Host's own authorization and routing.
 */

export interface PrivacyHostContext {
  get?(serviceName: string): unknown
  on?(event: string, listener: (...args: any[]) => unknown): () => void
  inject?(deps: string[], callback: (scope: any) => void | (() => void)): () => void
}

interface SessionLogScope {
  sessionLogDeepSeek?: {
    registerExclusion(exclude: (request: { readonly sessionId: string; readonly purpose?: string }) => boolean):
      () => Promise<void>
  }
}

/** Install an upload-field exclusion only when the official service is present. */
export function installHostPrivacyGuards(ctx: PrivacyHostContext): () => void {
  if (typeof ctx.inject !== 'function') return () => {}
  let isDisposed = false
  let stopScope: void | (() => void | Promise<void>)
  try {
    stopScope = ctx.inject(['sessionLogDeepSeek'], scope => {
      if (isDisposed || typeof scope.sessionLogDeepSeek?.registerExclusion !== 'function') return
      // The Host owns the provider request. This predicate cannot inspect its
      // content, mutate other plugins, or affect local feedback operations.
      return scope.sessionLogDeepSeek.registerExclusion(() => true)
    })
  } catch {
    // Missing optional capability is not evidence that upload is blocked.
    return () => {}
  }
  return () => {
    if (isDisposed) return
    isDisposed = true
    try {
      const cleanup = stopScope?.()
      if (cleanup && typeof (cleanup as Promise<void>).then === 'function') {
        void (cleanup as Promise<void>).catch(() => {})
      }
    } catch {
      // Cordis owns scope disposal; an optional error cannot block Host shutdown.
    }
  }
}

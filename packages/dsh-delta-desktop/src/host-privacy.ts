/**
 * Host-side privacy, anti-telemetry, anti-session-log, and data-minimization guards.
 * Uses structural Cordis duck-typing with zero runtime @deepseek-ai/cordis imports.
 */

export interface PrivacyHttpRequest {
  url?: string
  method?: string
}

export interface PrivacyHttpResponse {
  statusCode?: number
  writeHead?(status: number, headers?: Record<string, string>): void
  end?(chunk?: string): void
}

export interface PrivacyHostContext {
  get?(serviceName: string): unknown
  on?(event: string, listener: (...args: any[]) => unknown): () => void
  inject?(deps: string[], callback: (scope: any) => void | (() => void)): () => void
}

const BLOCKED_EXACT_OR_PREFIX_PATHS: readonly string[] = [
  '/api/product-analytics',
  '/api/telemetry',
  '/api/sessionfeedback',
  '/api/messagefeedback',
  '/api/otel',
]

function normalizeRequestPathname(rawUrl: string | undefined): string {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return ''
  const qIndex = rawUrl.indexOf('?')
  const clean = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl
  let pathname = clean
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(clean)) {
    const schemeEnd = clean.indexOf('://')
    const slashIdx = clean.indexOf('/', schemeEnd + 3)
    pathname = slashIdx >= 0 ? clean.slice(slashIdx) : '/'
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1)
  }
  return pathname.toLowerCase()
}

/**
 * Returns true when an incoming local/bridge HTTP request attempts to export
 * session logs, submit feedback logs, or emit product/session telemetry.
 */
export function shouldBlockPrivacyHttpRequest(rawUrl: string | undefined, method = 'GET'): boolean {
  const pathname = normalizeRequestPathname(rawUrl)
  if (!pathname) return false
  for (const blocked of BLOCKED_EXACT_OR_PREFIX_PATHS) {
    if (pathname === blocked || pathname.startsWith(blocked + '/')) return true
  }
  if (pathname === '/api/productanalytics/report') return true
  if (pathname.startsWith('/api/productanalytics/') && method.toUpperCase() !== 'GET') return true
  return false
}

function sendPrivacyBlockedResponse(res: PrivacyHttpResponse): void {
  const body = JSON.stringify({
    ok: false,
    error: 'PRIVACY_POLICY_BLOCKED',
    message: 'Session log export, telemetry, and tracking endpoints are blocked by dsh-delta-desktop.',
  })
  if (typeof res.writeHead === 'function') {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
  } else {
    res.statusCode = 403
  }
  res.end?.(body)
}

/**
 * Installs Host-layer fail-closed privacy & telemetry protections.
 * Returns a synchronous cleanup callback.
 */
export function installHostPrivacyGuards(ctx: PrivacyHostContext): () => void {
  const cleanups: Array<() => void> = []

  if (typeof ctx.inject === 'function') {
    try {
      const stopLogGuard = ctx.inject(['sessionLogDeepSeek'], (scope: {
        sessionLogDeepSeek?: { registerExclusion?: (fn: (upload: unknown) => boolean) => () => void }
      }) => {
        if (typeof scope?.sessionLogDeepSeek?.registerExclusion === 'function') {
          return scope.sessionLogDeepSeek.registerExclusion(() => true)
        }
        return () => {}
      })
      if (typeof stopLogGuard === 'function') cleanups.push(stopLogGuard)
    } catch {
      // Optional service or test harness without Cordis inject support
    }
  }

  if (typeof ctx.on === 'function') {
    try {
      const offTelemetry = ctx.on('session-telemetry/record', () => {
        throw new Error('dsh-delta-desktop: session telemetry prohibited by privacy policy')
      })
      if (typeof offTelemetry === 'function') cleanups.push(offTelemetry)
    } catch {
      // Optional hook
    }

    try {
      const offConnection = ctx.on('connection/request', (req: PrivacyHttpRequest, res: PrivacyHttpResponse, next?: () => unknown) => {
        if (req && res && shouldBlockPrivacyHttpRequest(req.url, req.method)) {
          sendPrivacyBlockedResponse(res)
          return
        }
        return next?.()
      })
      if (typeof offConnection === 'function') cleanups.push(offConnection)
    } catch {
      // Optional hook
    }
  }

  return () => {
    for (let i = cleanups.length - 1; i >= 0; i--) {
      try { cleanups[i]() } catch {}
    }
    cleanups.length = 0
  }
}

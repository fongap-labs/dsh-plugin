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

/**
 * Normalize the request-target before the Host routes it. Raw Node request
 * targets can contain escaped ASCII, doubled separators and dot segments.
 * Keep both spellings: one router may match the literal path while another
 * resolves traversal, so neither spelling may evade a privacy block.
 *
 * Decode only ASCII escapes; UTF-8/non-ASCII path components are unrelated to
 * the reserved API namespaces and malformed escapes must not throw.
 */
function normalizeRequestPathnames(rawUrl: string | undefined): readonly string[] {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return []
  let pathname = rawUrl.trim()
  // Absolute-form HTTP targets occur in local bridge/proxy requests. Strip
  // their authority without URL()'s eager dot-segment normalization.
  const absolutePrefix = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*/.exec(pathname)?.[0]
  if (absolutePrefix !== undefined) pathname = pathname.slice(absolutePrefix.length) || '/'
  const separator = pathname.search(/[?#]/)
  if (separator >= 0) pathname = pathname.slice(0, separator)
  if (!pathname.startsWith('/') && !pathname.startsWith('\\')) return []

  // HTTP routing stacks vary in how many levels of encoding they resolve.
  // Bound the number of passes while covering ordinary double encoding.
  for (let i = 0; i < 8; i++) {
    const decoded = pathname.replace(/%([0-7][0-9a-f])/gi,
      (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    if (decoded === pathname) break
    pathname = decoded
  }
  pathname = pathname.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase()
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')

  const resolved: string[] = []
  for (const part of pathname.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  const canonical = '/' + resolved.join('/')
  return pathname === canonical ? [pathname] : [pathname, canonical]
}

/** Match path-segment boundaries, never similarly prefixed unrelated routes. */
function isPrivacyBlockedPath(pathname: string, method: string): boolean {
  for (const blocked of BLOCKED_EXACT_OR_PREFIX_PATHS) {
    if (pathname === blocked || pathname.startsWith(blocked + '/')) return true
  }
  if (pathname === '/api/productanalytics/report') return true
  if (pathname.startsWith('/api/productanalytics/') && method.toUpperCase() !== 'GET') return true
  return false
}

/**
 * Returns true when an incoming local/bridge HTTP request attempts to export
 * session logs, submit feedback logs, or emit product/session telemetry.
 */
export function shouldBlockPrivacyHttpRequest(rawUrl: string | undefined, method = 'GET'): boolean {
  return normalizeRequestPathnames(rawUrl).some(pathname => isPrivacyBlockedPath(pathname, method))
}

function sendPrivacyBlockedResponse(res: PrivacyHttpResponse): void {
  const body = JSON.stringify({
    ok: false,
    error: 'PRIVACY_POLICY_BLOCKED',
    message: 'Session log export, telemetry, and tracking endpoints are blocked by delta-suite.',
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
        throw new Error('delta-suite: session telemetry prohibited by privacy policy')
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

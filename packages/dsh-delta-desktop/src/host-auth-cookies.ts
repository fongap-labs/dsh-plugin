import { loadNodeModule } from './host-state.js'

const AUTH_COOKIE_PREFIX = 'dsh-auth-'
const AUTH_COOKIE_NAME_RE = /^dsh-auth-[A-Za-z0-9_-]{16,}$/
const DEFAULT_MAX_KEPT_OTHER_AUTH_COOKIES = 3

interface CryptoHashLike {
  createHash(alg: string): { update(v: string): { digest(enc: 'base64url'): string } }
}

let cachedCrypto: CryptoHashLike | undefined
let cryptoPromise: Promise<CryptoHashLike | undefined> | undefined

function loadCrypto(): Promise<CryptoHashLike | undefined> {
  if (cachedCrypto) return Promise.resolve(cachedCrypto)
  if (!cryptoPromise) {
    cryptoPromise = loadNodeModule<CryptoHashLike>('node:crypto').then(
      mod => {
        cachedCrypto = mod
        return mod
      },
      () => undefined,
    )
  }
  return cryptoPromise
}

void loadCrypto()

interface HttpRequestLike {
  headers?: Record<string, string | string[] | undefined>
}

interface HttpResponseLike {
  writeHead?: (...args: unknown[]) => unknown
  getHeader?(name: string): string | number | readonly string[] | undefined
  setHeader?(name: string, value: string | readonly string[]): unknown
}

interface WebServerLike {
  readonly server?: {
    prependListener?: (event: 'request', listener: (req: HttpRequestLike, res: HttpResponseLike) => void) => unknown
    off?: (event: 'request', listener: (req: HttpRequestLike, res: HttpResponseLike) => void) => unknown
  }
  getOrigin?: () => string
}

interface HostCookieContext {
  inject?: (deps: string[], callback: (ctx: HostCookieContext & { webServer?: WebServerLike }) => void | (() => void)) => (() => void) | void
  effect?: (callback: () => (() => void) | void, label?: string) => (() => void) | void
}

/** Normalize the Host origin to the audience used by dsh-client-connection. */
function cookieAudienceFromOrigin(origin: string): string {
  const lower = origin.toLowerCase()
  if (lower.startsWith('http://')) {
    const rest = origin.slice(7)
    const slash = rest.indexOf('/')
    return slash === -1 ? rest : rest.slice(0, slash)
  }
  if (lower.startsWith('https://')) {
    const slash = origin.indexOf('/', 8)
    return slash === -1 ? origin : origin.slice(0, slash)
  }
  return origin
}

function computeCurrentAuthCookieNameSync(origin: string): string | undefined {
  if (!cachedCrypto) return undefined
  const hash = cachedCrypto.createHash('sha256').update(cookieAudienceFromOrigin(origin)).digest('base64url')
  return `${AUTH_COOKIE_PREFIX}${hash}`
}

/** Extract unique `dsh-auth-*` cookie names in the order they appear in a `Cookie` header. */
export function parseAuthCookieNames(cookieHeader: string | undefined): string[] {
  if (!cookieHeader || !cookieHeader.includes(AUTH_COOKIE_PREFIX)) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!AUTH_COOKIE_NAME_RE.test(name) || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/**
 * Keep the current launch's auth cookie plus at most `maxKeptOther` recent sibling cookies.
 * Returning only the oldest excess names prevents Chromium's `127.0.0.1` cookie jar from
 * growing past Node's 16 KiB `maxHeaderSize` across restarts.
 */
export function selectStaleAuthCookieNames(
  names: readonly string[],
  currentCookieName?: string,
  maxKeptOther = DEFAULT_MAX_KEPT_OTHER_AUTH_COOKIES,
): string[] {
  const others = currentCookieName ? names.filter(name => name !== currentCookieName) : [...names]
  if (others.length <= maxKeptOther) return []
  return others.slice(0, others.length - maxKeptOther)
}

function buildExpiredCookieHeader(name: string, isSecure: boolean): string {
  const base = `${name}=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`
  return isSecure ? `${base}; Secure` : base
}

function appendSetCookieEntries(
  existing: string | number | readonly string[] | undefined,
  additions: readonly string[],
): string | string[] {
  if (existing === undefined) return additions.length === 1 ? additions[0] : [...additions]
  const list = Array.isArray(existing) ? [...existing.map(String)] : [String(existing)]
  return [...list, ...additions]
}

function attachResponseCookieCleanup(
  res: HttpResponseLike,
  staleNames: readonly string[],
  isSecure: boolean,
): void {
  const deletions = staleNames.map(name => buildExpiredCookieHeader(name, isSecure))
  const origWriteHead = res.writeHead
  if (typeof origWriteHead !== 'function') return

  let isInjected = false
  res.writeHead = function patchedWriteHead(this: HttpResponseLike, ...args: unknown[]) {
    if (!isInjected) {
      isInjected = true
      const headersIndex = typeof args[1] === 'string' ? 2 : 1
      const explicitHeaders = args[headersIndex]
      if (explicitHeaders && typeof explicitHeaders === 'object' && !Array.isArray(explicitHeaders)) {
        const cloned: Record<string, unknown> = { ...(explicitHeaders as Record<string, unknown>) }
        const existingKey = Object.keys(cloned).find(k => k.toLowerCase() === 'set-cookie') ?? 'set-cookie'
        const currentHeaderVal = (cloned[existingKey] as string | number | readonly string[] | undefined) ?? this.getHeader?.('set-cookie')
        cloned[existingKey] = appendSetCookieEntries(currentHeaderVal, deletions)
        args[headersIndex] = cloned
      } else if (!Array.isArray(explicitHeaders)) {
        const currentVal = this.getHeader?.('set-cookie')
        this.setHeader?.('set-cookie', appendSetCookieEntries(currentVal, deletions))
      }
    }
    return Reflect.apply(origWriteHead, this, args)
  }
}

/**
 * Automatically expire excess accumulated `dsh-auth-*` loopback cookies via HTTP `Set-Cookie`
 * responses so Electron `net.fetch` requests never exceed Node's 16 KiB request header cap.
 */
export function installHostAuthCookiePruner(
  ctx: HostCookieContext,
  maxKeptOther = DEFAULT_MAX_KEPT_OTHER_AUTH_COOKIES,
): () => void {
  if (!ctx || typeof ctx.inject !== 'function') return () => {}
  let isDisposed = false
  const cleanups: Array<() => void> = []

  const disposeAll = (): void => {
    isDisposed = true
    for (const fn of cleanups.splice(0)) {
      try { fn() } catch {}
    }
  }

  try {
    const stopInject = ctx.inject(['webServer'], webCtx => {
      if (isDisposed) return
      const webServer = webCtx.webServer
      const server = webServer?.server
      if (!server || typeof server.prependListener !== 'function') return

      const onRequest = (req: HttpRequestLike, res: HttpResponseLike): void => {
        const cookieHeader = typeof req.headers?.cookie === 'string' ? req.headers.cookie : undefined
        const names = parseAuthCookieNames(cookieHeader)
        if (names.length <= maxKeptOther) return
        let origin: string | undefined
        try { origin = webServer.getOrigin?.() } catch { origin = undefined }
        const currentName = origin ? computeCurrentAuthCookieNameSync(origin) : undefined
        if (origin && !currentName) return
        const staleNames = selectStaleAuthCookieNames(names, currentName, maxKeptOther)
        if (staleNames.length === 0) return
        attachResponseCookieCleanup(res, staleNames, Boolean(origin?.startsWith('https:')))
      }

      server.prependListener('request', onRequest)
      const offListener = () => {
        try { server.off?.('request', onRequest) } catch {}
      }
      if (typeof webCtx.effect === 'function') {
        const stopEffect = webCtx.effect(() => offListener, 'delta-desktop: auth cookie pruner')
        if (typeof stopEffect === 'function') cleanups.push(stopEffect)
      } else {
        cleanups.push(offListener)
      }
    })
    if (typeof stopInject === 'function') cleanups.push(stopInject)
  } catch {}

  return disposeAll
}

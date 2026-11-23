/**
 * Pure helpers retained for recognizing legacy auth-cookie names in tests.
 * Delta Suite does not intercept Host HTTP responses or alter cookie stores.
 * Cookie eviction belongs to the authenticated Host's own supported API.
 */
const AUTH_COOKIE_PREFIX = 'dsh-auth-'
const AUTH_COOKIE_NAME_RE = /^dsh-auth-[A-Za-z0-9_-]{16,}$/
const DEFAULT_MAX_KEPT_OTHER_AUTH_COOKIES = 3

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


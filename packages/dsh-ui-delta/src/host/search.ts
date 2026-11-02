import { openKey, normalizeProviders, readConfig } from './config.js'
import { makeDuckDuckGoProvider, DUCKDUCKGO_PROVIDER_ID, type SearchRequest } from './duckduckgo.js'

interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
}

interface SearchRow {
  title: string
  url: string
  content: string
}

export class SearchUnavailableError extends Error {
  readonly code = 'KEYLESS_SEARCH_UNAVAILABLE'
  constructor(causes: string[]) {
    super(`免密钥搜索源均不可用（${causes.join('；')}）。请检查宿主网络或代理配置，或在 Delta 配置中指定独立搜索服务商。`)
    this.name = 'SearchUnavailableError'
  }
}

const safeResults = (rows: readonly SearchRow[]): SearchRow[] => rows.filter(row => {
  try {
    const u = new URL(row.url)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password
  } catch { return false }
}).slice(0, 5).map(row => ({
  title: row.title.slice(0, 300),
  url: row.url,
  content: row.content.replace(/\s+/g, ' ').slice(0, 500),
}))

const errorCause = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch failed|network|ECONN|ETIMEDOUT|ENETUNREACH|abort|timeout/i.test(message)) {
    return 'Network request failed or timed out'
  }
  return message.slice(0, 160)
}

/** Decode simple RSS text without trusting remote HTML or script. */
const textOf = (value: string): string => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (_full, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    const key = entity.toLowerCase()
    if (key in named) return named[key]!
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10)
      if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) return String.fromCodePoint(code)
    }
    return ''
  })
  .trim()

/** Fallback source: Bing's public search RSS, independent of API credentials. */
export const searchBingRss = async (query: string, request: typeof fetch = fetch, signal?: AbortSignal): Promise<SearchRow[]> => {
  const url = new URL('https://www.bing.com/search')
  url.searchParams.set('format', 'rss')
  url.searchParams.set('q', query.slice(0, 500))
  const timeout = AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])])
  let endpoint = url
  let response: Response
  for (let redirects = 0; ; redirects++) {
    response = await request(endpoint, {
      method: 'GET', redirect: 'manual', signal: timeout,
      headers: { accept: 'application/rss+xml, application/xml, text/xml' },
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects >= 3) throw new Error('Bing RSS redirect limit exceeded')
    const next = new URL(location, endpoint)
    // Bing redirects mainland requests to cn.bing.com. Follow only its HTTPS search endpoint.
    if (next.protocol !== 'https:' || !['www.bing.com', 'cn.bing.com', 'bing.com'].includes(next.hostname)
      || next.port || next.username || next.password || next.pathname !== '/search') throw new Error('Bing RSS refused an unexpected redirect')
    endpoint = next
  }
  if (!response.ok) throw new Error(`Bing RSS HTTP ${response.status}`)
  const xml = (await response.text()).slice(0, 1_000_000)
  if (!/<rss\b/i.test(xml)) throw new Error('Bing RSS did not return RSS content')
  const rows: SearchRow[] = []
  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const part = item[1]!
    const value = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(part)?.[1] || ''
    const link = textOf(value('link'))
    rows.push({ title: textOf(value('title')), url: link, content: textOf(value('description')) })
    if (rows.length >= 10) break
  }
  if (!rows.length && !/<channel\b/i.test(xml)) throw new Error('Bing RSS returned no recognizable entries')
  return safeResults(rows)
}

/**
 * Slash commands and native web_search share configuration and keyless sources.
 */
export const searchWeb = async (query: string, signal?: AbortSignal): Promise<SearchRow[]> => {
  signal?.throwIfAborted()
  query = query.trim().slice(0, 500)
  if (!query) throw new Error('search query required')
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find(provider => provider.active) || providers[0]
  if (active?.endpoint) {
    const key = await openKey('search', active)
    const response = await fetch(active.endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ query, max_results: 5 }),
      signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
    })
    if (!response.ok) throw new Error(`Independent search provider HTTP ${response.status}`)
    const data = (await response.json()) as { results?: SearchHit[] }
    const rows = Array.isArray(data?.results) ? data.results : []
    return safeResults(rows.map(hit => ({
      title: String(hit.title || ''),
      url: String(hit.url || ''),
      content: String(hit.content || ''),
    })))
  }
  const failures: string[] = []
  try { return await searchBingRss(query, fetch, signal) }
  catch (error) { signal?.throwIfAborted(); failures.push(`Bing RSS：${errorCause(error)}`) }
  try {
    const result = await makeDuckDuckGoProvider().search({ query, maxResults: 5 }, signal)
    return safeResults(result.sources.map(source => ({
      title: source.title || '', url: source.url, content: source.snippet || '',
    })))
  } catch (error) { signal?.throwIfAborted(); failures.push(`DuckDuckGo：${errorCause(error)}`) }
  throw new SearchUnavailableError(failures)
}

/** Keep the published provider id so existing profiles pick up the repaired path. */
export const makeWebSearchProvider = () => ({
  id: DUCKDUCKGO_PROVIDER_ID,
  available: () => true,
  ready: async () => true,
  async search(request: SearchRequest, signal?: AbortSignal) {
    const rows = await searchWeb(request.query, signal)
    const limit = Math.max(1, Math.min(5, Number.isInteger(request.maxResults) ? request.maxResults! : 5))
    return {
      sources: rows.slice(0, limit).map(row => ({ url: row.url, title: row.title, snippet: row.content })),
      truncated: rows.length > limit,
    }
  },
})

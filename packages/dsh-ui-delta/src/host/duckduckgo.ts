/** A keyless DuckDuckGo HTML search adapter for Harness's native ctx.web service. */
export const DUCKDUCKGO_PROVIDER_ID = 'delta-duckduckgo'

export interface SearchSource {
  readonly url: string
  readonly title?: string
  readonly snippet?: string
}

export interface SearchRequest {
  readonly query: string
  readonly maxResults?: number
}

export interface SearchResult {
  readonly sources: readonly SearchSource[]
  readonly truncated: boolean
}

type SearchFetch = typeof fetch

const decodeEntities = (value: string): string =>
  value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    const key = entity.toLowerCase()
    if (key in named) return named[key]!
    const number = key.startsWith('#x')
      ? Number.parseInt(key.slice(2), 16)
      : Number.parseInt(key.slice(1), 10)
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff
      && (number < 0xd800 || number > 0xdfff) ? String.fromCodePoint(number) : ''
  })

const readable = (html: string): string =>
  decodeEntities(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())

function resolveSearchUrl(href: string): string | undefined {
  try {
    const value = new URL(decodeEntities(href), 'https://duckduckgo.com')
    const target = value.searchParams.get('uddg')
    const destination = target ? new URL(target) : value
    if (!['http:', 'https:'].includes(destination.protocol)) return undefined
    if (destination.username || destination.password) return undefined
    if (destination.hostname === 'duckduckgo.com' && !target) return undefined
    return destination.toString()
  } catch {
    return undefined
  }
}

/** Parse only result anchors, and take each adjacent result's snippet before the next result. */
export function parseDuckDuckGoHtml(html: string, maximum = 5): SearchSource[] {
  const anchors = [...html.matchAll(/<a\b(?=[^>]*\bclass=(["'])[^"']*\bresult__a\b[^"']*\1)[^>]*>[^]*?<\/a>/gi)]
  const sources: SearchSource[] = []
  const seen = new Set<string>()
  for (let i = 0; i < anchors.length && sources.length < maximum; i += 1) {
    const anchor = anchors[i]!
    const markup = anchor[0]
    const match = /\bhref\s*=\s*(["'])([^"']+)\1/i.exec(markup)
    if (!match) continue
    const url = resolveSearchUrl(match[2]!)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title = readable(markup.replace(/^<a\b[^>]*>/i, '').replace(/<\/a>$/i, '')).slice(0, 300)
    const section = html.slice(anchor.index! + markup.length, anchors[i + 1]?.index ?? anchor.index! + markup.length + 6000)
    const snippet = /<(?:a|div)\b(?=[^>]*\bclass=(["'])[^"']*\bresult__snippet\b[^"']*\1)[^>]*>([^]*?)<\/(?:a|div)>/i.exec(section)
    sources.push({ url, ...(title ? { title } : {}), ...(snippet ? { snippet: readable(snippet[0]).slice(0, 600) } : {}) })
  }
  return sources
}

export function makeDuckDuckGoProvider(fetchHtml: SearchFetch = fetch) {
  return {
    id: DUCKDUCKGO_PROVIDER_ID,
    available: () => true,
    ready: async () => true,
    async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
      if (!request.query || request.query.trim().length === 0) throw new Error('search query required')
      const maximum = Math.max(1, Math.min(10, Number.isInteger(request.maxResults) ? request.maxResults! : 5))
      const timeout = AbortSignal.timeout(15_000)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      const endpoint = new URL('https://html.duckduckgo.com/html/')
      endpoint.searchParams.set('q', request.query.trim().slice(0, 500))
      const response = await fetchHtml(endpoint, {
        method: 'GET', redirect: 'error', signal: combined,
        headers: { 'accept': 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; DeltaSearch/1.0)' },
      })
      if (!response.ok) throw new Error(`DuckDuckGo search HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.toLowerCase().includes('text/html')) throw new Error('DuckDuckGo returned unexpected content type')
      const html = (await response.text()).slice(0, 2_000_000)
      const sources = parseDuckDuckGoHtml(html, maximum)
      if (!sources.length && !/result__no-result|no results found|no results\./i.test(html)) {
        throw new Error('DuckDuckGo returned no parsable results; the service may be rate limited')
      }
      return { sources, truncated: false }
    },
  }
}

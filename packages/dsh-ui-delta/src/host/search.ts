import { openKey, normalizeProviders, readConfig } from './config.js'

/** One search hit as returned by a Tavily-compatible endpoint. */
interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
}

interface HostWebSearch {
  search(request: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{
    content?: string
    sources: readonly { title?: string; url: string; snippet?: string; summary?: string }[]
  }>
}

interface OptionalWebContext {
  get?(name: string): unknown
  web?: HostWebSearch
}

/** Use configured independent search first; otherwise delegate to the Host web seam. */
export const searchWeb = async (query: string, ctx?: OptionalWebContext): Promise<Array<{ title: string; url: string; content: string }>> => {
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find((provider) => provider.active) || providers[0]
  if (!active?.endpoint) {
    const candidate = ctx?.get?.('web') ?? ctx?.web
    const web = candidate as HostWebSearch | undefined
    if (!web || typeof web.search !== 'function') {
      throw new Error('No web search provider is configured. Add an independent search provider in Delta settings or enable a Host web-search provider.')
    }
    try {
      const result = await web.search({ query, maxResults: 5 }, AbortSignal.timeout(30_000))
      return (result.sources || []).slice(0, 5).map((source) => ({
        title: source.title || '',
        url: source.url,
        content: String(source.snippet || source.summary || result.content || '').slice(0, 300),
      }))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Host web search is unavailable: ${reason}. If the Host uses DeepSeek official search, configure its official key or select an independent provider.`)
    }
  }
  const key = await openKey('search', active)
  const response = await fetch(active.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as { results?: SearchHit[] }
  const list: SearchHit[] = Array.isArray(data?.results) ? data.results : []
  return list.slice(0, 5).map((hit) => ({
    title: String(hit.title || ''),
    url: String(hit.url || ''),
    content: String(hit.content || '').slice(0, 300),
  }))
}

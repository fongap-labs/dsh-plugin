import { openKey, normalizeProviders, readConfig } from './config.js'

/** One search hit as returned by a Tavily-compatible endpoint. */
interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
}

export const searchWeb = async (query: string): Promise<Array<{ title: string; url: string; content: string }>> => {
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find((provider) => provider.active) || providers[0]
  if (!active || !active.endpoint) throw new Error('search endpoint is not configured')
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

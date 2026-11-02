import { openKey, normalizeProviders, readConfig } from './config.js'
import { DUCKDUCKGO_PROVIDER_ID, type SearchRequest } from './duckduckgo.js'
import { searchPythonDdgs } from './python-ddgs.js'

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
    super(`搜索不可用（${causes.join('；')}）。请检查 Python ddgs 安装与宿主网络/代理配置，或在 Delta 配置中指定独立搜索服务商。`)
    this.name = 'SearchUnavailableError'
  }
}

// Accept HTTP(S) destination URLs only; bound untrusted result size for prompts.
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

/**
 * Native model web_search and /search share the same implementation:
 * configured independent endpoint, otherwise the local Python ddgs library.
 * Never silently fall back to the official DeepSeek paid search provider.
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
  try { return safeResults(await searchPythonDdgs(query, signal)) }
  catch (error) {
    signal?.throwIfAborted()
    throw new SearchUnavailableError([error instanceof Error ? error.message : String(error)])
  }
}

/** Retain the existing provider id for installed Harness profile compatibility. */
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

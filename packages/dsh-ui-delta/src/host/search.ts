import { openKey, normalizeProviders, readConfig } from './config.js'
import { DUCKDUCKGO_PROVIDER_ID, type SearchRequest } from './duckduckgo.js'
import { searchPythonDdgs, checkPythonDdgs } from './python-ddgs.js'
import { safeResults, rankResults, researchQueries, type SearchRow } from './search-quality.js'

interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
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
export const searchWeb = async (
  query: string, signal?: AbortSignal, keyless: typeof searchPythonDdgs = searchPythonDdgs,
  maxResults = 5
): Promise<SearchRow[]> => {
  signal?.throwIfAborted()
  query = query.trim().slice(0, 500)
  if (!query) throw new Error('search query required')
  const limit = Math.max(1, Math.min(20, Math.trunc(maxResults) || 5))
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find(provider => provider.active) || providers[0]
  if (active?.endpoint) {
    const key = await openKey('search', active)
    const response = await fetch(active.endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ query, max_results: limit }),
      signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
    })
    if (!response.ok) throw new Error(`Independent search provider HTTP ${response.status}`)
    const data = (await response.json()) as { results?: SearchHit[] }
    const rows = Array.isArray(data?.results) ? data.results : []
    return safeResults(rows.map(hit => ({
      title: String(hit.title || ''),
      url: String(hit.url || ''),
      content: String(hit.content || ''),
    })), limit)
  }
  try { return safeResults(await keyless(query, signal, undefined, limit), limit) }
  catch (error) {
    signal?.throwIfAborted()
    throw new SearchUnavailableError([error instanceof Error ? error.message : String(error)])
  }
}

/** Retain the existing provider id for installed Harness profile compatibility. */
export const makeWebSearchProvider = () => ({
  id: DUCKDUCKGO_PROVIDER_ID,
  available: () => true,
  ready: async () => {
    const cfg = readConfig().search || {}
    if (normalizeProviders('search', cfg).some(provider => provider.active && provider.endpoint)) return true
    return checkPythonDdgs()
  },
  async search(request: SearchRequest, signal?: AbortSignal) {
    const rows = await searchWeb(request.query, signal, searchPythonDdgs, request.maxResults)
    const limit = Math.max(1, Math.min(20, Number.isInteger(request.maxResults) ? request.maxResults! : 5))
    return {
      sources: rows.slice(0, limit).map(row => ({ url: row.url, title: row.title, snippet: row.content })),
      truncated: rows.length > limit,
    }
  },
})


export interface ResearchReport {
  query: string
  queries: string[]
  results: SearchRow[]
  errors: string[]
  partial: boolean
}

/**
 * Manual deep research only: bounded sequential searches, URL deduplication and
 * deterministic keyword ranking. Native web_search keeps the single-query path.
 */
export async function researchWeb(
  query: string, signal?: AbortSignal,
  search: typeof searchWeb = searchWeb
): Promise<ResearchReport> {
  const queries = researchQueries(query)
  if (!queries.length) throw new Error('search query required')
  const collected: SearchRow[] = []
  const errors: string[] = []
  for (const term of queries) {
    signal?.throwIfAborted()
    try {
      collected.push(...await search(term, signal, searchPythonDdgs, 10))
    } catch (error) {
      signal?.throwIfAborted()
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!collected.length && errors.length) throw new SearchUnavailableError(errors)
  return {
    query: queries[0]!,
    queries,
    results: rankResults(query, collected, 15),
    errors,
    partial: errors.length > 0,
  }
}

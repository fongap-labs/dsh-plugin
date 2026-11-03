import { openKey, normalizeProviders, readConfig, type ProviderRecord } from './config.js'
import { DUCKDUCKGO_PROVIDER_ID, type SearchRequest } from './duckduckgo.js'
import { searchPythonDdgs } from './python-ddgs.js'
import { searchPublicInstances } from './searxng.js'
import { safeResults, rankResults, researchQueries, type SearchRow } from './search-quality.js'

interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
}

export class SearchUnavailableError extends Error {
  readonly code = 'KEYLESS_SEARCH_UNAVAILABLE'
  constructor(causes: string[]) {
    super(`Search unavailable (${causes.join('; ')}). Check configured providers, Python ddgs, and network settings.`)
    this.name = 'SearchUnavailableError'
  }
}

const limitOf = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(20, Math.trunc(value))) : 5

const retryableStatus = (status: number): boolean =>
  status === 408 || status === 425 || status === 429 || status >= 500

class ProviderFailure extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

const wait = async (ms: number, signal?: AbortSignal): Promise<void> => {
  signal?.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve() }, ms)
    const stop = () => { clearTimeout(timer); reject(new DOMException('Search aborted', 'AbortError')) }
    signal?.addEventListener('abort', stop, { once: true })
  })
}

async function searchEndpoint(
  provider: ProviderRecord, query: string, limit: number, signal?: AbortSignal
): Promise<SearchRow[]> {
  const key = await openKey('search', provider)
  const response = await fetch(provider.endpoint!, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ query, max_results: limit }),
    signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
  })
  if (!response.ok) throw new ProviderFailure(
    `Search endpoint ${provider.id} returned HTTP ${response.status}`,
    retryableStatus(response.status),
  )
  let data: { results?: SearchHit[] }
  try { data = (await response.json()) as { results?: SearchHit[] } }
  catch { throw new ProviderFailure(`Search endpoint ${provider.id} returned invalid JSON`, true) }
  if (!Array.isArray(data?.results)) {
    throw new ProviderFailure(`Search endpoint ${provider.id} returned no results array`, true)
  }
  return safeResults(data.results.map(hit => ({
    title: String(hit?.title || ''),
    url: String(hit?.url || ''),
    content: String(hit?.content || ''),
  })), limit)
}

/**
 * Use the explicitly selected provider first, then other configured endpoints
 * on transient failure. Never move to an unrelated paid provider.
 * Optional keyless fallback requires a persisted user opt-in.
 */
export const searchWeb = async (
  query: string, signal?: AbortSignal, keyless: typeof searchPythonDdgs = searchPythonDdgs,
  maxResults = 5, publicSearch: typeof searchPublicInstances = searchPublicInstances
): Promise<SearchRow[]> => {
  signal?.throwIfAborted()
  query = query.trim().slice(0, 500)
  if (!query) throw new Error('search query required')
  const limit = limitOf(maxResults)
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find(provider => provider.active) || providers[0]
  const candidates = [active, ...providers.filter(provider => provider !== active)]
    .filter((provider): provider is ProviderRecord => !!provider?.endpoint)
  const errors: string[] = []
  let sawEmpty = false
  for (const provider of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal?.throwIfAborted()
      try {
        const results = await searchEndpoint(provider, query, limit, signal)
        if (results.length) return results
        // An empty array is not success: a broken or quota-exhausted provider can
        // silently return zero rows, and that used to short-circuit every fallback.
        sawEmpty = true
        break
      } catch (error) {
        signal?.throwIfAborted()
        if (error instanceof ProviderFailure && !error.retryable) {
          throw new SearchUnavailableError([error.message])
        }
        errors.push(error instanceof Error ? error.message : String(error))
        if (attempt === 0) await wait(250, signal)
      }
    }
  }
  if (candidates.length && !cfg.fallbackToKeyless) {
    if (errors.length) throw new SearchUnavailableError(errors)
    // Every configured provider returned an empty array: the query genuinely has
    // no results, not an outage, so surface it as an empty result set.
    if (sawEmpty) return []
    throw new SearchUnavailableError(errors)
  }
  // Public nodes are attempted before local ddgs, with no extra setup.
  // With custom providers, this step requires explicit permission to fall back.
  const publicHits = await publicSearch(query, limit, signal)
  if (publicHits.results.length) return publicHits.results
  errors.push(...publicHits.failures)
  // Python ddgs remains the final fallback, never a prerequisite.
  try {
    const keylessHits = safeResults(await keyless(query, signal, undefined, limit), limit)
    if (keylessHits.length) return keylessHits
    errors.push('Python ddgs returned no results')
  } catch (error) {
    signal?.throwIfAborted()
    errors.push(error instanceof Error ? error.message : String(error))
  }
  throw new SearchUnavailableError(errors)
}

/** Keep this stable id for installed Harness profile compatibility. */
export const makeWebSearchProvider = () => ({
  id: DUCKDUCKGO_PROVIDER_ID,
  available: () => true,
  ready: async () => {
    const cfg = readConfig().search || {}
    if (normalizeProviders('search', cfg).some(provider => provider.endpoint)) return true
    // Public SearXNG fallbacks remain available even without a local Python runtime.
    return true
  },
  async search(request: SearchRequest, signal?: AbortSignal) {
    const limit = limitOf(request.maxResults ?? 5)
    const rows = await searchWeb(request.query, signal, searchPythonDdgs, limit)
    return {
      sources: rows.map(row => ({ url: row.url, title: row.title, snippet: row.content })),
      truncated: false,
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

/** Manual deep research: bounded retrieval and deterministic keyword ranking. */
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
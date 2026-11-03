/**
 * Built-in public SearXNG instances. These are optional fallbacks, not trusted APIs.
 * SearXNG JSON output can be disabled by each instance administrator (HTTP 403).
 * Do not scrape HTML challenges or silently switch to a paid search provider.
 */
import { safeResults, type SearchRow } from './search-quality.js'

export const PUBLIC_SEARCH_INSTANCES = [
  'https://search.utilibre.org',
  'https://libresearch.space',
  'https://baresearch.org',
] as const

interface Health { failures: number; retryAfter: number }
const health = new Map<string, Health>()
const MAX_JSON_BYTES = 768 * 1024
const SEARCH_TIMEOUT_MS = 8_000

export interface PublicSearchReport {
  results: SearchRow[]
  source: string
  failures: string[]
}
type HttpFetch = typeof fetch

function usable(instance: string): boolean {
  return (health.get(instance)?.retryAfter || 0) <= Date.now()
}
function failed(instance: string): void {
  const count = Math.min(5, (health.get(instance)?.failures || 0) + 1)
  health.set(instance, { failures: count, retryAfter: Date.now() + Math.min(300_000, 15_000 * 2 ** (count - 1)) })
}
function succeeded(instance: string): void { health.delete(instance) }

/** Read JSON with a hard response-size ceiling, even if Content-Length is missing. */
async function jsonBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_JSON_BYTES) throw Error('SearXNG response exceeds limit')
  const reader = response.body?.getReader()
  if (!reader) throw Error('SearXNG response is empty')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_JSON_BYTES) throw Error('SearXNG response exceeds limit')
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}

export async function searchSearxng(
  instance: string, query: string, limit = 5, signal?: AbortSignal,
  request: HttpFetch = fetch,
): Promise<SearchRow[]> {
  // Only our built-in allowlist can be reached by this adapter.
  if (!(PUBLIC_SEARCH_INSTANCES as readonly string[]).includes(instance)) {
    throw Error('SearXNG instance is not in the built-in allowlist')
  }
  const url = new URL('/search', instance)
  url.searchParams.set('q', query.slice(0, 500))
  url.searchParams.set('format', 'json')
  url.searchParams.set('safesearch', '1')
  const controllerSignal = AbortSignal.any([
    AbortSignal.timeout(SEARCH_TIMEOUT_MS), ...(signal ? [signal] : []),
  ])
  const response = await request(url.toString(), {
    method: 'GET', redirect: 'error', signal: controllerSignal,
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw Error('SearXNG ' + instance + ' HTTP ' + response.status)
  const data = await jsonBounded(response) as {
    results?: Array<{ title?: unknown; url?: unknown; content?: unknown }>
  }
  if (!Array.isArray(data?.results)) throw Error('SearXNG did not return JSON results')
  return safeResults(data.results.map(hit => ({
    title: String(hit.title || ''), url: String(hit.url || ''), content: String(hit.content || ''),
  })), Math.min(20, Math.max(1, limit)))
}

/** Sequential failover with backoff, no background polling or API keys. */
export async function searchPublicInstances(
  query: string, limit = 5, signal?: AbortSignal, request: HttpFetch = fetch,
): Promise<PublicSearchReport> {
  const failures: string[] = []
  for (const instance of PUBLIC_SEARCH_INSTANCES) {
    signal?.throwIfAborted()
    if (!usable(instance)) {
      failures.push(instance + ': cooling down')
      continue
    }
    try {
      const results = await searchSearxng(instance, query, limit, signal, request)
      if (results.length) {
        succeeded(instance)
        return { results, source: instance, failures }
      }
      failures.push(instance + ': empty results')
    } catch (error) {
      signal?.throwIfAborted()
      failed(instance)
      failures.push(instance + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }
  return { results: [], source: '', failures }
}

/** Test-only health reset, never exposed as a network route. */
export function clearPublicSearchHealth(): void { health.clear() }

import { spawn } from 'node:child_process'

/** A keyless DuckDuckGo provider backed by the Python ddgs library. */
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

interface PythonSearchRow {
  title?: unknown
  url?: unknown
  snippet?: unknown
}

const PYTHON_SCRIPT = [
  'import json, sys',
  'from ddgs import DDGS',
  'request = json.load(sys.stdin)',
  'rows = DDGS().text(request["query"], max_results=request["maxResults"]) or []',
  'print(json.dumps([{"title": str(r.get("title") or ""), "url": str(r.get("href") or r.get("url") or ""), "snippet": str(r.get("body") or r.get("snippet") or "")} for r in rows], ensure_ascii=False))',
].join('\n')

const pythonExecutable = (): string => process.env.DSH_DDGS_PYTHON?.trim() || 'python'

const parsePythonRows = (output: string, maximum: number): SearchSource[] => {
  const parsed: unknown = JSON.parse(output)
  if (!Array.isArray(parsed)) throw new Error('Python DDGS returned an invalid result list')
  const seen = new Set<string>()
  const sources: SearchSource[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const row = item as PythonSearchRow
    const url = String(row.url || '')
    try {
      const target = new URL(url)
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) continue
    } catch { continue }
    if (seen.has(url)) continue
    seen.add(url)
    const title = String(row.title || '').slice(0, 300)
    const snippet = String(row.snippet || '').replace(/\s+/g, ' ').slice(0, 600)
    sources.push({ url, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}) })
    if (sources.length >= maximum) break
  }
  return sources
}

const searchWithPython = (
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<SearchSource[]> => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('DuckDuckGo search aborted'))
    return
  }
  const child = spawn(pythonExecutable(), ['-c', PYTHON_SCRIPT], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let output = ''
  let stderr = ''
  let isSettled = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let onAbort: () => void = () => {}
  const finish = (callback: () => void): void => {
    if (isSettled) return
    isSettled = true
    if (timeout !== undefined) clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
    callback()
  }
  onAbort = () => {
    child.kill()
    finish(() => reject(new Error('DuckDuckGo search aborted')))
  }
  timeout = setTimeout(() => {
    child.kill()
    finish(() => reject(new Error('Python DDGS search timed out after 20 seconds')))
  }, 20_000)
  timeout.unref()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) {
    onAbort()
    return
  }

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    output += chunk
    if (output.length > 1_000_000) {
      child.kill()
      finish(() => reject(new Error('Python DDGS result exceeded the 1 MB limit')))
    }
  })
  child.stderr.on('data', (chunk: string) => {
    if (stderr.length < 4000) stderr += chunk.slice(0, 4000 - stderr.length)
  })
  child.stdin.on('error', () => {})
  child.on('error', (error) => {
    const code = (error as Error & { code?: string }).code
    const message = code === 'ENOENT'
      ? 'Python was not found; set DSH_DDGS_PYTHON to OpenWorker’s Python executable'
      : 'Could not start Python search: ' + error.message
    finish(() => reject(new Error(message)))
  })
  child.on('close', (code, exitSignal) => {
    if (isSettled) return
    if (code !== 0) {
      const missingPackage = /No module named ['"]ddgs['"]/.test(stderr)
      const detail = missingPackage
        ? 'Python package ddgs is not installed in the selected environment'
        : stderr.trim().slice(0, 500) || 'ddgs search process failed'
      finish(() => reject(new Error('Python DDGS failed (' + (code ?? exitSignal ?? 'unknown') + '): ' + detail)))
      return
    }
    try {
      const sources = parsePythonRows(output, maxResults)
      finish(() => resolve(sources))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      finish(() => reject(new Error('Python DDGS returned invalid JSON: ' + message)))
    }
  })
  child.stdin.end(JSON.stringify({ query, maxResults }))
})

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

export function makeDuckDuckGoProvider(fetchHtml?: SearchFetch) {
  return {
    id: DUCKDUCKGO_PROVIDER_ID,
    available: () => true,
    ready: async () => true,
    async search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResult> {
      if (!request.query || request.query.trim().length === 0) throw new Error('search query required')
      const maximum = Math.max(1, Math.min(10, Number.isInteger(request.maxResults) ? request.maxResults! : 5))
      const query = request.query.trim().slice(0, 500)

      // Preserve the injected HTML transport as a test seam. Production uses Python DDGS below.
      if (fetchHtml) {
        const timeout = AbortSignal.timeout(15_000)
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
        const endpoint = new URL('https://html.duckduckgo.com/html/')
        endpoint.searchParams.set('q', query)
        const response = await fetchHtml(endpoint, {
          method: 'GET', redirect: 'error', signal: combined,
          headers: { 'accept': 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; DeltaSearch/1.0)' },
        })
        if (!response.ok) throw new Error('DuckDuckGo search HTTP ' + response.status)
        const contentType = response.headers.get('content-type') || ''
        if (!contentType.toLowerCase().includes('text/html')) throw new Error('DuckDuckGo returned unexpected content type')
        const html = (await response.text()).slice(0, 2_000_000)
        const sources = parseDuckDuckGoHtml(html, maximum)
        if (!sources.length && !/result__no-result|no results found|no results\./i.test(html)) {
          throw new Error('DuckDuckGo returned no parsable results; the service may be rate limited')
        }
        return { sources, truncated: false }
      }

      const sources = await searchWithPython(query, maximum, signal)
      return { sources, truncated: false }
    },
  }
}

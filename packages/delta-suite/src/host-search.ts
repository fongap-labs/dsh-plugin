/**
 * In-memory-only full-text session search endpoint for DeepSeek Harness.
 *
 * Privacy & minimization invariants:
 * - Zero disk persistence, zero SQLite/cache files, zero outbound requests.
 * - Indexes only redacted human conversation text (`user/message` + `assistant/message` text blocks).
 * - Automatically strips credentials, tokens, emails, phone numbers, and OS home usernames
 *   before matching or returning snippets.
 */
import { extractConversationBlocks, scoreAndExtractSessionHit } from './delta-suite-discovery/session-search-projection.js'
import type { HostSessionSearchHit, SessionTextBlock, SessionSummary, SessionEventLike } from './delta-suite-discovery/session-search-projection.js'

export { extractConversationBlocks, scoreAndExtractSessionHit } from './delta-suite-discovery/session-search-projection.js'
export type { HostSessionSearchHit, SessionTextBlock } from './delta-suite-discovery/session-search-projection.js'

export const DELTA_SESSION_SEARCH_PATH = '/api/delta-suite/session-search'

const MAX_SCAN_SESSIONS = 120
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 60
const CORPUS_TTL_MS = 60_000
const MAX_CORPUS_ENTRIES = 60
const BUDGET_MS = 1200

export interface HostSearchResponsePayload {
  items: HostSessionSearchHit[]
  truncated: boolean
  redacted: true
}

interface CachedCorpus {
  updatedAt: number
  cachedAt: number
  title: string
  blocks: SessionTextBlock[]
}

interface SearchHostContext {
  get?(serviceName: string): unknown
  inject?(deps: string[], callback: (scope: any) => void | (() => void)): () => void
}

interface ObservationLeaseLike {
  events?: SessionEventLike[]
  header?: { title?: string; updatedAt?: number; workspaceId?: string }
  dispose?(): void
  [key: symbol]: (() => void) | undefined
}

const SYMBOL_DISPOSE = (Symbol as unknown as { dispose?: symbol }).dispose

function toTimestampMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
    const num = Number(raw)
    if (Number.isFinite(num)) return num
  }
  return 0
}

function readJsonParam(rawUrl: string): { q: string; limit: number; workspaceId?: string } {
  const qIndex = rawUrl.indexOf('?')
  const searchStr = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : ''
  const params = new Map<string, string>()
  for (const part of searchStr.split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    const k = eq >= 0 ? decodeURIComponent(part.slice(0, eq).replace(/\+/g, ' ')) : decodeURIComponent(part.replace(/\+/g, ' '))
    const v = eq >= 0 ? decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')) : ''
    params.set(k, v)
  }
  const q = (params.get('q') ?? '').trim()
  const rawLimit = Number(params.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT
  const ws = (params.get('workspaceId') ?? '').trim()
  return { q, limit, ...(ws ? { workspaceId: ws } : {}) }
}

function makeJsonResponse(payload: HostSearchResponsePayload): unknown {
  const g = globalThis as unknown as {
    Response?: new (body: string, init?: { status?: number; headers?: Record<string, string> }) => unknown
  }
  const body = JSON.stringify(payload)
  if (typeof g.Response === 'function') {
    return new g.Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
  return {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    json: async () => payload,
    text: async () => body,
  }
}

/**
 * Installs the in-memory Host session search HTTP handler (`/api/delta-suite/session-search`).
 * Returns a cleanup callback that clears the in-memory LRU cache immediately.
 */
export function installHostSessionSearch(
  ctx: SearchHostContext,
  options?: {
    isExcluded?: (sessionId: string) => boolean
    prepareExclusion?: () => Promise<unknown>
    readExclusion?: () => (sessionId: string) => boolean
    registerInvalidator?: (fn: (sessionId: string) => void) => void
  },
): () => void {
  const corpusCache = new Map<string, CachedCorpus>()
  let isDisposed = false
  options?.registerInvalidator?.((sessionId: string) => {
    if (!isDisposed) corpusCache.delete(sessionId)
  })

  // All checks use current policy, never the result of a pre-observation check
  // after an await. A malformed/unavailable policy excludes the row.
  const readExclusion = (): ((sessionId: string) => boolean) => {
    try {
      const current = options?.readExclusion?.()
      if (options?.readExclusion && typeof current !== 'function') return () => true
      return id => {
        try { return Boolean(current?.(id) || options?.isExcluded?.(id)) }
        catch { return true }
      }
    } catch { return () => true }
  }
  const isExcluded = (id: string): boolean => {
    if (!isDisposed && !readExclusion()(id)) return false
    corpusCache.delete(id)
    return true
  }
  const filterCurrent = (payload: HostSearchResponsePayload): HostSearchResponsePayload => {
    if (isDisposed) return { items: [], truncated: false, redacted: true }
    const exclude = readExclusion()
    for (const id of corpusCache.keys()) if (exclude(id)) corpusCache.delete(id)
    return { ...payload, items: payload.items.filter(hit => !exclude(hit.sessionId)) }
  }

  const getCachedOrObserve = async (summary: SessionSummary): Promise<SessionTextBlock[]> => {
    if (isExcluded(summary.sessionId)) return []
    const now = Date.now()
    const cached = corpusCache.get(summary.sessionId)
    if (cached && cached.updatedAt === summary.updatedAt && now - cached.cachedAt < CORPUS_TTL_MS) {
      // Refresh insertion order for LRU eviction.
      corpusCache.delete(summary.sessionId)
      corpusCache.set(summary.sessionId, cached)
      return cached.blocks
    }

    const sessionQuery = ctx.get?.('sessionQuery') as {
      observeSession?: (id: string, opts?: { projectionMode?: string }) => Promise<ObservationLeaseLike>
    } | undefined
    if (!sessionQuery || typeof sessionQuery.observeSession !== 'function') {
      return []
    }

    let lease: ObservationLeaseLike | undefined
    try {
      lease = await sessionQuery.observeSession(summary.sessionId, { projectionMode: 'none' })
      // A protection change during observation must not extract or cache text.
      if (isExcluded(summary.sessionId)) return []
      const blocks = extractConversationBlocks(lease?.events)
      if (corpusCache.size >= MAX_CORPUS_ENTRIES) {
        const oldestKey = corpusCache.keys().next().value
        if (oldestKey !== undefined) corpusCache.delete(oldestKey)
      }
      corpusCache.set(summary.sessionId, {
        updatedAt: summary.updatedAt,
        cachedAt: Date.now(),
        title: summary.title,
        blocks,
      })
      return blocks
    } catch {
      return []
    } finally {
      // SessionQuery's observation lease uses Symbol.dispose; call one disposer only.
      try {
        const release = SYMBOL_DISPOSE && lease ? lease[SYMBOL_DISPOSE] : undefined
        if (typeof release === 'function') release.call(lease)
        else lease?.dispose?.()
      } catch {}
    }
  }

  const listSummaries = async (workspaceFilter?: string): Promise<SessionSummary[]> => {
    const byId = new Map<string, SessionSummary>()
    const sessionQuery = ctx.get?.('sessionQuery') as {
      listSessions?: () => Promise<Array<{ header?: { id?: string; title?: string; workspaceId?: string; updatedAt?: number; createdAt?: number } }>>
    } | undefined
    if (sessionQuery && typeof sessionQuery.listSessions === 'function') {
      try {
        const records = await sessionQuery.listSessions()
        for (const rec of records ?? []) {
          const h = rec?.header
          if (!h?.id) continue
          if (workspaceFilter && h.workspaceId !== workspaceFilter) continue
          byId.set(h.id, {
            sessionId: h.id,
            title: typeof h.title === 'string' && h.title.trim() ? h.title.trim() : h.id,
            workspaceId: h.workspaceId,
            updatedAt: toTimestampMs(h.updatedAt ?? h.createdAt),
          })
        }
      } catch {
        // Fallback below
      }
    }

    const sessions = ctx.get?.('sessions') as {
      list?: () => Array<{
        id?: string
        sessionId?: string
        title?: string
        workspaceId?: string
        updatedAt?: number | string
        header?: { id?: string; title?: string; workspaceId?: string; updatedAt?: number | string }
      }>
    } | undefined
    if (sessions && typeof sessions.list === 'function') {
      try {
        for (const s of sessions.list() ?? []) {
          const id = s.id ?? s.sessionId ?? s.header?.id
          if (!id) continue
          const ws = s.workspaceId ?? s.header?.workspaceId
          if (workspaceFilter && ws !== workspaceFilter) continue
          if (!byId.has(id)) {
            const title = s.title ?? s.header?.title ?? id
            byId.set(id, {
              sessionId: id,
              title: typeof title === 'string' && title.trim() ? title.trim() : id,
              workspaceId: ws,
              updatedAt: toTimestampMs(s.updatedAt ?? s.header?.updatedAt),
            })
          }
        }
      } catch {
        // Ignore unavailable live sessions
      }
    }

    const sessionPersistence = ctx.get?.('sessionPersistence') as {
      list?: () => Promise<Array<{ id?: string; title?: string; workspaceId?: string; updatedAt?: number | string }>>
    } | undefined
    if (byId.size === 0 && sessionPersistence && typeof sessionPersistence.list === 'function') {
      try {
        for (const item of await sessionPersistence.list()) {
          if (!item?.id) continue
          if (workspaceFilter && item.workspaceId !== workspaceFilter) continue
          byId.set(item.id, {
            sessionId: item.id,
            title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : item.id,
            workspaceId: item.workspaceId,
            updatedAt: toTimestampMs(item.updatedAt),
          })
        }
      } catch {
        // Ignore unavailable persistence list
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_SCAN_SESSIONS)
  }

  const executeQuery = async (rawUrl: string): Promise<HostSearchResponsePayload> => {
    const empty = (): HostSearchResponsePayload => ({ items: [], truncated: false, redacted: true })
    if (isDisposed) return empty()
    const { q, limit, workspaceId } = readJsonParam(rawUrl)
    if (!q) return { items: [], truncated: false, redacted: true }

    // Load the durable protection state before enumerating or observing content.
    // Never search against the initial empty in-memory state of a cold store.
    try { await options?.prepareExclusion?.() } catch {
      corpusCache.clear()
      return empty()
    }
    if (isDisposed) return empty()
    filterCurrent(empty())
    const startMs = Date.now()
    const summaries = await listSummaries(workspaceId)
    if (isDisposed) return empty()
    const hits: HostSessionSearchHit[] = []
    let isTruncated = false

    for (const summary of summaries) {
      if (isDisposed) return empty()
      if (Date.now() - startMs > BUDGET_MS) {
        isTruncated = true
        break
      }
      if (isExcluded(summary.sessionId)) continue
      const blocks = await getCachedOrObserve(summary)
      if (isDisposed) return empty()
      if (isExcluded(summary.sessionId)) continue
      const hit = scoreAndExtractSessionHit(q, summary, blocks)
      if (hit) hits.push(hit)
    }

    const currentHits = filterCurrent({ items: hits, truncated: isTruncated, redacted: true }).items
    currentHits.sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt))
    if (currentHits.length > limit) {
      isTruncated = true
    }
    return {
      items: currentHits.slice(0, limit),
      truncated: isTruncated,
      redacted: true,
    }
  }

  let unregisterFetch: (() => void) | undefined
  if (typeof ctx.inject === 'function') {
    try {
      unregisterFetch = ctx.inject(['connection'], (scope: {
        connection?: {
          fetch?: {
            register?: (spec: {
              path: string
              methods?: string[]
              requestBody?: string
              fetch: (req: { url: string }) => Promise<unknown>
            }) => () => void
          }
        }
      }) => {
        if (typeof scope?.connection?.fetch?.register !== 'function') return () => {}
        return scope.connection.fetch.register({
          path: DELTA_SESSION_SEARCH_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: async (request) => {
            const payload = await executeQuery(request?.url ?? '')
            return makeJsonResponse(filterCurrent(payload))
          },
        })
      })
    } catch {
      // Optional HTTP registration
    }
  }

  return () => {
    if (isDisposed) return
    isDisposed = true
    corpusCache.clear()
    try { unregisterFetch?.() } catch {}
    unregisterFetch = undefined
  }
}

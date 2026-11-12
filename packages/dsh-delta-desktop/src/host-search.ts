/**
 * In-memory-only full-text session search endpoint for DeepSeek Harness.
 *
 * Privacy & minimization invariants:
 * - Zero disk persistence, zero SQLite/cache files, zero outbound requests.
 * - Indexes only redacted human conversation text (`user/message` + `assistant/message` text blocks).
 * - Automatically strips credentials, tokens, emails, phone numbers, and OS home usernames
 *   before matching or returning snippets.
 */
import { redactSensitiveText } from './redact.js'

export const DELTA_SESSION_SEARCH_PATH = '/api/delta-desktop/session-search'

const MAX_SCAN_SESSIONS = 120
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 60
const CORPUS_TTL_MS = 60_000
const MAX_CORPUS_ENTRIES = 60
const BUDGET_MS = 1200

export interface SessionTextBlock {
  seq: number
  turn: number
  role: 'user' | 'assistant'
  text: string
}

export interface HostSessionSearchHit {
  sessionId: string
  title: string
  snippet: string
  matchStart: number
  matchEnd: number
  seq?: number
  turn?: number
  role?: 'user' | 'assistant'
  updatedAt: number
  workspaceId?: string
  score: number
}

export interface HostSearchResponsePayload {
  items: HostSessionSearchHit[]
  truncated: boolean
  redacted: true
}

interface SessionSummary {
  sessionId: string
  title: string
  workspaceId?: string
  updatedAt: number
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

interface SessionEventLike {
  seq?: number
  type?: string
  payload?: {
    source?: { kind?: string }
    content?: Array<{ type?: string; text?: string }>
  }
}

interface ObservationLeaseLike {
  events?: SessionEventLike[]
  header?: { title?: string; updatedAt?: number; workspaceId?: string }
  dispose?(): void
  [key: symbol]: (() => void) | undefined
}

const SYMBOL_DISPOSE = (Symbol as unknown as { dispose?: symbol }).dispose

function tokenizeTerms(rawQuery: string): string[] {
  const cleaned = rawQuery.trim().replace(/\s+/g, ' ')
  if (!cleaned) return []
  const parts = cleaned.split(' ').filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    const key = part.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(part)
    if (unique.length >= 6) break
  }
  return unique
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildFlexibleMatchSpan(haystack: string, rawTerm: string): { start: number; end: number } | undefined {
  const lower = haystack.toLowerCase()
  const needle = rawTerm.toLowerCase()
  const idx = lower.indexOf(needle)
  if (idx >= 0) return { start: idx, end: idx + needle.length }
  if (rawTerm.includes(' ')) {
    const pattern = rawTerm
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegExp)
      .join('\\s+')
    if (pattern) {
      const m = new RegExp(pattern, 'i').exec(haystack)
      if (m && m.index >= 0) return { start: m.index, end: m.index + m[0].length }
    }
  }
  return undefined
}

function buildSnippetWindow(
  text: string,
  span: { start: number; end: number } | undefined,
  maxLen = 140,
): { snippet: string; matchStart: number; matchEnd: number } {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return { snippet: '', matchStart: 0, matchEnd: 0 }
  if (!span) {
    return {
      snippet: normalized.length > maxLen ? normalized.slice(0, maxLen - 1) + '…' : normalized,
      matchStart: 0,
      matchEnd: 0,
    }
  }
  // Map match range accurately onto the whitespace-collapsed string by locating the matched substring.
  const matchedRaw = text.slice(span.start, span.end).replace(/\s+/g, ' ').trim()
  const cleanSpan = matchedRaw ? buildFlexibleMatchSpan(normalized, matchedRaw) : undefined
  if (!cleanSpan) {
    return {
      snippet: normalized.length > maxLen ? normalized.slice(0, maxLen - 1) + '…' : normalized,
      matchStart: 0,
      matchEnd: 0,
    }
  }
  const half = Math.floor((maxLen - (cleanSpan.end - cleanSpan.start)) / 2)
  let start = Math.max(0, cleanSpan.start - Math.max(24, half))
  let end = Math.min(normalized.length, start + maxLen)
  if (end - start < maxLen && start > 0) {
    start = Math.max(0, end - maxLen)
  }
  const prefix = start > 0 ? '…' : ''
  const suffix = end < normalized.length ? '…' : ''
  const snippet = prefix + normalized.slice(start, end) + suffix
  const offset = prefix.length - start
  return {
    snippet,
    matchStart: cleanSpan.start + offset,
    matchEnd: cleanSpan.end + offset,
  }
}

/**
 * Extracts redacted conversation blocks from raw session log events.
 * Strictly skips internal tool/system debug dumps so raw Session Logs are never exposed.
 */
export function extractConversationBlocks(events: readonly SessionEventLike[] | undefined): SessionTextBlock[] {
  if (!Array.isArray(events)) return []
  const blocks: SessionTextBlock[] = []
  let currentTurn = 0

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    if (!ev || typeof ev !== 'object') continue
    if (ev.type === 'turn/start') {
      currentTurn += 1
      continue
    }
    const isUser = ev.type === 'user/message' && ev.payload?.source?.kind === 'user'
    const isAssistant = ev.type === 'assistant/message'
    if (!isUser && !isAssistant) continue

    const rawContent = ev.payload?.content
    const textChunks: string[] = []
    if (typeof rawContent === 'string' && rawContent.trim()) {
      textChunks.push(rawContent)
    } else if (Array.isArray(rawContent)) {
      for (const part of rawContent) {
        if (part && part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
          textChunks.push(part.text)
        }
      }
    }
    if (textChunks.length === 0) continue

    const redacted = redactSensitiveText(textChunks.join('\n')).trim()
    if (!redacted) continue

    blocks.push({
      seq: typeof ev.seq === 'number' ? ev.seq : i,
      turn: currentTurn > 0 ? currentTurn : 1,
      role: isUser ? 'user' : 'assistant',
      text: redacted,
    })
  }
  return blocks
}

/**
 * Scores a session's title + redacted blocks against a query and produces a redacted hit if matched.
 */
export function scoreAndExtractSessionHit(
  rawQuery: string,
  meta: SessionSummary,
  blocks: readonly SessionTextBlock[],
): HostSessionSearchHit | undefined {
  const trimmedQuery = rawQuery.trim()
  if (!trimmedQuery) return undefined
  const terms = tokenizeTerms(trimmedQuery)
  if (terms.length === 0) return undefined

  const safeTitle = redactSensitiveText(meta.title || meta.sessionId)
  const safeTitleLower = safeTitle.toLowerCase()
  const fullPhraseMatchedInTitle = buildFlexibleMatchSpan(safeTitle, trimmedQuery) !== undefined
  const allTermsInTitle = terms.every(term => safeTitleLower.includes(term.toLowerCase()))

  let bestBlock: { block: SessionTextBlock; span: { start: number; end: number }; score: number } | undefined
  for (const block of blocks) {
    const lower = block.text.toLowerCase()
    const fullSpan = buildFlexibleMatchSpan(block.text, trimmedQuery)
    const allInBlock = terms.every(term => lower.includes(term.toLowerCase()))
    const matchedTermCount = terms.filter(term => lower.includes(term.toLowerCase())).length
    if (!fullSpan && !allInBlock && matchedTermCount === 0) continue

    let span = fullSpan
    if (!span) {
      for (const term of terms) {
        const s = buildFlexibleMatchSpan(block.text, term)
        if (s && (!span || s.start < span.start)) span = s
      }
    }
    if (!span) continue

    const score =
      (fullSpan ? 120 : 0) +
      (allInBlock ? 80 : matchedTermCount * 20) +
      (block.role === 'user' ? 10 : 5)
    if (!bestBlock || score > bestBlock.score) {
      bestBlock = { block, span, score }
    }
  }

  // Require all query terms to be satisfied across (title + combined blocks) so multi-term queries stay precise.
  const combinedAllText = safeTitleLower + '\n' + blocks.map(b => b.text.toLowerCase()).join('\n')
  const allSatisfiedAcrossSession = terms.every(term => combinedAllText.includes(term.toLowerCase()))
  if (!allSatisfiedAcrossSession && !fullPhraseMatchedInTitle) return undefined

  if (bestBlock && (bestBlock.score >= 80 || !allTermsInTitle)) {
    const win = buildSnippetWindow(bestBlock.block.text, bestBlock.span)
    return {
      sessionId: meta.sessionId,
      title: safeTitle,
      snippet: win.snippet,
      matchStart: win.matchStart,
      matchEnd: win.matchEnd,
      seq: bestBlock.block.seq,
      turn: bestBlock.block.turn,
      role: bestBlock.block.role,
      updatedAt: meta.updatedAt,
      workspaceId: meta.workspaceId,
      score: bestBlock.score + (allTermsInTitle ? 60 : 0),
    }
  }

  if (allTermsInTitle || fullPhraseMatchedInTitle) {
    const titleSpan = buildFlexibleMatchSpan(safeTitle, trimmedQuery) ?? buildFlexibleMatchSpan(safeTitle, terms[0])
    const fallbackPreview = blocks[0]?.text
    const win = fallbackPreview
      ? buildSnippetWindow(fallbackPreview, undefined)
      : buildSnippetWindow(safeTitle, titleSpan)
    return {
      sessionId: meta.sessionId,
      title: safeTitle,
      snippet: win.snippet,
      matchStart: fallbackPreview ? 0 : win.matchStart,
      matchEnd: fallbackPreview ? 0 : win.matchEnd,
      seq: blocks[0]?.seq,
      turn: blocks[0]?.turn,
      role: blocks[0]?.role,
      updatedAt: meta.updatedAt,
      workspaceId: meta.workspaceId,
      score: fullPhraseMatchedInTitle ? 110 : 90,
    }
  }

  return undefined
}

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
 * Installs the in-memory Host session search HTTP handler (`/api/delta-desktop/session-search`).
 * Returns a cleanup callback that clears the in-memory LRU cache immediately.
 */
export function installHostSessionSearch(
  ctx: SearchHostContext,
  options?: {
    isExcluded?: (sessionId: string) => boolean
    registerInvalidator?: (fn: (sessionId: string) => void) => void
  },
): () => void {
  const corpusCache = new Map<string, CachedCorpus>()
  options?.registerInvalidator?.((sessionId: string) => {
    corpusCache.delete(sessionId)
  })

  const getCachedOrObserve = async (summary: SessionSummary): Promise<SessionTextBlock[]> => {
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
      try { lease?.dispose?.() } catch {}
      try { if (SYMBOL_DISPOSE && lease) lease[SYMBOL_DISPOSE]?.() } catch {}
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
    const { q, limit, workspaceId } = readJsonParam(rawUrl)
    if (!q) return { items: [], truncated: false, redacted: true }

    const startMs = Date.now()
    const summaries = await listSummaries(workspaceId)
    const hits: HostSessionSearchHit[] = []
    let isTruncated = false

    for (const summary of summaries) {
      if (Date.now() - startMs > BUDGET_MS) {
        isTruncated = true
        break
      }
      if (options?.isExcluded?.(summary.sessionId)) {
        corpusCache.delete(summary.sessionId)
        continue
      }
      const blocks = await getCachedOrObserve(summary)
      const hit = scoreAndExtractSessionHit(q, summary, blocks)
      if (hit) hits.push(hit)
    }

    hits.sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt))
    if (hits.length > limit) {
      isTruncated = true
    }
    return {
      items: hits.slice(0, limit),
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
            return makeJsonResponse(payload)
          },
        })
      })
    } catch {
      // Optional HTTP registration
    }
  }

  return () => {
    corpusCache.clear()
    try { unregisterFetch?.() } catch {}
    unregisterFetch = undefined
  }
}

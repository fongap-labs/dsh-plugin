/** Pure, redacted session search projection. No Host service access or persistence. */
import { redactSensitiveText } from '../redact.js'

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

export interface SessionSummary {
  sessionId: string
  title: string
  workspaceId?: string
  updatedAt: number
}

export interface SessionEventLike {
  seq?: number
  type?: string
  payload?: {
    source?: { kind?: string }
    content?: Array<{ type?: string; text?: string }>
  }
}

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

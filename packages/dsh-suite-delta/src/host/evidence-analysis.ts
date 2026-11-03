/**
 * Deterministic evidence organization. This never declares a claim "verified":
 * two pages can copy the same mistake. Preserve source URLs for inspection.
 */
import type { Evidence } from './research-fetch.js'

export interface Passage {
  source: string
  title: string
  publishedAt?: string
  text: string
  relevance: number
  part: number
}
export interface CrossSourceMatch {
  sources: [string, string]
  excerpt: string
  type: 'shared-statement'
}
export interface EvidenceDigest {
  sources: number
  passages: Passage[]
  crossSourceMatches: CrossSourceMatch[]
  warnings: string[]
}

const uniqueTerms = (query: string): string[] =>
  [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 24))]
const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim()
const scoreText = (text: string, terms: readonly string[]): number => {
  const lower = text.toLocaleLowerCase()
  return terms.reduce((score, term) => score + (lower.includes(term) ? Math.min(5, Math.max(1, term.length / 3)) : 0), 0)
}

/** Chunk on paragraph/sentence boundaries without losing the long-form source text. */
export function chunkArticle(text: string, maxChars = 2500, overlap = 160): string[] {
  const cap = Math.min(6000, Math.max(500, maxChars))
  const windowOverlap = Math.min(Math.max(0, overlap), Math.floor(cap / 4))
  const paragraphs = text.replace(/\r/g, '').split(/\n{2,}/).map(normalize).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = windowOverlap ? current.slice(-windowOverlap).trim() : ''
  }
  for (const paragraph of paragraphs) {
    if (paragraph.length <= cap) {
      if (current && current.length + paragraph.length + 2 > cap) flush()
      current = current ? current + '\n\n' + paragraph : paragraph
      continue
    }
    if (current) { chunks.push(current); current = '' }
    let start = 0
    while (start < paragraph.length) {
      const end = Math.min(paragraph.length, start + cap)
      let cut = end
      if (end < paragraph.length) {
        const punctuation = Math.max(paragraph.lastIndexOf('。', end), paragraph.lastIndexOf('. ', end), paragraph.lastIndexOf('；', end))
        if (punctuation > start + cap / 2) cut = Math.min(end, punctuation + 1)
      }
      chunks.push(paragraph.slice(start, cut).trim())
      if (cut >= paragraph.length) break
      start = Math.max(start + 1, cut - windowOverlap)
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.filter(Boolean)
}

/** Diverse, source-linked excerpts; preserve source order for reproducibility. */
export function digestEvidence(query: string, evidence: readonly Evidence[], maxPassages = 12): EvidenceDigest {
  const terms = uniqueTerms(query)
  const selected: Passage[] = []
  const warnings: string[] = []
  const all = evidence.map(item => ({
    evidence: item,
    chunks: chunkArticle(item.excerpt, 2200, 100),
  }))
  for (const item of all) {
    if (item.evidence.truncated) warnings.push(item.evidence.url + ': page data may be incomplete')
    const ranked = item.chunks.map((chunk, part) => ({
      source: item.evidence.url, title: item.evidence.title, publishedAt: item.evidence.publishedAt,
      text: chunk, relevance: scoreText(chunk, terms), part,
    })).sort((a, b) => b.relevance - a.relevance || a.part - b.part)
    // Keep at least one passage per page rather than letting one long article crowd out others.
    selected.push(...ranked.slice(0, 2))
  }
  const passages = selected.sort((a, b) => b.relevance - a.relevance || a.source.localeCompare(b.source))
    .slice(0, Math.min(24, Math.max(1, maxPassages)))
  const statements = all.map(item => {
    const sentences = item.evidence.excerpt.split(/(?<=[。！？.!?])\s+|(?<=[。！？])/u)
      .map(normalize).filter(sentence => sentence.length >= 45 && sentence.length <= 350)
    return { url: item.evidence.url, sentences }
  })
  const crossSourceMatches: CrossSourceMatch[] = []
  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      const a = statements[i]!
      const b = statements[j]!
      const bSet = new Set(b.sentences.map(s => s.toLocaleLowerCase()))
      const matched = a.sentences.find(s => bSet.has(s.toLocaleLowerCase()))
      if (matched) crossSourceMatches.push({
        sources: [a.url, b.url], excerpt: matched.slice(0, 250), type: 'shared-statement',
      })
      if (crossSourceMatches.length >= 10) break
    }
    if (crossSourceMatches.length >= 10) break
  }
  if (evidence.length < 2) warnings.push('Fewer than two readable independent sources; cross-check unavailable')
  if (crossSourceMatches.length) warnings.push('Matching text across sources does not prove independent confirmation')
  return { sources: evidence.length, passages, crossSourceMatches, warnings }
}

/**
 * Bounded, deterministic normalization shared by native and assisted research.
 * Search results are untrusted evidence pointers, not instructions.
 */
export interface SearchRow {
  title: string
  url: string
  content: string
}

const trackingKeys = /^(utm_[a-z0-9_]+|fbclid|gclid|msclkid|ref_src)$/i

export function normalizeSearchUrl(input: string): string | null {
  try {
    const url = new URL(input)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    if (!url.hostname || url.hostname.length > 253) return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (trackingKeys.test(key)) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return null
  }
}

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

export function safeResults(rows: readonly SearchRow[], maxResults = 5, snippetChars = 500): SearchRow[] {
  const seen = new Set<string>()
  const output: SearchRow[] = []
  const cap = Math.max(1, Math.min(20, Math.trunc(maxResults) || 5))
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const url = normalizeSearchUrl(String(row.url || ''))
    if (!url || seen.has(url)) continue
    seen.add(url)
    output.push({
      title: collapse(String(row.title || '')).slice(0, 300),
      url,
      content: collapse(String(row.content || '')).slice(0, Math.max(100, Math.min(2000, snippetChars))),
    })
    if (output.length >= cap) break
  }
  return output
}

const keywords = (query: string): string[] =>
  [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 18))]

export function rankResults(query: string, rows: readonly SearchRow[], limit = 10): SearchRow[] {
  const terms = keywords(query)
  const searched = safeResults(rows, 20, 1500)
  return searched.map((row, index) => {
    const title = row.title.toLocaleLowerCase()
    const body = row.content.toLocaleLowerCase()
    let points = 0
    for (const term of terms) {
      if (title.includes(term)) points += 4
      if (body.includes(term)) points += 1
    }
    if (title.includes(query.trim().toLocaleLowerCase())) points += 8
    return { row, index, points }
  }).sort((a, b) => b.points - a.points || a.index - b.index)
    .slice(0, Math.max(1, Math.min(20, limit))).map(item => item.row)
}

/**
 * Add a maximum of two literal subqueries, never hallucinated synonyms.
 * The full user query is always sent first.
 */
export function researchQueries(query: string): string[] {
  const full = collapse(query).slice(0, 500)
  if (!full) return []
  const sections = full.split(/\s+(?:vs\.?|versus|or|and)\s+|[\uFF1B;\uFF0C,\u3001]|\s*\u5BF9\u6BD4\s*|\s*\u6BD4\u8F83\s*/i)
    .map(part => part.trim()).filter(part => part.length >= 3 && part !== full)
  if (sections.length < 2 && full.length > 75) {
    const tokens = full.split(/\s+/)
    if (tokens.length >= 8) {
      const middle = Math.ceil(tokens.length / 2)
      sections.push(tokens.slice(0, middle).join(' '), tokens.slice(middle).join(' '))
    }
  }
  return [full, ...new Set(sections)].slice(0, 3)
}

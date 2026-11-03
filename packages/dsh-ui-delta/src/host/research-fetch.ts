/**
 * Assisted research reuses Host Web Fetch and disallows private destinations.
 * Native HTTP fetch does not itself block local-network addresses.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { normalizeSearchUrl, type SearchRow } from './search-quality.js'

export interface HostFetchResult {
  url: string
  statusCode: number
  body: { kind: 'html' | 'text'; content: string }
  truncated: boolean
}
export type HostFetch = (request: { url: string }, signal?: AbortSignal) => Promise<HostFetchResult>
export interface Evidence {
  url: string
  title: string
  excerpt: string
  publishedAt?: string
  truncated: boolean
}
export interface ResearchEvidence { evidence: Evidence[]; failures: string[] }

const privateV4 = (value: string): boolean => {
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b, c] = parts
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
}
export function isPublicAddress(value: string): boolean {
  const version = isIP(value)
  if (version === 4) return !privateV4(value)
  if (version !== 6) return false
  const ip = value.toLowerCase()
  if (ip.includes('.')) return false
  const first = Number.parseInt(ip.split(':')[0] || '0', 16)
  return first >= 0x2000 && first < 0x4000 && !ip.startsWith('2001:db8:')
}

export async function assertPublicResearchUrl(
  raw: string, resolve: typeof lookup = lookup
): Promise<string> {
  const normalized = normalizeSearchUrl(raw)
  if (!normalized) throw Error('invalid public URL')
  const url = new URL(normalized)
  if (url.protocol !== 'https:' || (url.port && url.port !== '443')) {
    throw Error('research supports public HTTPS only')
  }
  const host = url.hostname.toLowerCase()
  if (host.length > 253 || isIP(host) !== 0 ||
    !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) {
    throw Error('research target is not a public domain')
  }
  const addresses = await resolve(host, { all: true })
  if (!Array.isArray(addresses) || !addresses.length ||
    addresses.some(address => !isPublicAddress(address.address))) {
    throw Error('research target resolves to a non-public address')
  }
  return normalized
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    const key = code.toLowerCase()
    if (!key.startsWith('#')) return named[key] ?? match
    const number = key.startsWith('#x') ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10)
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff &&
      !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ''
  })
}
const attr = (html: string, name: string): string | undefined => {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]+)"|\\x27([^\\x27]+)\\x27)', 'i')
  const match = re.exec(html)
  return match ? decodeEntities(match[1] || match[2] || '').trim() : undefined
}
function publishedDate(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const property = attr(tag, 'property') || attr(tag, 'name') || ''
    if (/^(?:article:published_time|datePublished|date|pubdate)$/i.test(property)) {
      const date = attr(tag, 'content')
      if (date && /^\d{4}-\d{2}-\d{2}/.test(date) && !Number.isNaN(Date.parse(date))) return date.slice(0, 35)
    }
  }
  const time = /<time\b[^>]*>/i.exec(html)?.[0]
  const value = time ? attr(time, 'datetime') : undefined
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))
    ? value.slice(0, 35) : undefined
}
export function extractReadablePage(
  html: string, kind: 'html' | 'text', limit = 80_000
): { title?: string; text: string; publishedAt?: string } {
  const cap = Math.max(100, Math.min(100_000, limit))
  if (kind === 'text') return { text: html.replace(/\s+/g, ' ').trim().slice(0, cap) }
  const rawTitle = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const title = rawTitle ? decodeEntities(rawTitle.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim().slice(0, 300) : undefined
  const publishedAt = publishedDate(html)
  const article = /<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i.exec(html)?.[1]
  const chosen = article && article.length > 200 ? article : html
  const text = decodeEntities(chosen
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(?:script|style|noscript|svg|template|form|nav|footer|header|aside|iframe|button|dialog)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript|svg|template|form|nav|footer|header)\s*>/gi, ' ')
    .replace(/<\/(?:p|h[1-6]|div|li|tr|section|br)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
  ).replace(/[ \t]+/g, ' ').replace(/\n[\s\n]+/g, '\n').trim().slice(0, cap)
  return { title, text, ...(publishedAt ? { publishedAt } : {}) }
}

export async function collectEvidence(
  rows: readonly SearchRow[], fetchPage: HostFetch | undefined,
  signal?: AbortSignal, maxPages = 3,
  validate: typeof assertPublicResearchUrl = assertPublicResearchUrl
): Promise<ResearchEvidence> {
  const evidence: Evidence[] = []
  const failures: string[] = []
  if (!fetchPage) return { evidence, failures: ['Host Web Fetch service is not available'] }
  for (const row of rows.slice(0, Math.min(8, Math.max(0, maxPages)))) {
    signal?.throwIfAborted()
    try {
      const url = await validate(row.url)
      const response = await fetchPage({ url }, AbortSignal.any([
        AbortSignal.timeout(12_000), ...(signal ? [signal] : []),
      ]))
      if (response.statusCode < 200 || response.statusCode >= 300 ||
          (response.body.kind !== 'html' && response.body.kind !== 'text')) {
        throw Error('page status or content type is not readable')
      }
      const finalUrl = await validate(response.url)
      if (new URL(finalUrl).origin !== new URL(url).origin) throw Error('cross-origin redirect refused')
      const page = extractReadablePage(response.body.content, response.body.kind)
      if (page.text.length < 60) throw Error('insufficient readable page text')
      evidence.push({
        url: finalUrl,
        title: page.title || row.title,
        excerpt: page.text,
        truncated: response.truncated || page.text.length >= 80_000,
        ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
      })
    } catch (error) {
      signal?.throwIfAborted()
      failures.push(row.url + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }
  return { evidence, failures }
}

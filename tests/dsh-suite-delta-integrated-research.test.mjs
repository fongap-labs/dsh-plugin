import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  PUBLIC_SEARCH_INSTANCES, clearPublicSearchHealth, searchPublicInstances, searchSearxng,
} from '../packages/dsh-suite-delta/lib/host/searxng.js'
import { chunkArticle, digestEvidence } from '../packages/dsh-suite-delta/lib/host/evidence-analysis.js'

afterEach(() => clearPublicSearchHealth())
describe('embedded free search providers', () => {
  it('uses the SearXNG JSON API without inventing results', async () => {
    const calls = []
    const rows = await searchSearxng(PUBLIC_SEARCH_INSTANCES[0], 'drug stability', 5, undefined, async (url, init) => {
      calls.push({ url: String(url), init })
      return Response.json({ results: [
        { title: 'A', url: 'https://example.com/article?utm_source=test', content: 'Summary' },
        { title: 'Duplicate', url: 'https://example.com/article', content: 'Other' },
      ] })
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].url, 'https://example.com/article')
    assert.match(calls[0].url, /format=json/)
    assert.match(calls[0].url, /q=drug\+stability/)
    assert.equal(calls[0].init.redirect, 'error')
  })

  it('rejects unapproved search hosts', async () => {
    await assert.rejects(() => searchSearxng('https://attacker.example', 'test'), /allowlist/)
  })

  it('fails over 429 and empty results without reusing a cooled-down endpoint', async () => {
    const calls = []
    const request = async (url) => {
      const host = new URL(url).origin
      calls.push(host)
      if (host === PUBLIC_SEARCH_INSTANCES[0]) return new Response('', { status: 429 })
      if (host === PUBLIC_SEARCH_INSTANCES[1]) return Response.json({ results: [] })
      return Response.json({ results: [{ title: 'Found', url: 'https://example.com/found', content: 'ok' }] })
    }
    const first = await searchPublicInstances('some query', 5, undefined, request)
    assert.equal(first.results.length, 1)
    assert.equal(first.source, PUBLIC_SEARCH_INSTANCES[2])
    assert.equal(calls.length, 3)
    const second = await searchPublicInstances('another query', 5, undefined, request)
    assert.equal(second.results.length, 1)
    assert.equal(calls.filter(x => x === PUBLIC_SEARCH_INSTANCES[0]).length, 1)
  })

  it('rejects oversized responses', async () => {
    const huge = '{"results":"' + 'x'.repeat(800_000) + '"}'
    await assert.rejects(() => searchSearxng(PUBLIC_SEARCH_INSTANCES[0], 'query', 5, undefined,
      async () => new Response(huge, { headers: { 'content-type': 'application/json' } })), /exceeds limit/)
  })
})

describe('long article source-linked digest', () => {
  it('chunks long articles without dropping the ending', () => {
    const text = 'A'.repeat(5300) + '\n\n' + 'Final documented recommendation.'
    const chunks = chunkArticle(text, 1200, 80)
    assert.ok(chunks.length > 4)
    assert.ok(chunks.some(x => x.includes('Final documented recommendation.')))
  })

  it('keeps relevant passages from more than one source', () => {
    const result = digestEvidence('quality stability', [
      { title: 'Source A', url: 'https://a.example', excerpt: 'Quality stability study was conducted. '.repeat(80), truncated: false },
      { title: 'Source B', url: 'https://b.example', excerpt: 'Another perspective on quality stability. '.repeat(80), truncated: false },
    ])
    assert.equal(result.sources, 2)
    assert.deepEqual([...new Set(result.passages.map(x => x.source))].sort(), ['https://a.example', 'https://b.example'])
  })

  it('marks repeated source statements as matches, not verified claims', () => {
    const common = 'This published study describes several independent process validation batches under controlled conditions.'
    const result = digestEvidence('validation', [
      { title: 'A', url: 'https://a.example', excerpt: common + ' More context.', truncated: false },
      { title: 'B', url: 'https://b.example', excerpt: common + ' Other context.', truncated: false },
    ])
    assert.equal(result.crossSourceMatches.length, 1)
    assert.equal(result.crossSourceMatches[0].type, 'shared-statement')
    assert.match(result.warnings.join(' '), /does not prove independent confirmation/)
  })
})

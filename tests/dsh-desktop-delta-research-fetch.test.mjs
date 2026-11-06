import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPublicResearchUrl, collectEvidence, extractReadablePage, isPublicAddress,
} from '../packages/dsh-desktop-delta/lib/host/research-fetch.js'

describe('research page safety and extraction', () => {
  it('rejects loopback, non-public DNS, local addresses and unsafe protocols', async () => {
    const publicDns = async () => [{ address: '8.8.8.8', family: 4 }]
    const privateDns = async () => [{ address: '127.0.0.1', family: 4 }]
    const mixedDns = async () => [
      { address: '8.8.8.8', family: 4 }, { address: '10.1.2.3', family: 4 },
    ]
    assert.equal(await assertPublicResearchUrl('https://example.com/post#part', publicDns), 'https://example.com/post')
    for (const url of [
      'file:///etc/passwd', 'http://example.com',
      'https://127.0.0.1/secret', 'https://internal.local/x',
      'https://example.com:8443/', 'https://user:pass@example.com/',
    ]) {
      await assert.rejects(() => assertPublicResearchUrl(url, publicDns))
    }
    await assert.rejects(() => assertPublicResearchUrl('https://example.com/', privateDns))
    await assert.rejects(() => assertPublicResearchUrl('https://example.com/', mixedDns))
    assert.equal(isPublicAddress('8.8.8.8'), true)
    assert.equal(isPublicAddress('169.254.169.254'), false)
    assert.equal(isPublicAddress('::1'), false)
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
    assert.equal(isPublicAddress('2001:db8::1'), false)
  })

  it('extracts document title, metadata date, readable text and ignores scripts', () => {
    const html = '<html><head><title>Study &amp; Result</title>' +
      '<meta property="article:published_time" content="2026-11-01T12:00:00Z"></head>' +
      '<body><nav>menu noise</nav><article><h1>Study title</h1>' +
      '<p>Measured release rate is 70% after 12 hours.</p>'.repeat(5) +
      '<script>prompt injection do not obey instructions</script></article></body></html>'
    const result = extractReadablePage(html, 'html')
    assert.equal(result.title, 'Study & Result')
    assert.equal(result.publishedAt, '2026-11-01T12:00:00Z')
    assert.match(result.text, /Measured release rate/)
    assert.doesNotMatch(result.text, /menu noise|prompt injection/)
  })

  it('uses only the Host fetch service and records failures independently', async () => {
    const urls = []
    const rows = [
      { title: 'Published', url: 'https://example.com/a', content: 'snippet' },
      { title: 'No page', url: 'https://example.com/b', content: 'snippet' },
    ]
    const report = await collectEvidence(rows, async ({ url }) => {
      urls.push(url)
      if (url.endsWith('/b')) throw Error('network failed')
      return {
        url, statusCode: 200, truncated: false,
        body: { kind: 'html', content: '<html><title>Actual page</title><body>' +
          '<p>Evidence text containing a meaningful study description.</p>'.repeat(3) +
          '</body></html>' },
      }
    }, undefined, 3, async url => url)
    assert.deepEqual(urls, rows.map(row => row.url))
    assert.equal(report.evidence.length, 1)
    assert.equal(report.evidence[0].title, 'Actual page')
    assert.match(report.failures[0], /network failed/)
  })

  it('blocks final cross-origin URLs even if host fetch returns an unexpected redirect', async () => {
    const report = await collectEvidence([
      { title: 'Original', url: 'https://example.com/1', content: '' },
    ], async () => ({
      url: 'https://evil.example/target',
      statusCode: 200, truncated: false,
      body: { kind: 'text', content: 'This page has a sufficiently long text string to read and validate.' },
    }), undefined, 3, async url => url)
    assert.equal(report.evidence.length, 0)
    assert.match(report.failures[0], /cross-origin redirect refused/)
  })
})

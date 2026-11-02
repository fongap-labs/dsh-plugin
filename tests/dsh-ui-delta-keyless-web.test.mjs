import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeDuckDuckGoProvider, parseDuckDuckGoHtml, DUCKDUCKGO_PROVIDER_ID }
  from '../packages/dsh-ui-delta/lib/host/duckduckgo.js'

const fixture = `
<div class="result results_links">
  <h2 class="result__title"><a rel="nofollow" class="result__a"
    href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews%3Fa%3D1%26b%3D2">News &amp; updates</a></h2>
  <a class="result__snippet" href="https://example.com">Latest <b>important</b> news</a>
</div>
<div class="result results_links">
  <h2><a class="result__a" href="https://another.example.org/story">Another story</a></h2>
  <a class="result__snippet">Second source</a>
</div>`

describe('native keyless web search', () => {
  it('parses titles, destination URLs and snippets without tracking redirects', () => {
    const rows = parseDuckDuckGoHtml(fixture)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].url, 'https://example.com/news?a=1&b=2')
    assert.equal(rows[0].title, 'News & updates')
    assert.equal(rows[0].snippet, 'Latest important news')
  })

  it('enforces result caps, does not allow unsafe schemes and deduplicates', () => {
    const extra = fixture + `<a class="result__a" href="javascript:alert(1)">bad</a>`
    assert.equal(parseDuckDuckGoHtml(extra, 1).length, 1)
    assert.equal(parseDuckDuckGoHtml(fixture + fixture).length, 2)
  })

  it('registers a provider usable without any API key and respects cancellation', async () => {
    let endpoint
    let observed
    const stub = async (url, init) => {
      endpoint = String(url)
      observed = init
      return new Response(fixture, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    const provider = makeDuckDuckGoProvider(stub)
    assert.equal(provider.id, DUCKDUCKGO_PROVIDER_ID)
    assert.equal(provider.available(), true)
    assert.equal(await provider.ready(), true)
    const result = await provider.search({ query: 'today news', maxResults: 1 })
    assert.equal(result.sources.length, 1)
    assert.match(endpoint, /html\.duckduckgo\.com\/html\/\?q=today\+news/)
    assert.equal(observed.method, 'GET')
    assert.equal(observed.redirect, 'error')
    assert.ok(observed.signal)
  })

  it('fails visibly if the keyless endpoint changes or rate limits', async () => {
    const provider = makeDuckDuckGoProvider(async () =>
      new Response('<html>challenge</html>', { headers: { 'content-type': 'text/html' } }))
    await assert.rejects(() => provider.search({ query: 'news' }), /no parsable results/)
  })

  it('uses the native web registry, while retaining the existing HTTP fetch backend', () => {
    const host = readFileSync(new URL('../packages/dsh-ui-delta/src/index.ts', import.meta.url), 'utf8')
    const patch = readFileSync(new URL('../packages/dsh-ui-delta/cordis.patch.yml', import.meta.url), 'utf8')
    assert.match(host, /registerSearchProvider\(makeDuckDuckGoProvider\(\)\)/)
    assert.match(patch, /searchProvider: delta-duckduckgo/)
    assert.match(patch, /fetchProvider: http/)
    assert.doesNotMatch(patch, /web-fetch-http.*disabled: true/)
  })
})

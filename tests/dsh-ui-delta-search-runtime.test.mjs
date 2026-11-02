import { it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { searchBingRss, searchWeb } from '../packages/dsh-ui-delta/lib/host/search.js'
import { apply } from '../packages/dsh-ui-delta/lib/index.js'
const rss = '<rss><channel><item><title>News &amp; updates</title><link>https://example.com/story</link><description>Today</description></item></channel></rss>'
afterEach(() => { mock.restoreAll(); syncBuiltinESMExports() })
function config(value = {}) {
  const original = fs.readFileSync
  mock.method(fs, 'readFileSync', (path, ...args) => String(path).endsWith('config.json') ? JSON.stringify(value) : original(path, ...args))
  syncBuiltinESMExports()
}
it('follows Bing region redirects but refuses foreign or looping redirects', async () => {
  const urls = []
  const rows = await searchBingRss('news', async url => {
    urls.push(String(url))
    return urls.length === 1 ? new Response(null, { status: 302, headers: { location: 'https://cn.bing.com/search?format=rss&q=news' } }) : new Response(rss)
  })
  assert.equal(urls.length, 2)
  assert.equal(rows[0].title, 'News & updates')
  await assert.rejects(() => searchBingRss('news', async () => new Response(null, { status: 302, headers: { location: 'http://localhost/private' } })), /unexpected redirect/)
  await assert.rejects(() => searchBingRss('news', async () => new Response(null, { status: 302, headers: { location: 'https://cn.bing.com/search' } })), /redirect limit/)
})
it('shares default HTTP search between native model tools and the slash route', async () => {
  config()
  const calls = []
  mock.method(globalThis, 'fetch', async url => { calls.push(String(url)); return new Response(rss) })
  let provider
  const routes = new Map()
  apply({ webServer: { register: route => routes.set(route.path, route) }, inject: (names, callback) => {
    if (names.length === 1 && names[0] === 'web') callback({ web: { registerSearchProvider: value => { provider = value } } })
  } })
  assert.equal(provider.id, 'delta-duckduckgo')
  const native = await provider.search({ query: 'news' })
  let status, result
  await routes.get('/dsh-ui-delta/search').handler({ method: 'POST', headers: { host: 'localhost:3000' },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{"query":"news"}') },
  }, { writeHead: code => { status = code }, end: body => { result = JSON.parse(body) } })
  assert.equal(status, 200)
  assert.equal(native.sources[0].url, result.results[0].url)
  assert.equal(calls.length, 2)
  assert.ok(calls.every(url => url.startsWith('https://www.bing.com/search')))
})
it('falls back to HTML without Python and reports exhausted sources', async () => {
  config()
  mock.method(globalThis, 'fetch', async url => String(url).includes('bing.com') ? new Response('', { status: 503 })
    : new Response('<a class="result__a" href="https://example.com/ddg">Result</a>', { headers: { 'content-type': 'text/html' } }))
  assert.equal((await searchWeb('news'))[0].url, 'https://example.com/ddg')
  mock.method(globalThis, 'fetch', async () => { throw new Error('fetch failed') })
  await assert.rejects(() => searchWeb('news'), error => error.code === 'KEYLESS_SEARCH_UNAVAILABLE' && /Bing RSS/.test(error.message) && /DuckDuckGo/.test(error.message))
})
it('honors independent providers and cancellation without fallback', async () => {
  config({ search: { providers: [{ id: 'custom', active: true, endpoint: 'https://search.example/query' }] } })
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://search.example/query')
    assert.equal(JSON.parse(init.body).query, 'news')
    return Response.json({ results: [{ title: 'Result', url: 'https://example.com', content: 'summary' }] })
  })
  assert.equal((await searchWeb('news')).length, 1)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => searchWeb('news', controller.signal), { name: 'AbortError' })
})

import { it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { searchWeb } from '../packages/dsh-suite-delta/lib/host/search.js'
import { apply } from '../packages/dsh-suite-delta/lib/index.js'

afterEach(() => { mock.restoreAll(); syncBuiltinESMExports() })
function config(value = {}) {
  const original = fs.readFileSync
  mock.method(fs, 'readFileSync', (path, ...args) => String(path).endsWith('config.json') ? JSON.stringify(value) : original(path, ...args))
  syncBuiltinESMExports()
}
it('uses Python ddgs results, normalizes URLs and limits untrusted content', async () => {
  config()
  const calls = []
  const hits = await searchWeb('news', undefined, async query => {
    calls.push(query)
    return [
      { title: 'A', url: 'https://example.com/a', content: 'a'.repeat(900) },
      { title: 'unsafe', url: 'file:///etc/passwd', content: 'reject' },
      { title: 'B', url: 'https://example.com/b', content: 'b' },
    ]
  }, 5, async () => ({ results: [], source: '', failures: ['public sources unavailable'] }))
  assert.deepEqual(calls, ['news'])
  assert.equal(hits.length, 2)
  assert.equal(hits[0].content.length, 500)
  assert.equal(hits[1].url, 'https://example.com/b')
})
it('registers the Python-backed provider for native Harness web_search', () => {
  let provider
  const routes = new Map()
  apply({ webServer: { register: route => routes.set(route.path, route) }, inject: (names, callback) => {
    if (names.length === 1 && names[0] === 'web') callback({ web: { registerSearchProvider: value => { provider = value } } })
  } })
  assert.equal(provider.id, 'delta-duckduckgo')
  assert.equal(provider.available(), true)
  assert.ok(routes.has('/dsh-ui-delta/search'))
})
it('does not hide missing Python/ddgs or service failures behind fabricated results', async () => {
  config()
  await assert.rejects(() => searchWeb('news', undefined, async () => {
    throw new Error('Python ddgs is unavailable: install ddgs')
  }, 5, async () => ({ results: [], source: '', failures: ['public nodes unavailable'] })),
    error => error.code === 'KEYLESS_SEARCH_UNAVAILABLE' && /Python ddgs/.test(error.message))
})
it('respects the configured independent provider without invoking Python ddgs', async () => {
  config({ search: { providers: [{ id: 'custom', active: true, endpoint: 'https://search.example/query' }] } })
  mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://search.example/query')
    assert.equal(JSON.parse(init.body).query, 'news')
    return Response.json({ results: [{ title: 'Result', url: 'https://example.com', content: 'summary' }] })
  })
  const hits = await searchWeb('news', undefined, async () => { throw new Error('should not run Python') })
  assert.equal(hits.length, 1)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => searchWeb('news', controller.signal), { name: 'AbortError' })
})


it('retries transient failures and switches only among configured endpoints', async () => {
  config({ search: { providers: [
    { id: 'primary', active: true, endpoint: 'https://search.example/primary' },
    { id: 'secondary', active: false, endpoint: 'https://search.example/secondary' },
  ] } })
  const calls = []
  mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url))
    if (String(url).endsWith('/primary')) return new Response('busy', { status: 503 })
    return Response.json({ results: [{ title: 'Fallback source', url: 'https://example.com/a', content: 'ok' }] })
  })
  const hits = await searchWeb('news', undefined, async () => { throw Error('not approved for keyless fallback') })
  assert.equal(hits.length, 1)
  assert.equal(calls.filter(url => url.endsWith('/primary')).length, 2)
  assert.equal(calls.filter(url => url.endsWith('/secondary')).length, 1)
})

it('does not switch provider on authentication failure', async () => {
  config({ search: { providers: [
    { id: 'primary', active: true, endpoint: 'https://search.example/primary' },
    { id: 'secondary', active: false, endpoint: 'https://search.example/secondary' },
  ] } })
  let count = 0
  mock.method(globalThis, 'fetch', async () => { count++; return new Response('bad key', { status: 401 }) })
  await assert.rejects(() => searchWeb('news'), /HTTP 401/)
  assert.equal(count, 1)
})

it('only uses keyless failover after explicit consent', async () => {
  config({ search: {
    fallbackToKeyless: true,
    providers: [{ id: 'primary', active: true, endpoint: 'https://search.example/primary' }],
  } })
  mock.method(globalThis, 'fetch', async () => new Response('rate limited', { status: 429 }))
  let ddgsCalls = 0
  const hits = await searchWeb('news', undefined, async () => {
    ddgsCalls++
    return [{ title: 'Keyless', url: 'https://example.com/ok', content: 'ok' }]
  }, 5, async () => ({ results: [], source: '', failures: ['all public instances failed'] }))
  assert.equal(ddgsCalls, 1)
  assert.equal(hits[0].title, 'Keyless')
})


it('uses public instances first, without calling ddgs', async () => {
  config()
  let ddgsCalls = 0
  const hits = await searchWeb('news', undefined, async () => { ddgsCalls++; throw new Error('should not call ddgs') }, 5,
    async () => ({ source: 'https://search.utilibre.org', failures: [],
      results: [{ title: 'Public source', url: 'https://example.com/free', content: 'ok' }] }))
  assert.equal(hits[0].title, 'Public source')
  assert.equal(ddgsCalls, 0)
})

it('uses ddgs as last resort after all public instances fail', async () => {
  config()
  let ddgsCalls = 0
  const hits = await searchWeb('news', undefined, async () => {
    ddgsCalls++
    return [{ title: 'Last resort', url: 'https://example.com/ddgs', content: 'ok' }]
  }, 5, async () => ({ results: [], source: '', failures: ['public nodes unavailable'] }))
  assert.equal(hits[0].title, 'Last resort')
  assert.equal(ddgsCalls, 1)
})

it('does not leak custom-provider queries to public nodes without explicit opt-in', async () => {
  config({ search: { providers: [{ id: 'custom', active: true, endpoint: 'https://search.example/query' }] } })
  mock.method(globalThis, 'fetch', async () => new Response('offline', { status: 503 }))
  let calls = 0
  await assert.rejects(() => searchWeb('confidential research', undefined,
    async () => { calls++; return [] }, 5,
    async () => { calls++; return { results: [], source: '', failures: [] } }))
  assert.equal(calls, 0)
})

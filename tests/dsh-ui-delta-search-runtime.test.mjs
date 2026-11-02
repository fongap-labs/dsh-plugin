import { it, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { searchWeb } from '../packages/dsh-ui-delta/lib/host/search.js'
import { apply } from '../packages/dsh-ui-delta/lib/index.js'

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
  })
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
  }), error => error.code === 'KEYLESS_SEARCH_UNAVAILABLE' && /Python ddgs/.test(error.message))
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

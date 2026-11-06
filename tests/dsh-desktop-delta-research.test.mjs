import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { safeResults, rankResults, researchQueries } from '../packages/dsh-desktop-delta/lib/host/search-quality.js'
import { researchWeb } from '../packages/dsh-desktop-delta/lib/host/search.js'
import { checkPythonDdgs, searchPythonDdgs } from '../packages/dsh-desktop-delta/lib/host/python-ddgs.js'

describe('search evidence pipeline', () => {
  it('deduplicates canonical URLs and discards unsafe schemes', () => {
    const rows = safeResults([
      { title: ' A ', url: 'https://example.com/a?utm_source=demo', content: ' foo \n bar ' },
      { title: 'A2', url: 'https://example.com/a', content: 'duplicate' },
      { title: 'unsafe', url: 'file:///etc/passwd', content: 'blocked' },
      { title: 'B', url: 'https://example.com/b#section', content: 'ok' },
    ], 10)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].url, 'https://example.com/a')
    assert.equal(rows[0].content, 'foo bar')
    assert.equal(rows[1].url, 'https://example.com/b')
  })
  it('ranks useful titles without fabricating sources', () => {
    const rows = rankResults('drug stability', [
      { title: 'other', url: 'https://example.com/1', content: 'other' },
      { title: 'drug stability methods', url: 'https://example.com/2', content: 'detail' },
    ])
    assert.equal(rows[0].url, 'https://example.com/2')
  })
  it('bounds query expansion and aggregates partial results', async () => {
    const queries = researchQueries('alpha versus beta')
    assert.deepEqual(queries, ['alpha versus beta', 'alpha', 'beta'])
    const report = await researchWeb('alpha versus beta', undefined, async q => {
      if (q === 'beta') throw Error('rate limit')
      return [{ title: q, url: 'https://example.com/' + encodeURIComponent(q), content: q }]
    })
    assert.equal(report.queries.length, 3)
    assert.equal(report.results.length, 2)
    assert.equal(report.partial, true)
    assert.match(report.errors[0], /rate limit/)
  })
  it('uses optional Python readiness probe without executing a user search', async () => {
    const result = await checkPythonDdgs(undefined, async (_cmd, args, payload) => {
      assert.equal(payload, '')
      assert.match(args.at(-1), /from ddgs import DDGS/)
      return { ok: true }
    })
    assert.equal(result, true)
  })
  it('propagates the requested result count to ddgs', async () => {
    const result = await searchPythonDdgs('query', undefined, async (_cmd, _args, payload) => {
      assert.deepEqual(JSON.parse(payload), { query: 'query', max_results: 12 })
      return [{ title: 'A', url: 'https://example.com', content: 'B' }]
    }, 12)
    assert.equal(result.length, 1)
  })
})

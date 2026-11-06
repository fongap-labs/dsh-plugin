import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { makeWebSearchProvider } from '../packages/dsh-desktop-delta/lib/host/search.js'
import { searchPythonDdgs } from '../packages/dsh-desktop-delta/lib/host/python-ddgs.js'

describe('native Python ddgs search provider', () => {
  it('passes a UTF-8 JSON query to fixed Python code with no shell', async () => {
    let called = 0
    const rows = await searchPythonDdgs('  研究 药物  ', undefined, async (command, args, payload) => {
      called++
      assert.equal(typeof command, 'string')
      assert.ok(args.includes('-c'))
      assert.match(args.at(-1), /from ddgs import DDGS/)
      assert.deepEqual(JSON.parse(payload), { query: '研究 药物', max_results: 5 })
      return [
        { title: '消息', url: 'https://example.com/news', content: '摘要' },
        { title: 'bad', url: 'javascript:alert(1)', content: 'skip' },
      ]
    })
    assert.equal(called, 1)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].title, '消息')
  })

  it('rejects malformed Python responses rather than inventing search results', async () => {
    await assert.rejects(() => searchPythonDdgs('test', undefined, async () => ({ invalid: true })), /non-array/)
    await assert.rejects(() => searchPythonDdgs(' ', undefined, async () => []), /query required/)
  })

  it('preserves native web registry provider id and safe HTTP fetching', () => {
    const host = readFileSync(new URL('../packages/dsh-desktop-delta/src/index.ts', import.meta.url), 'utf8')
    const patch = readFileSync(new URL('../packages/dsh-desktop-delta/cordis.patch.yml', import.meta.url), 'utf8')
    assert.equal(makeWebSearchProvider().id, 'delta-duckduckgo')
    assert.match(host, /registerSearchProvider\(makeWebSearchProvider\(\)\)/)
    assert.match(patch, /searchProvider: delta-duckduckgo/)
    assert.match(patch, /fetchProvider: http/)
    assert.match(patch, /web-search-deepseek[\s\S]*disabled: true/)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const search = readFileSync(new URL('../packages/dsh-ui-delta/src/host/search.ts', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-ui-delta/src/host/routes.ts', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../packages/dsh-ui-delta/src/host/python-ddgs.ts', import.meta.url), 'utf8')

describe('shared Python ddgs search execution', () => {
  it('routes manual search and native model web_search through one search function', () => {
    assert.match(search, /await keyless\(query, signal\)/)
    assert.match(search, /keyless: typeof searchPythonDdgs = searchPythonDdgs/)
    assert.match(routes, /searchWeb\(query\)/)
    assert.match(search, /searchWeb\(request\.query, signal\)/)
    assert.doesNotMatch(search, /searchBingRss|makeDuckDuckGoProvider\(\)\.search/)
  })
  it('does not use a paid official search API or blindly scrape HTML', () => {
    assert.match(adapter, /from ddgs import DDGS/)
    assert.match(adapter, /backend="duckduckgo"/)
    assert.match(adapter, /backend="auto"/)
    assert.doesNotMatch(adapter, /shell: true/)
    assert.match(search, /SearchUnavailableError/)
    assert.match(search, /safeResults/)
  })
})

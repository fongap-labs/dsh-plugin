import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const search = readFileSync(new URL('../packages/dsh-ui-delta/src/host/search.ts', import.meta.url), 'utf8')
const routes = readFileSync(new URL('../packages/dsh-ui-delta/src/host/routes.ts', import.meta.url), 'utf8')

describe('search execution', () => {
  it('does not send slash search to the Host official search or require its key', () => {
    assert.match(search, /makeDuckDuckGoProvider\(\)\.search/)
    assert.match(search, /searchBingRss\(query\)/)
    assert.doesNotMatch(search, /web\.search\(/)
    assert.doesNotMatch(search, /Host web search is unavailable/)
    assert.match(routes, /searchWeb\(query/)
  })
  it('reports keyless source failures without inventing results', () => {
    assert.match(search, /SearchUnavailableError/)
    assert.match(search, /DuckDuckGo：/)
    assert.match(search, /Bing RSS：/)
    assert.match(search, /safeResults/)
  })
})

import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

it('uses a configured Host web provider without requiring DeepSeek API credentials', { skip: process.platform === 'win32' }, () => {
  const home = mkdtempSync(join(tmpdir(), 'delta-web-search-'))
  try {
    const script = `
      import assert from 'node:assert/strict'
      import { searchWeb } from './packages/dsh-ui-delta/lib/host/search.js'
      const calls = []
      const ctx = { get(key) { assert.equal(key, 'web'); return {
        async search(request) {
          calls.push(request)
          return { sources: [{ url: 'https://example.org/news', title: 'Example news', snippet: 'One source' }], truncated: false }
        }
      } } }
      const hits = await searchWeb('today news', ctx)
      assert.equal(calls.length, 1)
      assert.equal(calls[0].query, 'today news')
      assert.equal(calls[0].maxResults, 5)
      assert.equal(hits[0].url, 'https://example.org/news')
      await assert.rejects(() => searchWeb('today news'), /No web search provider is configured/)
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, HOME: home, USERPROFILE: home, DSH_HOME: home },
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error || ''))
  } finally {
    rmSync(home, { force: true, recursive: true })
  }
})

it('does not require the provider to be DeepSeek official', () => {
  const client = String(requireSource())
  assert.match(client, /Host web search is unavailable/)
  assert.match(client, /No web search provider is configured/)
})

function requireSource() {
  const source = new URL('../packages/dsh-ui-delta/src/host/search.ts', import.meta.url)
  return readFileSync(source, 'utf8')
}

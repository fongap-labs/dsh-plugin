import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/tools/github.js'

describe('Code Worker GitHub default branch guard', () => {
  it('refuses writes to a non-main default branch and uses that branch as the base', async () => {
    const key = 'DSH_CODE_DEFAULT_BRANCH_TEST_TOKEN'
    const savedToken = process.env[key]
    const savedFetch = globalThis.fetch
    const requests = []
    try {
      process.env[key] = 'dummy-github-token'
      globalThis.fetch = async (url, options) => {
        const address = new URL(url)
        const method = options?.method ?? 'GET'
        requests.push({ path: address.pathname, method, body: options?.body })
        if (method === 'GET' && address.pathname === '/repos/fongap-labs/demo') {
          return new Response(JSON.stringify({ default_branch: 'release/2026' }), { status: 200 })
        }
        if (method === 'GET' && address.pathname === '/repos/fongap-labs/demo/git/ref/heads/release/2026') {
          return new Response(JSON.stringify({ object: { sha: 'a'.repeat(40) } }), { status: 200 })
        }
        if (method === 'POST' && address.pathname === '/repos/fongap-labs/demo/git/refs') {
          return new Response(JSON.stringify({ object: { sha: 'a'.repeat(40) } }), { status: 201 })
        }
        if (method === 'GET' && address.pathname === '/repos/fongap-labs/demo/pulls') {
          return new Response(JSON.stringify([]), { status: 200 })
        }
        if (method === 'POST' && address.pathname === '/repos/fongap-labs/demo/pulls') {
          return new Response(JSON.stringify({ number: 12, html_url: 'https://github.com/fongap-labs/demo/pull/12' }), { status: 201 })
        }
        return new Response(JSON.stringify({ message: 'unexpected test route' }), { status: 404 })
      }
      const ctx = { get: () => undefined }
      const settings = normalizeConfig({
        github: { allowWrites: true, accounts: [{ owner: 'fongap-labs', tokenEnv: key }] },
      })
      const tools = createGitHubTools(ctx, settings)
      const getTool = name => tools.find(tool => tool.name === 'code_github_' + name)
      const exec = { signal: new AbortController().signal }
      await assert.rejects(
        getTool('branch').execute({ repository: 'fongap-labs/demo', branch: 'release/2026' }, exec),
        /refusing to write to the default branch/,
      )
      await assert.rejects(
        getTool('commit_file').execute({
          repository: 'fongap-labs/demo', branch: 'release/2026',
          path: 'README.md', message: 'change', content: 'unsafe',
        }, exec),
        /refusing to write to the default branch/,
      )
      assert.equal(requests.filter(request => request.method !== 'GET').length, 0)
      const created = await getTool('branch').execute({
        repository: 'fongap-labs/demo', branch: 'feat/improvement',
      }, exec)
      assert.equal(created.repository, 'fongap-labs/demo')
      assert.equal(requests.filter(request => request.method === 'POST').length, 1)
      assert.equal(JSON.parse(requests.find(request => request.path.endsWith('/git/refs')).body).ref, 'refs/heads/feat/improvement')
      const pr = await getTool('create_pr').execute({
        repository: 'fongap-labs/demo', head: 'feat/improvement', title: 'Test',
      }, exec)
      assert.equal(JSON.parse(pr.result).number, 12)
      assert.equal(JSON.parse(requests.find(request => request.method === 'POST' && request.path.endsWith('/pulls')).body).base, 'release/2026')
    } finally {
      if (savedToken === undefined) delete process.env[key]
      else process.env[key] = savedToken
      globalThis.fetch = savedFetch
    }
  })
})

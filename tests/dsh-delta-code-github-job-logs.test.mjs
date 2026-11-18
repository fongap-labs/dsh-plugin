import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/tools/github.js'
import { createGitHubTools as createInjectedGitHubTools } from '../packages/dsh-delta-code/lib/delta-code-repository/github.js'

const ACCOUNT = { owner: 'fongap-labs', tokenEnv: 'DSH_TEST_GITHUB_JOB_LOGS' }
const settings = normalizeConfig({ github: { accounts: [ACCOUNT] } })
const signal = () => new AbortController().signal
const jobTool = () => createGitHubTools({ get: () => undefined }, settings)
  .find(item => item.name === 'code_github_job_logs')

describe('Delta Code GitHub Actions raw job log diagnostics', () => {
  it('reads the error from a signed redirect without forwarding the GitHub bearer token', async () => {
    const oldFetch = globalThis.fetch
    const oldToken = process.env[ACCOUNT.tokenEnv]
    process.env[ACCOUNT.tokenEnv] = 'test-log-token'
    const seen = []
    try {
      globalThis.fetch = async (url, options) => {
        const uri = String(url)
        seen.push({ uri, authorization: options.headers?.Authorization, redirect: options.redirect })
        if (uri.endsWith('/actions/jobs/42/logs')) {
          return new Response(null, { status: 302,
            headers: { location: 'https://pipelines.actions.githubusercontent.com/job42?sig=abc' } })
        }
        assert.match(uri, /^https:\/\/pipelines\.actions\.githubusercontent\.com\//)
        return new Response([
          '2026-01-01T00:00:00Z Running tests',
          '2026-01-01T00:00:01Z Error: test regression',
          '2026-01-01T00:00:02Z Authorization: Bearer ghp_maskme',
          '2026-01-01T00:00:03Z GITHUB_TOKEN=github_pat_maskme',
          '2026-01-01T00:00:04Z ##[error]Process completed with exit code 1.',
        ].join('\n'), { status: 200 })
      }
      const result = await jobTool().execute({
        repository: 'fongap-labs/action-worker', jobId: 42,
      }, { signal: signal() })
      const payload = JSON.parse(result.result)
      assert.equal(payload.jobId, 42)
      assert.match(payload.excerpt, /test regression/)
      assert.match(payload.excerpt, /Process completed with exit code 1/)
      assert.doesNotMatch(JSON.stringify(result), /test-log-token|ghp_maskme|github_pat_maskme/)
      assert.equal(seen.length, 2)
      assert.equal(seen[0].authorization, 'Bearer test-log-token')
      assert.equal(seen[0].redirect, 'manual')
      assert.equal(seen[1].authorization, undefined)
      assert.equal(seen[1].redirect, 'error')
    } finally {
      globalThis.fetch = oldFetch
      if (oldToken === undefined) delete process.env[ACCOUNT.tokenEnv]
      else process.env[ACCOUNT.tokenEnv] = oldToken
    }
  })

  it('rejects unknown or cross-owner identities before making a request', async () => {
    const tool = jobTool()
    await assert.rejects(tool.execute({ repository: 'other-org/action-worker', jobId: 1 },
      { signal: signal() }), /no GitHub account/)
    await assert.rejects(tool.execute({ repository: 'other-org/action-worker', account: 'fongap-labs', jobId: 1 },
      { signal: signal() }), /cannot access/)
    await assert.rejects(tool.execute({ repository: 'fongap-labs/action-worker', jobId: 0 },
      { signal: signal() }), /invalid GitHub job ID/)
  })

  it('does not follow unexpected log redirect hosts or leak the credential', async () => {
    const oldFetch = globalThis.fetch
    const oldToken = process.env[ACCOUNT.tokenEnv]
    process.env[ACCOUNT.tokenEnv] = 'test-log-token'
    const seen = []
    try {
      globalThis.fetch = async (url) => {
        seen.push(String(url))
        return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } })
      }
      await assert.rejects(jobTool().execute({ repository: 'fongap-labs/action-worker', jobId: 10 },
        { signal: signal() }), /not an approved HTTPS storage host/)
      assert.equal(seen.length, 1)
    } finally {
      globalThis.fetch = oldFetch
      if (oldToken === undefined) delete process.env[ACCOUNT.tokenEnv]
      else process.env[ACCOUNT.tokenEnv] = oldToken
    }
  })

  it('honors GitHub 403 and never fetches the downstream log URL', async () => {
    const oldFetch = globalThis.fetch
    const oldToken = process.env[ACCOUNT.tokenEnv]
    process.env[ACCOUNT.tokenEnv] = 'test-log-token'
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
      await assert.rejects(jobTool().execute({ repository: 'fongap-labs/action-worker', jobId: 10 },
        { signal: signal() }), /GitHub API 403/)
    } finally {
      globalThis.fetch = oldFetch
      if (oldToken === undefined) delete process.env[ACCOUNT.tokenEnv]
      else process.env[ACCOUNT.tokenEnv] = oldToken
    }
  })

  it('fails explicitly when a test transport has no log capability', async () => {
    const oldTransport = { request: async () => { throw Error('not invoked') } }
    const tool = createInjectedGitHubTools({ get: () => undefined }, settings, oldTransport)
      .find(item => item.name === 'code_github_job_logs')
    await assert.rejects(tool.execute({ repository: 'fongap-labs/action-worker', jobId: 42 },
      { signal: signal() }), /transport unavailable/)
  })

  it('uses a bounded excerpt for large job logs, with incomplete evidence marked', async () => {
    const oldFetch = globalThis.fetch
    const oldToken = process.env[ACCOUNT.tokenEnv]
    process.env[ACCOUNT.tokenEnv] = 'test-log-token'
    try {
      globalThis.fetch = async () => new Response('A'.repeat(1024 * 1024 + 200), { status: 200 })
      const result = JSON.parse((await jobTool().execute({ repository: 'fongap-labs/action-worker', jobId: 50 },
        { signal: signal() })).result)
      assert.equal(result.truncated, true)
      assert.ok(result.excerpt.length <= 12000)
      assert.equal(result.bytesRead, 1024 * 1024)
    } finally {
      globalThis.fetch = oldFetch
      if (oldToken === undefined) delete process.env[ACCOUNT.tokenEnv]
      else process.env[ACCOUNT.tokenEnv] = oldToken
    }
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'
import { githubActionsTargetFromUrl } from '../packages/delta-code/lib/delta-code-repository/github-policy.js'
import { createGitHubToolSpecs } from '../packages/delta-code/lib/delta-code-repository/github-operations.js'

function fixture() {
  const requests = []
  const settings = normalizeConfig({ github: { accounts: [
    { owner: 'product-team', tokenEnv: 'PRODUCT_TEAM_TOKEN' },
    { owner: 'ci-team', tokenEnv: 'CI_TEAM_TOKEN' },
  ] } })
  const transport = {
    async request(input) {
      requests.push({ type: 'request', ...input })
      return { repository: input.repository, account: input.account,
        data: { total_count: 1, jobs: [{
          id: 56, name: 'compile', conclusion: 'failure',
          html_url: 'https://github.com/ci-team/runner/actions/runs/123/job/56',
          steps: [{ name: 'Compile', number: 3, conclusion: 'failure' }],
        }] } }
    },
    async jobLogs(input) {
      requests.push({ type: 'logs', ...input })
      return { repository: input.repository, account: input.account,
        excerpt: 'Compile failed', truncated: false, bytesRead: 14 }
    },
  }
  const tools = createGitHubToolSpecs(settings, transport, async repository => {
    if (!repository) throw new Error('unexpected origin discovery')
    return repository
  })
  const tool = name => tools.find(entry => entry.name === 'code_github_' + name)
  return { requests, tool, signal: new AbortController().signal }
}

describe('Delta Code GitHub Actions links use the actual CI owner, not a fixed repository', () => {
  it('accepts only canonical HTTPS GitHub Actions run and job links', () => {
    assert.deepEqual(githubActionsTargetFromUrl('https://github.com/ci-team/runner/actions/runs/123?check_suite_focus=true'), {
      repository: 'ci-team/runner', runId: 123,
    })
    assert.deepEqual(githubActionsTargetFromUrl('https://github.com/product-team/web/actions/runs/9/job/56'), {
      repository: 'product-team/web', runId: 9, jobId: 56,
    })
    for (const candidate of [
      'http://github.com/ci-team/runner/actions/runs/123',
      'https://github.com.evil.example/ci-team/runner/actions/runs/123',
      'https://user:secret' + String.fromCharCode(64) + 'github.com/ci-team/runner/actions/runs/123',
      'https://github.com/ci-team/runner/issues/123',
      'https://github.com/ci-team/runner/actions/runs/0',
      'https://github.com/ci-team/runner/actions/runs/9007199254740992',
      'https://github.com/ci-team/runner/actions/runs/12/job/0',
      'https://github.com/ci-team/runner/actions/runs/12/unknown/56',
      'https://github.com/ci-team/runner/actions/runs/%31%32',
      'https://github.com/ci-team/runner/actions/runs/12/job/9999999999999999999',
    ]) assert.throws(() => githubActionsTargetFromUrl(candidate), /GitHub Actions URL|GitHub Actions run or job|GitHub Actions run or job ID/)
  })

  it('finds jobs from external CI links using the CI repository binding', async () => {
    const f = fixture()
    const result = await f.tool('jobs').execute({
      runUrl: 'https://github.com/ci-team/runner/actions/runs/123',
    }, { signal: f.signal })
    assert.equal(result.repository, 'ci-team/runner')
    assert.equal(result.account, 'ci-team')
    assert.equal(JSON.parse(result.result).jobs[0].failedSteps[0].name, 'Compile')
    assert.equal(f.requests.length, 1)
    assert.equal(f.requests[0].path, '/repos/ci-team/runner/actions/runs/123/jobs?per_page=100')
    assert.equal(f.requests[0].account, 'ci-team')
    assert.equal(Object.hasOwn(f.requests[0], 'token'), false)
    assert.doesNotMatch(f.tool('jobs').description, /fongap-labs\/action-worker/)
  })

  it('loads job logs from a job URL using the matching repository credential', async () => {
    const f = fixture()
    const result = await f.tool('job_logs').execute({
      jobUrl: 'https://github.com/ci-team/runner/actions/runs/123/job/56',
    }, { signal: f.signal })
    assert.equal(result.repository, 'ci-team/runner')
    assert.equal(result.account, 'ci-team')
    assert.equal(JSON.parse(result.result).excerpt, 'Compile failed')
    assert.deepEqual(f.requests.map(r => [r.type, r.repository, r.account, r.jobId]), [
      ['logs', 'ci-team/runner', 'ci-team', 56],
    ])
  })

  it('keeps direct runId/jobId requests for configured repositories', async () => {
    const f = fixture()
    await f.tool('jobs').execute({ repository: 'product-team/app', runId: 17 }, { signal: f.signal })
    await f.tool('job_logs').execute({ repository: 'product-team/app', jobId: 23 }, { signal: f.signal })
    assert.deepEqual(f.requests.map(r => [r.repository, r.account]), [
      ['product-team/app', 'product-team'], ['product-team/app', 'product-team'],
    ])
  })

  it('refuses mismatched URL, repository, job and account before contacting GitHub', async () => {
    const f = fixture()
    const runUrl = 'https://github.com/ci-team/runner/actions/runs/123'
    const jobUrl = runUrl + '/job/56'
    const cases = [
      [f.tool('jobs'), { runUrl, repository: 'product-team/web' }, /differs from explicit repository/],
      [f.tool('jobs'), { runUrl, runId: 124 }, /differs from explicit runId/],
      [f.tool('jobs'), { runUrl, account: 'product-team' }, /cannot access/],
      [f.tool('job_logs'), { jobUrl, repository: 'product-team/web' }, /differs from explicit repository/],
      [f.tool('job_logs'), { jobUrl, jobId: 57 }, /differs from explicit jobId/],
      [f.tool('job_logs'), { jobUrl: runUrl }, /must include a job ID/],
      [f.tool('job_logs'), { jobUrl, account: 'product-team' }, /cannot access/],
      [f.tool('jobs'), { runUrl: 'https://github.com/unconfigured-org/runner/actions/runs/123' }, /no GitHub account/],
      [f.tool('jobs'), {}, /invalid workflow run ID/],
      [f.tool('job_logs'), {}, /invalid GitHub job ID/],
    ]
    for (const [tool, args, expected] of cases) {
      await assert.rejects(tool.execute(args, { signal: f.signal }), expected)
    }
    assert.equal(f.requests.length, 0)
  })

  it('allows a URL and explicit repository only when both identify the same owner/repo', async () => {
    const f = fixture()
    await f.tool('jobs').execute({
      repository: 'CI-TEAM/runner',
      runId: 123,
      runUrl: 'https://github.com/ci-team/runner/actions/runs/123',
    }, { signal: f.signal })
    assert.equal(f.requests[0].account, 'ci-team')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeConfig, validateGitHubAccounts } from '../packages/delta-code/lib/runtime.js'
import { repositoryFromRemote, selectGitHubAccount, createGitHubTools } from '../packages/delta-code/lib/tools/github.js'

const accounts = [
  { owner: 'fongap-labs', tokenEnv: 'DSH_TEST_GITHUB_TEAM_TOKEN' },
  { owner: 'another-user', tokenEnv: 'DSH_TEST_GITHUB_PERSONAL_TOKEN' },
  { owner: 'third-org', tokenEnv: 'GITHUB_TOKEN_THIRD' },
]
process.env.DSH_TEST_GITHUB_TEAM_TOKEN = 'teamtest'
process.env.DSH_TEST_GITHUB_PERSONAL_TOKEN = 'persontest'


describe('GitHub account configuration and automatic routing', () => {
  it('accepts one or arbitrarily many accounts without IDs or repository lists', () => {
    assert.equal(validateGitHubAccounts(accounts.slice(0, 1)).length, 1)
    assert.equal(validateGitHubAccounts(accounts).length, 3)
    assert.equal(validateGitHubAccounts([...accounts, { owner: 'fourth-user', tokenEnv: 'DSH_TEST_FOURTH_TOKEN' }]).length, 4)
  })
  it('matches the owner in owner/repo, ignoring case', () => {
    assert.equal(selectGitHubAccount(accounts, 'FONGAP-LABS/DELTA').owner, 'fongap-labs')
    assert.equal(selectGitHubAccount(accounts, 'fongap-labs/dsh-plugin').owner, 'fongap-labs')
    assert.equal(selectGitHubAccount(accounts, 'another-user/example').owner, 'another-user')
    assert.equal(selectGitHubAccount(accounts, 'third-org/example').tokenEnv, 'GITHUB_TOKEN_THIRD')
  })
  it('rejects missing or ambiguous owners without guessing a token', () => {
    assert.throws(() => selectGitHubAccount(accounts, 'unknown/repository'), /no GitHub account/)
    assert.throws(() => selectGitHubAccount([...accounts, { owner: 'fongap-labs', tokenEnv: 'DSH_TEST_OTHER_TOKEN' }], 'fongap-labs/other'), /ambiguous/)
    assert.throws(() => selectGitHubAccount(accounts, '../repo'), /invalid/)
    assert.throws(() => selectGitHubAccount(accounts, 'fongap-labs/..'), /invalid/)
    assert.throws(() => selectGitHubAccount(accounts, 'fongap-labs/.'), /invalid/)
    assert.throws(() => selectGitHubAccount(accounts, '-owner/repository'), /invalid/)
    assert.throws(() => selectGitHubAccount(accounts, 'owner/name/extra'), /invalid/)
  })
  it('rejects duplicate owners, inline tokens and invalid/missing env references', () => {
    assert.throws(() => validateGitHubAccounts([{ owner: 'owner', tokenEnv: 'TEST_TOKEN_ONE' }, { owner: 'OWNER', tokenEnv: 'TEST_TOKEN_TWO' }]), /duplicate/)
    assert.throws(() => validateGitHubAccounts([{ owner: 'owner' }]), /tokenEnv is required/)
    assert.throws(() => validateGitHubAccounts([{ owner: 'owner', token: 'value', tokenEnv: 'GH_TOKEN' }]), /token is not supported/)
    assert.throws(() => validateGitHubAccounts([{ owner: 'a/b', tokenEnv: 'TEST_TOKEN' }]), /username or organization/)
    assert.throws(() => validateGitHubAccounts([{ owner: 'owner', tokenEnv: 'invalid-name' }]), /tokenEnv/)
  })
  it('parses GitHub origins but rejects unrelated hosts', () => {
    assert.equal(repositoryFromRemote('https://github.com/fongap-labs/delta.git'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('git@github.com:fongap-labs/delta.git'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('ssh://git@github.com/fongap-labs/delta'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('https://github.com.evil.example/fongap-labs/delta'), undefined)
    assert.equal(repositoryFromRemote('https://github.com/../repo'), undefined)
    assert.equal(repositoryFromRemote('git@github.com:owner/..'), undefined)
  })
  it('defaults to read-only and installs all GitHub tools', () => {
    const config = normalizeConfig({ github: { accounts } })
    assert.equal(config.githubEnabled, true)
    assert.equal(config.githubAllowWrites, false)
    const tools = createGitHubTools({ get: () => undefined }, config)
    assert.deepEqual(tools.map((tool) => tool.name), [
      'code_github_connection', 'code_github_file', 'code_github_pulls',
      'code_github_checks', 'code_github_jobs', 'code_github_job_logs', 'code_github_branch', 'code_github_commit_file', 'code_github_create_pr',
      'code_github_skill_candidates', 'code_github_skill_review', 'code_github_skill_discover', 'code_github_skill_public_review', 'code_github_skill_temporary_use', 'code_github_skill_propose_pr', 'code_github_skill_promote_pr', 'code_github_skill_auto_stage', 'code_github_skill_auto_advance',
    ])
  })
  it('points automatic Skill promotion to CI events instead of a duplicate manual PR', () => {
    const source = readFileSync(new URL(
      '../packages/delta-code/src/delta-code-repository/github-skill-auto-stage.ts', import.meta.url,
    ), 'utf8')
    assert.match(source, /next: 'After this proposal PR passes central CI and merges, Action Worker event reconciliation/)
    assert.match(source, /Do not manually submit a duplicate promotion/)
    assert.doesNotMatch(source, /then independently re-audit and promote using code_github_skill_promote_pr/)
    const readme = readFileSync(new URL('../packages/delta-code/README.md', import.meta.url), 'utf8')
    assert.match(readme, /Action Worker 的既有 GitHub 事件续接/)
    assert.doesNotMatch(readme, /两步操作由原生 Agent 在活动会话中继续/)
  })
  it('fails closed before any network request for unmatched owners or unauthorized writes', async () => {
    const config = normalizeConfig({ github: { accounts } })
    const tools = createGitHubTools({ get: () => undefined }, config)
    const exec = { signal: new AbortController().signal }
    await assert.rejects(tools[0].execute({ repository: 'unknown/repo' }, exec), /no GitHub account/)
    await assert.rejects(tools.find((tool) => tool.name === 'code_github_branch').execute({ repository: 'fongap-labs/delta', branch: 'feat/test' }, exec), /writes are disabled/)
  })
  it('inherits native GITHUB_TOKEN for arbitrary repositories without plugin accounts', async () => {
    const old = process.env.GITHUB_TOKEN
    process.env.GITHUB_TOKEN = 'native-test-only'
    const requests = []
    const previousFetch = globalThis.fetch
    try {
      const settings = normalizeConfig({})
      assert.equal(settings.githubEnabled, true)
      const tool = createGitHubTools({ get: () => undefined }, settings).find(t => t.name === 'code_github_connection')
      globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), authorization: options.headers.Authorization })
        return new Response(JSON.stringify(String(url).endsWith('/user') ? { login: 'native-user' } : { permissions: { pull: true } }), { status: 200 })
      }
      const output = await tool.execute({ repository: 'native-user/private-repo' }, { signal: new AbortController().signal })
      assert.equal(output.account, 'native')
      assert.equal(requests.length, 2)
      assert.equal(requests[0].authorization, 'Bearer native-test-only')
      assert.ok(requests[0].url.endsWith('/user'))
      await assert.rejects(tool.execute({ repository: 'other-org/repo' }, { signal: new AbortController().signal }), /native GITHUB_TOKEN owner does not match/)
      assert.equal(requests.length, 3)
      assert.doesNotMatch(JSON.stringify(output), /native-test-only/)
    } finally {
      globalThis.fetch = previousFetch
      if (old === undefined) delete process.env.GITHUB_TOKEN
      else process.env.GITHUB_TOKEN = old
    }
  })

  it('uses the matching token for each of multiple repository owners', async () => {
    const config = normalizeConfig({ github: { accounts: accounts.slice(0, 2) } })
    const connection = createGitHubTools({ get: () => undefined }, config)
      .find((entry) => entry.name === 'code_github_connection')
    const previousFetch = globalThis.fetch
    const seen = []
    try {
      globalThis.fetch = async (url, options) => {
        seen.push({ url: String(url), authorization: options.headers.Authorization })
        return new Response(JSON.stringify({ private: false, permissions: { pull: true } }), { status: 200 })
      }
      const exec = { signal: new AbortController().signal }
      await connection.execute({ repository: 'fongap-labs/delta' }, exec)
      await connection.execute({ repository: 'another-user/project' }, exec)
      assert.deepEqual(seen.map((value) => value.authorization),
        ['Bearer teamtest', 'Bearer persontest'])
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('returns bounded PR checks and central CI status links with the owner token', async () => {
    const config = normalizeConfig({ github: { accounts: accounts.slice(0, 1) } })
    const tool = createGitHubTools({ get: () => undefined }, config)
      .find((entry) => entry.name === 'code_github_checks')
    const previousFetch = globalThis.fetch
    const requests = []
    try {
      globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), authorization: options.headers.Authorization })
        const payload = String(url).includes('/pulls/8') ?
          { head: { sha: 'a'.repeat(40) } } :
          String(url).includes('/check-runs') ?
            { check_runs: [{ name: 'lint', status: 'completed', conclusion: 'failure', output: { summary: 'typecheck error' } }] } :
            { statuses: [{ context: 'CI Evidence', state: 'failure', target_url: 'https://github.com/fongap-labs/action-worker/actions/runs/123' }] }
        return new Response(JSON.stringify(payload), { status: 200 })
      }
      const output = await tool.execute({ repository: 'fongap-labs/delta', prNumber: 8 }, { signal: new AbortController().signal })
      const data = JSON.parse(output.result)
      assert.equal(data.checks[0].conclusion, 'failure')
      assert.equal(data.statuses[0].context, 'CI Evidence')
      assert.equal(requests.length, 4)
      assert.ok(requests.every((request) => request.authorization === 'Bearer teamtest'))
      assert.doesNotMatch(JSON.stringify(output), /teamtest/)
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('rejects stale or racing PR heads before claiming CI evidence', async () => {
    const config = normalizeConfig({ github: { accounts: accounts.slice(0, 1) } })
    const tool = createGitHubTools({ get: () => undefined }, config)
      .find(entry => entry.name === 'code_github_checks')
    const previousFetch = globalThis.fetch
    let headCalls = 0
    const visited = []
    try {
      globalThis.fetch = async (url) => {
        const location = String(url)
        visited.push(location)
        if (location.includes('/pulls/9')) {
          headCalls++
          return new Response(JSON.stringify({
            head: { sha: (headCalls < 2 ? 'a' : 'b').repeat(40) },
          }), { status: 200 })
        }
        if (location.includes('check-runs')) {
          return new Response(JSON.stringify({ total_count: 1, check_runs: [{
            name: 'test', status: 'completed', conclusion: 'success',
          }] }), { status: 200 })
        }
        return new Response(JSON.stringify({ statuses: [] }), { status: 200 })
      }
      const exec = { signal: new AbortController().signal }
      await assert.rejects(tool.execute({
        repository: 'fongap-labs/delta', prNumber: 9, expectedHead: 'b'.repeat(40),
      }, exec), /differs from expectedHead/)
      assert.equal(visited.length, 1, 'wrong expected head must stop before CI calls')
      headCalls = 0
      visited.length = 0
      await assert.rejects(tool.execute({
        repository: 'fongap-labs/delta', prNumber: 9, expectedHead: 'a'.repeat(40),
      }, exec), /HEAD changed during CI inspection/)
      assert.equal(visited.filter(v => v.includes('/pulls/9')).length, 2)
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('reports 100-item GitHub CI pages as incomplete evidence', async () => {
    const config = normalizeConfig({ github: { accounts: accounts.slice(0, 1) } })
    const tool = createGitHubTools({ get: () => undefined }, config)
      .find(entry => entry.name === 'code_github_checks')
    const previousFetch = globalThis.fetch
    try {
      globalThis.fetch = async url => {
        const path = String(url)
        const data = path.includes('/pulls/3') ? { head: { sha: 'c'.repeat(40) } }
          : path.includes('check-runs') ? { total_count: 101,
              check_runs: Array.from({ length: 100 }, (_, n) => ({
                name: 'job-' + n, status: 'completed', conclusion: 'success',
              })) }
          : { statuses: [] }
        return new Response(JSON.stringify(data), { status: 200 })
      }
      const result = await tool.execute({
        repository: 'fongap-labs/delta', prNumber: 3, expectedHead: 'c'.repeat(40),
      }, { signal: new AbortController().signal })
      const evidence = JSON.parse(result.result)
      assert.equal(evidence.head, 'c'.repeat(40))
      assert.equal(evidence.complete, false)
      assert.match(evidence.note, /do not certify all gates/)
    } finally {
      globalThis.fetch = previousFetch
    }
  })

  it('never exposes plaintext tokens through connection results', async () => {
    const config = normalizeConfig({ github: { accounts: accounts.slice(0, 1) } })
    const tool = createGitHubTools({ get: () => undefined }, config)[0]
    const previousFetch = globalThis.fetch
    const seen = []
    try {
      globalThis.fetch = async (_url, options) => {
        seen.push(options.headers.Authorization)
        return new Response(JSON.stringify({ private: true, permissions: { pull: true } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      const result = await tool.execute({ repository: 'fongap-labs/delta' }, { signal: new AbortController().signal })
      assert.equal(result.account, 'fongap-labs')
      assert.equal(seen[0], 'Bearer teamtest')
      assert.doesNotMatch(JSON.stringify(result), /teamtest/)
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})

  it('uses mounted Host credentials, not process.env, and rotates without a restart', async () => {
    const { createGitHubTransport } = await import('../packages/delta-code/lib/delta-code-adapter/providers/github/api.js')
    const account = { owner: 'isolated', tokenEnv: 'DSH_TEST_GITHUB_ROTATING' }
    process.env.DSH_TEST_GITHUB_ROTATING = 'wrong-ambient-token'
    let current = 'first-token'
    const references = [], calls = []
    const host = { get(name) { assert.equal(name, 'credentials'); return {
      async resolve(ref) { references.push(ref); return current ? { value: current, source: 'file' } : undefined },
    } } }
    const transport = createGitHubTransport([account], host)
    const previousFetch = globalThis.fetch
    try {
      globalThis.fetch = async (_url, options) => {
        calls.push(options.headers.Authorization)
        return new Response(JSON.stringify({ name: 'repo' }), { status: 200 })
      }
      const input = { repository: 'isolated/repo', account: 'isolated',
        method: 'GET', path: '/repos/isolated/repo', signal: new AbortController().signal }
      await transport.request(input)
      current = 'second-token'
      await transport.request(input)
      current = ''
      await assert.rejects(transport.request(input), /credential not configured/)
      assert.deepEqual(calls, ['Bearer first-token', 'Bearer second-token'])
      assert.deepEqual(references, Array(3).fill('DSH_TEST_GITHUB_ROTATING'))
      assert.doesNotMatch(JSON.stringify({ references }), /first-token|second-token/)
    } finally {
      globalThis.fetch = previousFetch
      delete process.env.DSH_TEST_GITHUB_ROTATING
    }
  })
  it('never falls back to ambient secrets when mounted Host credentials are empty or broken', async () => {
    const { createGitHubTransport } = await import('../packages/delta-code/lib/delta-code-adapter/providers/github/api.js')
    const name = 'DSH_TEST_GITHUB_NO_FALLBACK'
    process.env[name] = 'ambient-secret'
    const accounts = [{ owner: 'secure', tokenEnv: name }]
    const input = { repository: 'secure/repo', account: 'secure', method: 'GET',
      path: '/repos/secure/repo', signal: new AbortController().signal }
    try {
      await assert.rejects(createGitHubTransport(accounts, { get: () => ({ resolve: async () => undefined }) })
        .request(input), /credential not configured/)
      await assert.rejects(createGitHubTransport(accounts, { get: () => ({}) })
        .request(input), /service is incomplete/)
    } finally { delete process.env[name] }
  })

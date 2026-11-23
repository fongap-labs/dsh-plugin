import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, validateGitHubAccounts } from '../packages/delta-code/lib/runtime.js'
import { selectGitHubAccount } from '../packages/delta-code/lib/tools/github.js'
import { createGitHubTools } from '../packages/delta-code/lib/delta-code-repository/github.js'

const accounts = [
  { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['personal/backend'] },
  { owner: 'work', tokenEnv: 'WORK_TOKEN', repositories: ['work/frontend'] },
  { owner: 'company', tokenEnv: 'COMPANY_TOKEN' },
]

describe('Delta Code GitHub owner-bound credentials', () => {
  it('routes unlimited repositories under their matching owner only', () => {
    const normalized = validateGitHubAccounts(accounts)
    assert.equal(selectGitHubAccount(normalized, 'personal/backend').owner, 'personal')
    assert.equal(selectGitHubAccount(normalized, 'WORK/FRONTEND').owner, 'work')
    assert.equal(selectGitHubAccount(normalized, 'company/other').owner, 'company')
    assert.equal(selectGitHubAccount(normalized, 'work/another-repo').owner, 'work')
    assert.deepEqual(normalized[0].repositories, ['personal/backend'])
    const many = Array.from({ length: 300 }, (_, index) => 'personal/repo-' + index)
    assert.equal(validateGitHubAccounts([{ owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: many }])[0].repositories.length, 300)
  })

  it('rejects cross-owner repository bindings, duplicate token references and malformed names', () => {
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['work/backend'] },
    ]), /must match its account owner/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'SHARED_TOKEN' },
      { owner: 'work', tokenEnv: 'SHARED_TOKEN' },
    ]), /only one account/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['personal/Backend', 'PERSONAL/backend'] },
    ]), /duplicate GitHub repository binding/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['personal/../backend'] },
    ]), /repositories entries must be owner\/repository/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: 'personal/backend' },
    ]), /repositories must be an array/)
  })

  it('never uses one account token for a different owner', () => {
    const one = validateGitHubAccounts([{ owner: 'personal', tokenEnv: 'PERSONAL_TOKEN' }])
    assert.equal(selectGitHubAccount(one, 'personal/project').owner, 'personal')
    assert.throws(() => selectGitHubAccount(one, 'company/project'), /no GitHub account/)
    assert.throws(() => selectGitHubAccount(accounts, 'company/project', 'personal'), /cannot access/)
    assert.throws(() => selectGitHubAccount(accounts, 'company/project', 'missing'), /unknown or ambiguous/)
    assert.equal(selectGitHubAccount([], 'any-org/any-repo').owner, 'native')
  })

  it('passes only the selected owner to transport, never the token itself', async () => {
    const requests = []
    const settings = normalizeConfig({ github: { accounts } })
    const transport = {
      async request(request) {
        requests.push(request)
        return { repository: request.repository, account: request.account,
          data: { name: request.repository, permissions: { pull: true } } }
      },
    }
    const tool = createGitHubTools({ get: () => undefined }, settings, transport)
      .find(item => item.name === 'code_github_connection')
    const signal = new AbortController().signal
    await tool.execute({ repository: 'personal/backend' }, { signal })
    await tool.execute({ repository: 'work/frontend' }, { signal })
    await tool.execute({ repository: 'company/other', account: 'company' }, { signal })
    await assert.rejects(tool.execute({ repository: 'work/another', account: 'personal' }, { signal }), /cannot access/)
    assert.deepEqual(requests.map(r => [r.repository, r.account]), [
      ['personal/backend', 'personal'], ['work/frontend', 'work'], ['company/other', 'company'],
    ])
    assert.ok(requests.every(r => r.signal === signal && !Object.hasOwn(r, 'tokenEnv')))
  })
})

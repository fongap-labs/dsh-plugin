import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, validateGitHubAccounts } from '../packages/dsh-delta-code/lib/runtime.js'
import { selectGitHubAccount } from '../packages/dsh-delta-code/lib/tools/github.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/delta-code-repository/github.js'

const accounts = [
  { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['company/backend'] },
  { owner: 'work', tokenEnv: 'WORK_TOKEN', repositories: ['company/frontend'] },
  { owner: 'company', tokenEnv: 'COMPANY_TOKEN' },
]

describe('Delta Code explicit GitHub repository account bindings', () => {
  it('assigns each organization repository to the explicit account, not its owner', () => {
    const normalized = validateGitHubAccounts(accounts)
    assert.equal(selectGitHubAccount(normalized, 'company/backend').owner, 'personal')
    assert.equal(selectGitHubAccount(normalized, 'COMPANY/FRONTEND').owner, 'work')
    assert.equal(selectGitHubAccount(normalized, 'company/other').owner, 'company')
    assert.equal(selectGitHubAccount(normalized, 'work/personal').owner, 'work')
    assert.deepEqual(normalized[0].repositories, ['company/backend'])
  })

  it('rejects overlapping, invalid or duplicate repository account bindings', () => {
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['company/Backend'] },
      { owner: 'work', tokenEnv: 'WORK_TOKEN', repositories: ['COMPANY/backend'] },
    ]), /duplicate GitHub repository binding/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['company/backend', 'COMPANY/backend'] },
    ]), /duplicate GitHub repository binding/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: ['company/../backend'] },
    ]), /repositories entries must be owner\/repository/)
    assert.throws(() => validateGitHubAccounts([
      { owner: 'personal', tokenEnv: 'PERSONAL_TOKEN', repositories: 'company/backend' },
    ]), /repositories must be an array/)
  })

  it('keeps legacy account routing and old config values unchanged', () => {
    const old = validateGitHubAccounts([{ owner: 'personal', tokenEnv: 'PERSONAL_TOKEN' }])
    assert.deepEqual(old, [{ owner: 'personal', tokenEnv: 'PERSONAL_TOKEN' }])
    assert.equal(selectGitHubAccount(old, 'personal/project').owner, 'personal')
    assert.throws(() => selectGitHubAccount(old, 'other/project'), /no GitHub account/)
  })

  it('routes requests for separate repositories without carrying credentials to the feature', async () => {
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
    await tool.execute({ repository: 'company/backend' }, { signal })
    await tool.execute({ repository: 'company/frontend' }, { signal })
    assert.deepEqual(requests.map(r => [r.repository, r.account]), [
      ['company/backend', 'personal'], ['company/frontend', 'work'],
    ])
    assert.ok(requests.every(r => r.signal === signal && !Object.hasOwn(r, 'tokenEnv')))
  })
})

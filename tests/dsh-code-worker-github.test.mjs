import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig, validateGitHubAccounts } from '../packages/dsh-code-worker/lib/runtime.js'
import { repositoryFromRemote, selectGitHubAccount, createGitHubTools } from '../packages/dsh-code-worker/lib/tools/github.js'

const accounts = [
  { id: 'team', tokenEnv: 'GITHUB_TOKEN_WORK', repositories: ['fongap-labs/*'] },
  { id: 'special', tokenEnv: 'GITHUB_TOKEN_SPECIAL', repositories: ['fongap-labs/delta'] },
  { id: 'personal', tokenEnv: 'GITHUB_TOKEN_PERSONAL', repositories: ['other-user/*'] },
]

describe('GitHub repository account routing', () => {
  it('prefers exact repository mapping over owner wildcard', () => {
    assert.equal(selectGitHubAccount(accounts, 'FONGAP-LABS/DELTA').id, 'special')
    assert.equal(selectGitHubAccount(accounts, 'fongap-labs/dsh-plugin').id, 'team')
    assert.equal(selectGitHubAccount(accounts, 'other-user/project').id, 'personal')
  })
  it('rejects unknown and conflicting account assignments', () => {
    assert.throws(() => selectGitHubAccount(accounts, 'unknown/repository'), /no GitHub account/)
    assert.throws(() => selectGitHubAccount([...accounts, {
      id: 'duplicate-pattern', tokenEnv: 'GITHUB_TOKEN_DUP', repositories: ['fongap-labs/*'],
    }], 'fongap-labs/unmatched'), /ambiguous/)
  })
  it('accepts standard HTTPS and SSH GitHub origins but not arbitrary hosts', () => {
    assert.equal(repositoryFromRemote('https://github.com/fongap-labs/delta.git'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('git@github.com:fongap-labs/delta.git'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('ssh://git@github.com/fongap-labs/delta'), 'fongap-labs/delta')
    assert.equal(repositoryFromRemote('https://evil.example/fongap-labs/delta'), undefined)
    assert.equal(repositoryFromRemote('https://github.com.evil.example/fongap-labs/delta'), undefined)
  })
  it('validates configuration without revealing or storing tokens', () => {
    assert.deepEqual(validateGitHubAccounts(undefined), [])
    assert.throws(() => validateGitHubAccounts([{ id: 'bad', tokenEnv: 'invalid-name', repositories: ['fongap-labs/*'] }]), /tokenEnv/)
    assert.throws(() => validateGitHubAccounts([{ id: 'one', tokenEnv: 'GH_ONE', repositories: ['*'] }]), /repositories/)
    const config = normalizeConfig({ github: { enabled: true, accounts } })
    assert.equal(config.githubEnabled, true)
    assert.equal(config.githubAllowWrites, false)
    assert.equal(config.githubAccounts.length, 3)
  })
  it('registers GitHub tools only with mapped accounts', () => {
    const noop = { get: () => undefined }
    const enabled = normalizeConfig({ github: { accounts } })
    assert.deepEqual(createGitHubTools(noop, enabled).map((tool) => tool.name), [
      'code_github_connection', 'code_github_file', 'code_github_pulls',
      'code_github_branch', 'code_github_commit_file', 'code_github_create_pr',
    ])
  })
  it('does not read missing tokens or allow remote writes', async () => {
    const config = normalizeConfig({ github: { accounts } })
    const tools = createGitHubTools({ get: () => undefined }, config)
    const exec = { signal: new AbortController().signal }
    await assert.rejects(tools[0].execute({ repository: 'unknown/repo' }, exec), /no GitHub account/)
    await assert.rejects(tools[3].execute({ repository: 'fongap-labs/delta', branch: 'feat/test' }, exec), /writes are disabled/)
  })
})

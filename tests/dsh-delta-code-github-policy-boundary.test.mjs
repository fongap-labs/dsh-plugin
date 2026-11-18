import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  selectGitHubAccount, repositoryFromRemote, isValidGitHubRepository,
  validatedCommitSha, validPath, validBranch,
} from '../packages/dsh-delta-code/lib/delta-code-repository/github-policy.js'
import { selectGitHubAccount as legacySelector } from '../packages/dsh-delta-code/lib/tools/github.js'

describe('Delta Code Host-neutral GitHub policy', () => {
  it('contains no DSH SDK, Host service or HTTP dependencies', () => {
    const src = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-repository/github-policy.ts', import.meta.url), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'Context', 'ToolDefinition', 'node:fs', 'fetch(']) {
      assert.equal(src.includes(forbidden), false, forbidden)
    }
  })

  it('keeps explicit repository account routing independent from the Host', () => {
    const accounts = [
      { owner: 'personal', tokenEnv: 'PERSONAL', repositories: ['personal/backend'] },
      { owner: 'company', tokenEnv: 'COMPANY' },
    ]
    assert.equal(selectGitHubAccount(accounts, 'PERSONAL/BACKEND').owner, 'personal')
    assert.equal(selectGitHubAccount(accounts, 'company/other').owner, 'company')
    assert.strictEqual(legacySelector(accounts, 'personal/backend'), accounts[0])
    assert.throws(() => selectGitHubAccount(accounts, 'other/repo'), /no GitHub account/)
  })

  it('preserves conservative repository, branch, path and SHA validation', () => {
    assert.equal(isValidGitHubRepository('owner/project'), true)
    assert.equal(isValidGitHubRepository('owner/../project'), false)
    assert.equal(repositoryFromRemote('https://github.com/owner/project.git'), 'owner/project')
    assert.equal(repositoryFromRemote('https://github.com.evil.example/owner/project'), undefined)
    assert.equal(validPath('dir/file name.txt'), 'dir/file%20name.txt')
    assert.throws(() => validPath('../secret.txt'), /unsafe/)
    assert.equal(validBranch('feature/work'), 'feature/work')
    assert.throws(() => validBranch('refs/../main'), /invalid/)
    assert.equal(validatedCommitSha('a'.repeat(40), 'head'), 'a'.repeat(40))
    assert.throws(() => validatedCommitSha('not-a-sha', 'head'), /invalid/)
  })
})

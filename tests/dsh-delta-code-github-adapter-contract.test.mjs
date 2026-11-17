import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/delta-code-repository/github.js'
import { GitHubApiFailure, GitHubWriteUncertain } from '../packages/dsh-delta-code/lib/delta-code-adapter/contracts/github.js'

describe('Delta Code GitHub port', () => {
  it('routes an explicit repository through a supplied transport without reading credentials', async () => {
    const requests = []
    const transport = {
      async request(input) {
        requests.push(input)
        return {
          repository: input.repository, account: input.account,
          data: { private: false, permissions: { push: true } },
        }
      },
    }
    const settings = normalizeConfig({ github: { accounts: [
      { owner: 'personal', tokenEnv: 'DSH_PERSONAL_TOKEN' },
      { owner: 'company', tokenEnv: 'DSH_COMPANY_TOKEN' },
    ] } })
    const connection = createGitHubTools({ get: () => undefined }, settings, transport)
      .find(tool => tool.name === 'code_github_connection')
    const signal = new AbortController().signal
    const personal = await connection.execute({ repository: 'personal/project' }, { signal })
    const company = await connection.execute({ repository: 'company/project' }, { signal })
    assert.deepEqual(requests.map(x => [x.repository, x.account, x.tokenEnv]), [
      ['personal/project', 'personal', 'DSH_PERSONAL_TOKEN'],
      ['company/project', 'company', 'DSH_COMPANY_TOKEN'],
    ])
    assert.equal(personal.account, 'personal')
    assert.equal(company.account, 'company')
    assert.ok(requests.every(x => x.method === 'GET' && x.signal === signal))
  })

  it('does not reach a provider when the account is not authorized', async () => {
    let calls = 0
    const settings = normalizeConfig({ github: { accounts: [
      { owner: 'company', tokenEnv: 'DSH_COMPANY_TOKEN' },
    ] } })
    const transport = { async request() { calls++; throw Error('should not request') } }
    const connection = createGitHubTools({ get: () => undefined }, settings, transport)[0]
    await assert.rejects(
      connection.execute({ repository: 'personal/project' }, { signal: new AbortController().signal }),
      /no GitHub account/,
    )
    assert.equal(calls, 0)
  })

  it('defines external HTTP failure semantics in the stable adapter contract', () => {
    assert.equal(new GitHubApiFailure(403, 'company/project', 'GET').status, 403)
    assert.match(new GitHubWriteUncertain('POST', 'company/project').message, /unconfirmed/)
    const source = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-repository/github.ts', import.meta.url), 'utf8')
    assert.equal(source.includes('delta-code-adapter/providers/'), false)
  })
})

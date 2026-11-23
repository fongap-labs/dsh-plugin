import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  createGitHubTools as legacyTools, selectGitHubAccount as legacySelector,
} from '../packages/delta-code/lib/tools/github.js'
import { createGitHubTools as repositoryTools, createGitHubToolSpecs } from '../packages/delta-code/lib/delta-code-repository/github.js'
import { createGitHubTools as adapterTools } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/github.js'
import { selectGitHubAccount } from '../packages/delta-code/lib/delta-code-repository/github-policy.js'

describe('Delta Code GitHub business and DSH registration boundary', () => {
  it('preserves the old tool export and account policy identity', () => {
    assert.notStrictEqual(legacyTools, adapterTools) // legacy entrypoint injects its default transport
    assert.strictEqual(repositoryTools, adapterTools)
    const legacyFacade = readFileSync(new URL('../packages/delta-code/src/tools/github.ts', import.meta.url), 'utf8')
    assert.ok(legacyFacade.includes('createGitHubTransport(settings.githubAccounts)'))
    assert.strictEqual(legacySelector, selectGitHubAccount)
  })

  it('keeps account routing, guarded writes, PR and CI logic in Repository', () => {
    const dir = new URL('../packages/delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-repository/github.ts', dir), 'utf8')
    const operations = readFileSync(new URL('delta-code-repository/github-operations.ts', dir), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/github.ts', dir), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', dir), 'utf8')
    for (const source of [facade, operations]) {
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'defineTool(', 'ctx.get(', 'ToolDefinition', 'node:fs']) {
        assert.equal(source.includes(forbidden), false, forbidden)
      }
    }
    assert.ok(operations.includes('GitHubWriteUncertain'))
    assert.ok(operations.includes('selectGitHubAccount(settings.githubAccounts, repo, exec.account)'))
    assert.ok(operations.includes("if (!settings.githubAllowWrites)"))
    assert.ok(adapter.includes("args: ['remote', 'get-url', 'origin']"))
    assert.ok(adapter.includes('createGitHubToolSpecs(settings, transport, resolveRepo)'))
    assert.ok(factory.includes("from './github.js'"))
  })

  it('routes account-bound read-only tools and blocks writes before transport', async () => {
    const requests = []
    const settings = { githubAccounts: [{ owner: 'sample' }], githubAllowWrites: false }
    const transport = {
      async request(input) {
        requests.push(input)
        return { repository: input.repository, account: input.account,
          data: { private: true, permissions: { push: false } } }
      },
    }
    const specs = createGitHubToolSpecs(settings, transport, async () => 'sample/repo')
    const exec = { signal: new AbortController().signal }
    const connection = specs.find(tool => tool.name === 'code_github_connection')
    const result = await connection.execute({ repository: 'sample/repo' }, exec)
    assert.equal(result.repository, 'sample/repo')
    assert.equal(result.account, 'sample')
    assert.equal(requests.length, 1)
    const creation = specs.find(tool => tool.name === 'code_github_branch')
    await assert.rejects(creation.execute({ branch: 'feature/change' }, exec), /GitHub writes are disabled/)
    assert.equal(requests.length, 1)
  })

  it('prevents any Repository source file from owning DSH SDK or raw Host execution', () => {
    const root = new URL('../packages/delta-code/src/delta-code-repository/', import.meta.url)
    for (const name of readdirSync(root).filter(n => n.endsWith('.ts'))) {
      const source = readFileSync(new URL(name, root), 'utf8')
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'defineTool(', 'requireHostFs(', 'lookupDshHostFs(', 'ctx.get(', 'process.env']) {
        assert.equal(source.includes(forbidden), false, name + ' contains ' + forbidden)
      }
    }
  })
})

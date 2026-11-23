import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  selectGitHubAccount, repositoryFromRemote, isValidGitHubRepository,
  validatedCommitSha, validPath, validBranch,
} from '../packages/delta-code/lib/delta-code-repository/github-policy.js'
import { selectGitHubAccount as legacySelector } from '../packages/delta-code/lib/tools/github.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'
import { createGitHubToolSpecs } from '../packages/delta-code/lib/delta-code-repository/github-operations.js'

describe('Delta Code Host-neutral GitHub policy', () => {
  it('contains no DSH SDK, Host service or HTTP dependencies', () => {
    const src = readFileSync(new URL('../packages/delta-code/src/delta-code-repository/github-policy.ts', import.meta.url), 'utf8')
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


describe('Delta Code bounded GitHub file output', () => {
  const full = 'x'.repeat(30_000) + '\nTAIL-ERROR'
  const entries = Array.from({ length: 230 }, (_, i) => ({
    name: 'f' + i, path: 'src/f' + i, type: 'file',
  }))
  const settings = normalizeConfig({
    github: { accounts: [{ owner: 'fongap-labs', tokenEnv: 'DUMMY_GITHUB_TOKEN' }] },
  })
  const transport = {
    async request({ repository, account, path }) {
      return {
        repository, account,
        data: path.includes('folder') ? entries : {
          path: 'src/large.log', type: 'file', sha: 'f'.repeat(40),
          size: Buffer.byteLength(full), encoding: 'base64',
          content: Buffer.from(full).toString('base64'),
        },
      }
    },
  }
  const getTool = () => createGitHubToolSpecs(settings, transport, async repository => repository)
    .find(spec => spec.name === 'code_github_file')
  const exec = { signal: new AbortController().signal }

  it('paginates long files and preserves SHA and explicit incomplete-evidence markers', async () => {
    const tool = getTool()
    let offset = 0
    let combined = ''
    let pages = 0
    while (true) {
      const output = await tool.execute({
        repository: 'fongap-labs/project', path: 'src/large.log', offset,
      }, exec)
      const payload = JSON.parse(output.result)
      assert.equal(payload.sha, 'f'.repeat(40))
      assert.equal(payload.totalCharacters, full.length)
      assert.ok(payload.content.length <= 12_000)
      assert.equal(payload.offset, offset)
      combined += payload.content
      pages++
      if (!payload.truncated) {
        assert.equal(payload.nextOffset, null)
        break
      }
      assert.ok(payload.nextOffset > offset)
      offset = payload.nextOffset
    }
    assert.equal(combined, full)
    assert.equal(pages, 3)
  })

  it('limits directory entries and rejects invalid offsets before remote reads', async () => {
    const tool = getTool()
    const page1 = JSON.parse((await tool.execute({
      repository: 'fongap-labs/project', path: 'folder',
    }, exec)).result)
    assert.equal(page1.entries.length, 100)
    assert.equal(page1.totalEntries, 230)
    assert.equal(page1.nextOffset, 100)
    assert.equal(page1.truncated, true)
    const page3 = JSON.parse((await tool.execute({
      repository: 'fongap-labs/project', path: 'folder', offset: 200,
    }, exec)).result)
    assert.equal(page3.entries.length, 30)
    assert.equal(page3.truncated, false)
    await assert.rejects(tool.execute({
      repository: 'fongap-labs/project', path: 'src/large.log', offset: -1,
    }, exec), /invalid GitHub file offset/)
    await assert.rejects(tool.execute({
      repository: 'fongap-labs/project', path: 'src/large.log', offset: 1_000_000,
    }, exec), /exceeds content length/)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createLspProbeTool } from '../packages/dsh-delta-code/lib/tools/lsp.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/tools/github.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const exec = { signal: new AbortController().signal }

describe('Code Worker DSH subprocess authority', () => {
  it('does not execute an LSP probe through Node if the Host rejected the subprocess', async () => {
    let calls = 0
    const ctx = {
      get: () => undefined,
      subprocess: { spawn() { calls += 1; throw new Error('host denied lsp probe') } },
    }
    const settings = normalizeConfig({
      workspaceRoot: process.cwd(),
      lsp: { servers: [{ language: 'node-test', command: process.execPath, args: [] }] },
    })
    const result = await createLspProbeTool(ctx, settings).execute({}, exec)
    assert.equal(calls, 1)
    assert.equal(result.servers.length, 1)
    assert.equal(result.servers[0].available, false)
    assert.match(result.servers[0].note, /host denied lsp probe/)
  })

  it('does not read the GitHub origin through Node when DSH denies the git subprocess', async () => {
    let calls = 0
    const ctx = {
      get: () => undefined,
      subprocess: { spawn() { calls += 1; throw new Error('host denied origin lookup') } },
    }
    const settings = normalizeConfig({
      workspaceRoot: process.cwd(),
      github: { accounts: [{ owner: 'example-owner', tokenEnv: 'DSH_MISSING_TEST_TOKEN' }] },
    })
    const connection = createGitHubTools(ctx, settings)
      .find(tool => tool.name === 'code_github_connection')
    assert.ok(connection)
    await assert.rejects(connection.execute({}, exec), /host denied origin lookup/)
    assert.equal(calls, 1)
  })
})

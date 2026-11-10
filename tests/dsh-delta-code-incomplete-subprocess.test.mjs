import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGitStatusTool, createGitDiffTool } from '../packages/dsh-delta-code/lib/tools/git.js'
import { createWorkspaceMapTool } from '../packages/dsh-delta-code/lib/tools/workspace.js'
import { createLspProbeTool } from '../packages/dsh-delta-code/lib/tools/lsp.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const execution = () => ({ signal: new AbortController().signal })
const unavailableHost = { get: () => undefined, subprocess: {} }

describe('DSH Code Worker incomplete subprocess authority', () => {
  it('refuses the local Node fallback for Git status and diff when Host subprocess exists without spawn', async () => {
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    for (const tool of [createGitStatusTool(unavailableHost, settings), createGitDiffTool(unavailableHost, settings)]) {
      await assert.rejects(
        tool.execute({}, execution()),
        /host subprocess service unavailable; refusing fallback/,
      )
    }
  })

  it('refuses the local Node fallback for workspace indexing with incomplete Host subprocess', async () => {
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    await assert.rejects(
      createWorkspaceMapTool(unavailableHost, settings).execute({}, execution()),
      /host subprocess service unavailable; refusing fallback/,
    )
  })

  it('marks an LSP probe unavailable rather than executing a local server with incomplete Host subprocess', async () => {
    const settings = normalizeConfig({ workspaceRoot: process.cwd(), lsp: {
      servers: [{ language: 'node', command: process.execPath, args: ['--version'] }],
    } })
    const result = await createLspProbeTool(unavailableHost, settings).execute({}, execution())
    assert.equal(result.servers.length, 1)
    assert.equal(result.servers[0].available, false)
    assert.match(result.servers[0].note, /host subprocess service unavailable; refusing fallback/)
  })
})

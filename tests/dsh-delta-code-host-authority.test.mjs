import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoot, normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createWorkspaceMapTool } from '../packages/dsh-delta-code/lib/tools/workspace.js'

describe('DSH Code Worker host authority', () => {
  it('propagates a denied Host workspace instead of falling back to a configured local path', async () => {
    let calls = 0
    const ctx = {
      get(name) {
        if (name === 'workingDirectory') return {
          async ensure() {
            calls += 1
            throw new Error('host refused workspace access')
          },
        }
        return undefined
      },
    }
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    await assert.rejects(
      resolveRoot(ctx, { agent: { id: 'agent-1' }, signal: new AbortController().signal }, settings),
      /host refused workspace access/,
    )
    assert.equal(calls, 1)
  })

  it('never starts a local Git process after Host refuses workspace indexing', async () => {
    let calls = 0
    const ctx = {
      get: () => undefined,
      subprocess: {
        spawn() {
          calls += 1
          throw new Error('host refused tracked file enumeration')
        },
      },
    }
    const tool = createWorkspaceMapTool(ctx, normalizeConfig({ workspaceRoot: process.cwd() }))
    await assert.rejects(
      tool.execute({}, { signal: new AbortController().signal }),
      /host refused tracked file enumeration/,
    )
    assert.equal(calls, 1)
  })
})

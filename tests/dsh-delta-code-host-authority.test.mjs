import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRoot, normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createWorkspaceMapTool } from '../packages/dsh-delta-code/lib/tools/workspace.js'
import { lookupDshWorkingDirectory } from '../packages/dsh-delta-code/lib/host-adapter.js'

describe('DSH Code Worker host authority', () => {
  it('does not use a configured local cwd when workingDirectory lookup is refused', async () => {
    const ctx = { get(name) {
      if (name === 'workingDirectory') throw Error('inaccessible service')
    } }
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    assert.throws(() => lookupDshWorkingDirectory(ctx), /refusing local fallback/)
    await assert.rejects(
      resolveRoot(ctx, { agent: {}, signal: new AbortController().signal }, settings),
      /workingDirectory service inaccessible; refusing local fallback/,
    )
  })

  it('does not use local cwd when a mounted workingDirectory has no ensure method', async () => {
    const ctx = { get(name) {
      return name === 'workingDirectory' ? { otherMethod() {} } : undefined
    } }
    await assert.rejects(
      resolveRoot(ctx, { agent: {}, signal: new AbortController().signal },
        normalizeConfig({ workspaceRoot: process.cwd() })),
      /workingDirectory missing ensure; refusing local fallback/,
    )
  })

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

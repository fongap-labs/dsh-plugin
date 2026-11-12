import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHostProbeTool, inspectHostCapabilities } from '../packages/dsh-delta-code/lib/tools/host-probe.js'

const run = (tool) => tool.execute({}, { signal: new AbortController().signal })

describe('DSH Code Worker native Host diagnostics', () => {
  it('reports only method presence without calling privileged services', async () => {
    const calls = []
    const fs = {
      resolve() { calls.push('resolve') },
      readText() { calls.push('read') },
      writeText() { calls.push('write') },
    }
    const ctx = {
      get(key) {
        calls.push('get:' + key)
        if (key === 'fs') return fs
        if (key === 'workingDirectory') return { ensure() { calls.push('ensure') } }
      },
      subprocess: { spawn() { calls.push('spawn') } },
      tools: { register() { calls.push('register') } },
    }
    const result = await run(createHostProbeTool(ctx))
    assert.equal(result.adapterVersion, 'dsh-cordis-v1')
    assert.equal(result.fsState, 'mounted')
    assert.equal(result.workspaceState, 'mounted')
    assert.equal(result.fsAccessible, true)
    assert.equal(result.fsWriteText, true)
    assert.equal(result.subprocessSpawn, true)
    assert.equal(result.workspaceEnsure, true)
    assert.equal(result.toolRegistry, true)
    assert.equal(result.writeContract, 'unverified')
    assert.deepEqual(calls, ['get:fs', 'get:workingDirectory'])
  })

  it('reports incomplete or inaccessible Host capabilities without local fallback', async () => {
    const ctx = {
      get(name) {
        if (name === 'fs') throw new Error('Host service not injected')
        if (name === 'workingDirectory') return { ensure: undefined }
      },
      subprocess: { spawn: undefined },
      tools: {},
    }
    const result = inspectHostCapabilities(ctx)
    assert.equal(result.adapterVersion, 'dsh-cordis-v1')
    assert.equal(result.fsState, 'inaccessible')
    assert.equal(result.workspaceState, 'mounted')
    assert.equal(result.fsAccessible, false)
    assert.equal(result.fsResolve, false)
    assert.equal(result.fsWriteText, false)
    assert.equal(result.subprocessMounted, true)
    assert.equal(result.subprocessSpawn, false)
    assert.equal(result.workspaceAccessible, true)
    assert.equal(result.workspaceEnsure, false)
    assert.equal(result.toolRegistry, false)
  })

  it('honors cancellation before inspecting Host services', async () => {
    let gets = 0
    const tool = createHostProbeTool({ get() { gets += 1 } })
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      tool.execute({}, { signal: controller.signal }),
      /host probe cancelled/,
    )
    assert.equal(gets, 0)
  })
})

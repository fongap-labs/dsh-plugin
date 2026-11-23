import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHostProbeTool as oldTool, inspectHostCapabilities as oldProbe } from '../packages/delta-code/lib/tools/host-probe.js'
import { createHostProbeTool as nativeTool, inspectHostCapabilities as nativeProbe } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/host-probe.js'

const root = new URL('../packages/delta-code/src/', import.meta.url)

describe('Delta Code DSH Host probe boundary', () => {
  it('keeps Host SDK and capability lookup exclusively in the DSH adapter', () => {
    const shim = readFileSync(new URL('delta-code-coding/host-probe.ts', root), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/host-probe.ts', root), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', root), 'utf8')
    assert.equal(shim.includes('@deepseek-ai'), false)
    assert.equal(shim.includes('Context'), false)
    assert.equal(shim.includes('lookupDshHostFs'), false)
    assert.ok(adapter.includes("from '@deepseek-ai/cordis'"))
    assert.ok(adapter.includes('probeDshService'))
    assert.ok(factory.includes("from './host-probe.js'"))
    assert.equal(oldTool, nativeTool)
    assert.equal(oldProbe, nativeProbe)
  })

  it('remains read-only with missing or inaccessible Host services', async () => {
    const calls = []
    const host = {
      get(name) {
        calls.push('get:' + name)
        if (name === 'fs') return { resolve() { throw Error('FS method must not run') } }
        if (name === 'workingDirectory') throw Error('workspace denied')
      },
      subprocess: { spawn() { throw Error('subprocess must not run') } },
      tools: { register() { throw Error('registration must not run') } },
    }
    const tool = oldTool(host)
    const result = await tool.execute({}, { signal: new AbortController().signal })
    assert.equal(result.fsResolve, true)
    assert.equal(result.workspaceState, 'inaccessible')
    assert.equal(result.writeContract, 'unverified')
    assert.deepEqual(calls, ['get:fs', 'get:workingDirectory'])
  })
})

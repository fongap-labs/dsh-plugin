import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  inspectProject as legacyInspect,
  inspectProjectWithHost as legacyHostInspect,
  createProjectProfileTool as legacyTool,
} from '../packages/dsh-delta-code/lib/tools/profile.js'
import {
  inspectProject as codingInspect,
  inspectProjectWithHost as codingHostInspect,
  createProjectProfileTool as codingTool,
} from '../packages/dsh-delta-code/lib/delta-code-coding/profile.js'
import {
  inspectProject as adapterInspect,
  inspectProjectWithHost as adapterHostInspect,
  createProjectProfileTool as adapterTool,
} from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/profile.js'

describe('Delta Code project profile Host adapter boundary', () => {
  it('preserves legacy and Coding import identity', () => {
    assert.strictEqual(legacyInspect, adapterInspect)
    assert.strictEqual(codingInspect, adapterInspect)
    assert.strictEqual(legacyHostInspect, adapterHostInspect)
    assert.strictEqual(codingHostInspect, adapterHostInspect)
    assert.strictEqual(legacyTool, adapterTool)
    assert.strictEqual(codingTool, adapterTool)
  })

  it('keeps Host SDK, local file access and command registration inside DSH Adapter', () => {
    const src = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-coding/profile.ts', src), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/profile.ts', src), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', src), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'node:fs', 'requireHostFs(', 'defineTool(', 'readFile(', 'realpath(']) {
      assert.equal(facade.includes(forbidden), false, forbidden)
    }
    assert.ok(adapter.includes("requireHostFs(ctx, ['resolve', 'contains', 'stat', 'readText']"))
    assert.ok(adapter.includes('project profile cancelled'))
    assert.ok(adapter.includes('return inspectProject(cwd, root)'))
    assert.ok(factory.includes("from './profile.js'"))
  })
})

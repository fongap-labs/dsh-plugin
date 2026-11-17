import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createMultiEditTool as legacyTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { createMultiEditTool as codingTool } from '../packages/dsh-delta-code/lib/delta-code-coding/multi-edit.js'
import { createMultiEditTool as dshTool } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/multi-edit.js'
import {
  shouldPreflightMultiEdit, canCompensateMultiEdit,
} from '../packages/dsh-delta-code/lib/delta-code-coding/multi-edit-policy.js'

describe('Delta Code multi-edit Host adapter boundary', () => {
  it('retains old tool export identity and leaves SDK/write implementation in DSH Adapter', () => {
    assert.strictEqual(legacyTool, dshTool)
    assert.strictEqual(codingTool, dshTool)
    const src = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-coding/multi-edit.ts', src), 'utf8')
    const policy = readFileSync(new URL('delta-code-coding/multi-edit-policy.ts', src), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/multi-edit.ts', src), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', src), 'utf8')
    for (const file of [facade, policy]) {
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'writeTextSafe(', 'readTextSafe(', 'requireHostFs(', 'lookupDshHostFs(', 'defineTool(']) {
        assert.equal(file.includes(forbidden), false, forbidden)
      }
    }
    assert.ok(adapter.includes('lookupDshHostFs(ctx)'))
    assert.ok(adapter.includes('validateWriteTargetSafe(ctx, exec, root'))
    assert.ok(adapter.includes("kind: 'replaceIfVersion'"))
    assert.ok(adapter.includes('recovery readback mismatch'))
    assert.ok(adapter.includes('canCompensateMultiEdit'))
    assert.ok(factory.includes("from './multi-edit.js'"))
  })

  it('retains default multi-file preflight, explicit legacy opt-out, and guarded compensation gate', () => {
    assert.equal(shouldPreflightMultiEdit(undefined, 1), false)
    assert.equal(shouldPreflightMultiEdit(undefined, 2), true)
    assert.equal(shouldPreflightMultiEdit(false, 2), false)
    assert.equal(shouldPreflightMultiEdit(true, 1), true)
    assert.equal(canCompensateMultiEdit(true, false, 'guarded-intent'), true)
    assert.equal(canCompensateMultiEdit(false, false, 'guarded-intent'), false)
    assert.equal(canCompensateMultiEdit(true, true, 'guarded-intent'), false)
    assert.equal(canCompensateMultiEdit(true, false, 'native-unguarded'), false)
  })

  it('keeps the entire Coding implementation free of DSH SDK and raw Host invocation', () => {
    const dir = new URL('../packages/dsh-delta-code/src/delta-code-coding/', import.meta.url)
    for (const name of readdirSync(dir).filter(x => x.endsWith('.ts'))) {
      const source = readFileSync(new URL(name, dir), 'utf8')
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'defineTool(', 'requireHostFs(', 'lookupDshHostFs(', 'process.env']) {
        assert.equal(source.includes(forbidden), false, name + ' contains ' + forbidden)
      }
    }
  })
})

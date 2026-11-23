import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  registerNativeResume as legacyRegister, createNativeResumeTool as legacyTool, foldNativeResume as legacyFold,
} from '../packages/delta-code/lib/tools/resume.js'
import {
  registerNativeResume as qualityRegister, createNativeResumeTool as qualityTool, foldNativeResume as qualityFold,
} from '../packages/delta-code/lib/delta-code-quality/resume.js'
import {
  registerNativeResume as adapterRegister, createNativeResumeTool as adapterTool,
} from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/resume.js'
import { foldNativeResume as pureFold, parseResumeState } from '../packages/delta-code/lib/delta-code-quality/resume-policy.js'

describe('Delta Code native Todo resume SDK isolation', () => {
  it('preserves all native registration and event fold import identities', () => {
    assert.strictEqual(legacyRegister, adapterRegister)
    assert.strictEqual(qualityRegister, adapterRegister)
    assert.strictEqual(legacyTool, adapterTool)
    assert.strictEqual(qualityTool, adapterTool)
    assert.strictEqual(legacyFold, pureFold)
    assert.strictEqual(qualityFold, pureFold)
  })

  it('keeps projection and Git Host execution exclusively inside Adapter', () => {
    const src = new URL('../packages/delta-code/src/', import.meta.url)
    const pure = readFileSync(new URL('delta-code-quality/resume-policy.ts', src), 'utf8')
    const facade = readFileSync(new URL('delta-code-quality/resume.ts', src), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/resume.ts', src), 'utf8')
    const provider = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', src), 'utf8')
    for (const source of [pure, facade]) {
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'Context', 'defineTool(', 'sessionProjections', 'node:fs']) {
        assert.equal(source.includes(forbidden), false, forbidden)
      }
    }
    assert.ok(adapter.includes("ctx.inject(['sessionProjections']"))
    assert.ok(adapter.includes('hostOnly: true'))
    assert.ok(adapter.includes('read-only resume decision'))
    assert.ok(provider.includes("from './resume.js'"))
  })

  it('rejects malformed native checkpoints without allowing synthetic Todo completion', () => {
    assert.throws(() => parseResumeState({ tasks: null, writeSeq: 2, invalid: false }), /missing native Todo snapshot/)
    assert.throws(() => parseResumeState({ tasks: [], writeSeq: 2, invalid: true }), /invalid native Todo checkpoint/)
    const snapshot = { tasks: null, writeSeq: -1, invalid: false }
    assert.strictEqual(pureFold(snapshot, { type: 'turn/start', seq: 8 }), snapshot)
    const invalid = pureFold(snapshot, { type: 'todo/write', seq: 9, data: { todos: [{ content: '', status: 'completed' }] } })
    assert.equal(invalid.invalid, true)
  })

  it('fails closed on stale, duplicate or malformed native Todo event sequences', () => {
    const initial = { tasks: null, writeSeq: -1, invalid: false }
    const current = pureFold(initial, { type: 'todo/write', seq: 7, data: { todos: [
      { content: 'Inspect code', status: 'in_progress' },
    ] } })
    assert.equal(current.writeSeq, 7)
    assert.equal(current.invalid, false)
    for (const seq of [7, 6, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const stale = pureFold(current, { type: 'todo/write', seq, data: { todos: [
        { content: 'Inspect code', status: 'completed' },
      ] } })
      assert.equal(stale.writeSeq, 7, 'stale sequence must not overwrite last checkpoint')
      assert.equal(stale.invalid, true)
      assert.equal(stale.tasks, null)
      assert.equal(parseResumeState(stale).invalid, true)
      const recovered = pureFold(stale, { type: 'todo/write', seq: 8, data: { todos: [
        { content: 'Inspect code', status: 'in_progress' },
      ] } })
      assert.deepEqual(recovered, {
        tasks: [{ content: 'Inspect code', status: 'in_progress' }],
        writeSeq: 8, invalid: false,
      })
    }
    assert.strictEqual(pureFold(current, { type: 'turn/start', seq: 6 }), current,
      'non-Todo events never reset the task projection')
  })

  it('ensures every Quality source file remains free of DSH SDK imports and raw Host calls', () => {
    const quality = new URL('../packages/delta-code/src/delta-code-quality/', import.meta.url)
    for (const name of readdirSync(quality).filter(file => file.endsWith('.ts'))) {
      const source = readFileSync(new URL(name, quality), 'utf8')
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'defineTool(', 'requireHostFs(', 'process.env']) {
        assert.equal(source.includes(forbidden), false, name + ' contains ' + forbidden)
      }
    }
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createLspProbeTool as oldTool } from '../packages/dsh-delta-code/lib/tools/lsp.js'
import { createLspProbeTool as codingTool } from '../packages/dsh-delta-code/lib/delta-code-coding/lsp.js'
import { createLspProbeTool as dshTool } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/lsp.js'
import { classifyLspCommandResult } from '../packages/dsh-delta-code/lib/delta-code-coding/lsp-probe-policy.js'

describe('Delta Code LSP Host isolation', () => {
  it('places all DSH service and subprocess execution behind the adapter', () => {
    const root = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const coding = readFileSync(new URL('delta-code-coding/lsp.ts', root), 'utf8')
    const policy = readFileSync(new URL('delta-code-coding/lsp-probe-policy.ts', root), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/lsp.ts', root), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', root), 'utf8')
    assert.equal(oldTool, dshTool)
    assert.equal(codingTool, dshTool)
    for (const text of [coding, policy]) {
      assert.equal(text.includes('@deepseek-ai'), false)
      assert.equal(text.includes('runCommand('), false)
      assert.equal(text.includes('lookupDshHostFs'), false)
    }
    assert.ok(adapter.includes('resolveAuthorizedGitCwd'))
    assert.ok(adapter.includes('classifyLspCommandResult'))
    assert.ok(factory.includes("from './lsp.js'"))
  })

  it('keeps successful, timed-out and failed probe results semantically stable', () => {
    assert.deepEqual(classifyLspCommandResult({ exitCode: 0, timedOut: false, signal: null }), {
      available: true, note: '',
    })
    assert.deepEqual(classifyLspCommandResult({ exitCode: 0, timedOut: true, signal: null }), {
      available: false, note: 'timed out',
    })
    assert.deepEqual(classifyLspCommandResult({ exitCode: 3, timedOut: false, signal: null }), {
      available: false, note: 'exit code 3',
    })
    assert.deepEqual(classifyLspCommandResult({ exitCode: null, timedOut: false, signal: 'SIGTERM' }), {
      available: false, note: 'terminated by signal SIGTERM',
    })
  })
})

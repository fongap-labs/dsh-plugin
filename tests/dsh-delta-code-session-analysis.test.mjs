import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTranscript, compareGroups } from '../scripts/analyze-code-worker-session.mjs'

const transcript = [
  '**Tool: \x60code_git_status\x60**', '', '\x60\x60\x60json',
  '{"path":"private/secret.txt","token":"top-secret"}', '\x60\x60\x60', '',
  '**Result (error)**', '', '\x60\x60\x60', 'Host permission denied', '\x60\x60\x60', '',
  '**Tool: \x60code_git_status\x60**', '', '\x60\x60\x60json',
  '{"path":"private/secret.txt","token":"top-secret"}', '\x60\x60\x60', '',
  '**Result**', '', '\x60\x60\x60', 'status: clean', '\x60\x60\x60', '',
  '**Tool: \x60pwsh\x60**', '', '\x60\x60\x60json', '{"command":"exit 5"}',
  '\x60\x60\x60', '', '**Result**', '', '[exit code: 5]',
  '**Assistant**', '', 'No task completion claim.',
].join('\n').replaceAll('\\x60', '\x60')

describe('DSH Markdown session analysis', () => {
  it('counts errors and repeated calls without exposing sensitive arguments', () => {
    const x = analyzeTranscript(transcript)
    assert.equal(x.toolCalls, 3)
    assert.equal(x.codeWorkerCalls, 2)
    assert.equal(x.explicitToolErrors, 1)
    assert.equal(x.nonzeroExitCalls, 1)
    assert.equal(x.observedFailedCalls, 2)
    assert.equal(x.repeatCandidates, 1)
    assert.equal(x.repeatsAfterObservedFailure, 1)
    assert.deepEqual(x.byTool, { code_git_status: 2, pwsh: 1 })
    assert.equal(JSON.stringify(x).includes('top-secret'), false)
    assert.equal(JSON.stringify(x).includes('private/secret.txt'), false)
  })

  it('deduplicates an explicit error and nonzero exit within the same call', () => {
    const x = analyzeTranscript('**Tool: \x60pwsh\x60**\n\n\x60\x60\x60json\n{}\n\x60\x60\x60\n\n**Result (error)**\n\n[exit code: 1]')
    assert.equal(x.explicitToolErrors, 1)
    assert.equal(x.nonzeroExitCalls, 1)
    assert.equal(x.observedFailedCalls, 1)
  })

  it('does not invent task outcomes', () => {
    const x = analyzeTranscript('**Tool: \x60code_verify\x60**\n\n\x60\x60\x60json\n{}\n\x60\x60\x60\n\n**Result**\n\nPASS')
    assert.equal(x.toolCalls, 1)
    assert.equal(Object.hasOwn(x, 'taskSuccess'), false)
  })

  it('handles missing results and bad argument payloads', () => {
    assert.throws(() => analyzeTranscript(null), /transcript must be text/)
    const x = analyzeTranscript('**Tool: \x60read\x60**\n\nunknown arguments')
    assert.equal(x.missingResults, 1)
    assert.equal(x.unparsedArguments, 1)
  })

  it('reports numeric deltas but does not assign a causal effect', () => {
    const baseline = analyzeTranscript(transcript)
    const current = analyzeTranscript('**Tool: \x60read\x60**\n\n\x60\x60\x60json\n{}\n\x60\x60\x60\n\n**Result**')
    assert.deepEqual(compareGroups(baseline, current), {
      toolCalls: -2,
      observedFailedCalls: -2,
      repeatCandidates: -1,
      repeatsAfterObservedFailure: -1,
    })
  })
})

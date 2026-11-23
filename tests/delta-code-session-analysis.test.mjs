import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTranscript, analyzeSessions } from '../scripts/analyze-code-worker-session.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

  it('reports one session without comparison groups or private values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'delta-code-session-'))
    const path = join(dir, 'session.txt')
    try {
      await writeFile(path, transcript, 'utf8')
      const json = JSON.parse(await analyzeSessions([path]))
      assert.equal(json.schemaVersion, 2)
      assert.equal(json.summary.sessions, 1)
      assert.equal(json.summary.toolCalls, 3)
      assert.equal(json.sessions.length, 1)
      assert.equal(Object.hasOwn(json, 'groups'), false)
      assert.equal(Object.hasOwn(json, 'delta'), false)
      assert.equal(JSON.stringify(json).includes('top-secret'), false)
      assert.equal(JSON.stringify(json).includes('private/secret.txt'), false)
      assert.equal(JSON.stringify(json).includes(dir), false)
      const markdown = await analyzeSessions([path], 'markdown')
      assert.match(markdown, /Session summary \(1 sessions\)/)
      assert.doesNotMatch(markdown, /Comparison limits/)
      const script = fileURLToPath(new URL('../scripts/analyze-code-worker-session.mjs', import.meta.url))
      const cliOutput = JSON.parse(execFileSync(process.execPath,
        [script, '--session', path, '--format', 'json'], { encoding: 'utf8' }))
      assert.equal(cliOutput.summary.toolCalls, 3)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('aggregates independent observations without creating cohorts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'delta-code-session-'))
    const path = join(dir, 'session.txt')
    try {
      await writeFile(path, transcript, 'utf8')
      const json = JSON.parse(await analyzeSessions([path, path]))
      assert.equal(json.summary.sessions, 2)
      assert.equal(json.summary.toolCalls, 6)
      assert.equal(json.summary.observedFailedCalls, 4)
      assert.deepEqual(json.sessions.map(s => s.toolCalls), [3, 3])
      await assert.rejects(analyzeSessions([]), /at least one transcript/)
      await assert.rejects(analyzeSessions([path], 'invalid'), /format must be json or markdown/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

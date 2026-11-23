import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTranscript, analyzeSessions } from '../scripts/analyze-code-worker-session.mjs'
import { analyzeSessionEvents, analyzeJsonlFiles } from '../scripts/analyze-code-worker-jsonl.mjs'
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


const nativeInput = [
  { type: 'session', id: 'PRIVATE-SESSION-ID', cwd: '/private/workspace' },
  { type: 'user/message', seq: 1, time: 1000, data: { source: { kind: 'user' },
    content: [{ type: 'text', text: 'token=top-secret' }] } },
  { type: 'tool/call', seq: 2, time: 1010, data: { name: 'code_verify',
    arguments: '{"password":"top-secret"}' } },
  { type: 'tool/result', seq: 3, time: 1020, data: { message: { isError: true,
    content: [{ type: 'text', text: 'token=top-secret' }] } } },
  { type: 'tool/call', seq: 4, time: 1025, data: { name: 'code_verify',
    arguments: '{"password":"top-secret"}' } },
  { type: 'compaction/start', seq: 5, time: 1100, data: { compactionId: 'PRIVATE-ID' } },
  { type: 'compaction/summary', seq: 6, time: 1500, data: {
    compactionId: 'PRIVATE-ID', shadowedTokenCount: 123,
    summary: [{ type: 'text', text: 'model summary includes top-secret' }] } },
  { type: 'compaction/end', seq: 7, time: 1501, data: { compactionId: 'PRIVATE-ID' } },
  { type: 'tool/result', seq: 8, time: 1502, data: { message: { isError: false } } },
  { type: 'tool/call', seq: 9, time: 1510, data: { name: 'code_execution_next', arguments: '{}' } },
  { type: 'todo/write', seq: 10, time: 1600, data: { todos: [
    { content: 'private work', status: 'completed' }, { content: 'pending work', status: 'pending' },
  ] } },
  { type: 'llm/retry', seq: 11, time: 1700, data: { error: 'top-secret' } },
]

describe('native DSH JSONL session evidence', () => {
  it('reports observed events and native checkpoint timing, never task success', () => {
    const result = analyzeSessionEvents(nativeInput)
    assert.equal(result.eventCount, 11)
    assert.equal(result.userMessages, 1)
    assert.equal(result.toolCalls, 3)
    assert.equal(result.codeToolCalls, 3)
    assert.equal(result.toolResults, 2)
    assert.equal(result.toolErrors, 1)
    assert.equal(result.repeatCandidates, 1)
    assert.equal(result.compactionSummaries, 1)
    assert.equal(result.linkedSummaryCount, 1)
    assert.equal(result.compactionMedianMs, 400)
    assert.equal(result.shadowedTokenCountSum, 123)
    assert.equal(result.lastSummarySeq, 6)
    assert.equal(result.lastTodoSeq, 10)
    assert.equal(result.todoRefreshedAfterSummary, true)
    assert.equal(result.todosAfterLastSummary, 1)
    assert.equal(result.toolCallsAfterLastSummary, 1)
    assert.equal(result.elapsedMs, 700)
    assert.equal(result.modelRetryEvents, 1)
    assert.deepEqual(result.latestTodoStatus, { pending: 1, in_progress: 0, completed: 1 })
    for (const secret of ['top-secret', '/private/', 'PRIVATE', 'pending work', 'model summary']) {
      assert.equal(JSON.stringify(result).includes(secret), false)
    }
    assert.equal(Object.hasOwn(result, 'taskSuccess'), false)
  })

  it('does not mistake a summary without a later Todo event for recovery', () => {
    const result = analyzeSessionEvents(nativeInput.filter(event => event.seq !== 10))
    assert.equal(result.compactionSummaries, 1)
    assert.equal(result.todoRefreshedAfterSummary, false)
    assert.equal(result.todosAfterLastSummary, 0)
  })

  it('uses only events after the latest compaction summary for active checkpoint counts', () => {
    const events = [...nativeInput,
      { type: 'compaction/start', seq: 12, time: 1800, data: { compactionId: 'next' } },
      { type: 'compaction/summary', seq: 13, time: 2100, data: { compactionId: 'next' } },
      { type: 'tool/call', seq: 14, time: 2150, data: { name: 'read', arguments: '{}' } }]
    const result = analyzeSessionEvents(events)
    assert.equal(result.compactionSummaries, 2)
    assert.equal(result.compactionMedianMs, 300)
    assert.equal(result.todoRefreshedAfterSummary, false)
    assert.equal(result.toolCallsAfterLastSummary, 1)
  })

  it('rejects duplicate sequence or malformed session headers', () => {
    assert.throws(() => analyzeSessionEvents([
      { type: 'todo/write', seq: 2 }, { type: 'todo/write', seq: 2 }]), /reordered/)
    assert.throws(() => analyzeSessionEvents([{ type: 'tool/call', seq: -1 }]), /invalid/)
    assert.throws(() => analyzeSessionEvents([
      { type: 'session', id: 'a' }, { type: 'session', id: 'b' }]), /invalid/)
  })

  it('streams extracted JSONL offline without returning file paths or raw user content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'delta-code-jsonl-'))
    const file = join(dir, 'session.v4.jsonl')
    try {
      await writeFile(file, nativeInput.map(event => JSON.stringify(event)).join('\n') + '\n')
      const result = await analyzeJsonlFiles([file, file])
      assert.equal(result.sessions.length, 2)
      assert.equal(result.sessions[0].toolCalls, 3)
      assert.match(result.interpretation, /overlapping exports/)
      assert.equal(JSON.stringify(result).includes(dir), false)
      assert.equal(JSON.stringify(result).includes('top-secret'), false)
      const script = fileURLToPath(new URL('../scripts/analyze-code-worker-jsonl.mjs', import.meta.url))
      const output = JSON.parse(execFileSync(process.execPath,
        [script, '--session', file], { encoding: 'utf8' }))
      assert.equal(output.sessions[0].compactionSummaries, 1)
      await assert.rejects(analyzeJsonlFiles([]), /1\.\.12/)
      await writeFile(file, '{bad json}')
      await assert.rejects(analyzeJsonlFiles([file]), /invalid session JSONL/)
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})

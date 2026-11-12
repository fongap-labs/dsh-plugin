import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { InternalAbExperiment, createInternalAbReportTool } from '../packages/dsh-delta-code/lib/ab-metrics.js'
import { registerAutomaticCodingRouter } from '../packages/dsh-delta-code/lib/auto-routing.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

function fixture(allocate = () => 'guided') {
  const listeners = new Map()
  const experiment = new InternalAbExperiment(allocate)
  let context
  const ctx = {
    on(event, callback) {
      listeners.set(event, callback)
      return () => listeners.delete(event)
    },
    inject(services, callback) {
      assert.deepEqual(services, ['systemPrompt'])
      callback({ systemPrompt: {
        context(entry) { context = entry; return () => { context = undefined } },
      } })
    },
  }
  const dispose = registerAutomaticCodingRouter(ctx, () => normalizeConfig({}), experiment)
  const claim = (agent, text) => listeners.get('agent/inbox/claimed')?.({
    agent, message: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
  })
  return { experiment, dispose, claim, render: agent => context?.text({ agent }) ?? '' }
}
const event = (type, seq, data) => ({ type, seq, data })
const toolCall = (seq, callId, name, args = '{}') =>
  event('tool/call', seq, { turn: 1, step: 1, callId, name, arguments: args })
const toolResult = (seq, callId, isError = false) =>
  event('tool/result', seq, { message: { toolCallId: callId, isError } })

describe('automatic internal Code Worker A/B', () => {
  it('assigns eligible sessions automatically and only varies dynamic routing guidance', () => {
    const assignments = ['native', 'guided']
    const f = fixture(() => assignments.shift())
    try {
      const a = { session: {} }, b = { session: {} }, c = {}
      f.claim(a, '修复 GitHub CI 红叉')
      f.claim(b, '实现 React 新功能')
      f.claim(c, '实现 React 新功能')
      assert.equal(f.render(a), '')
      assert.match(f.render(b), /code-feature-delivery/)
      assert.match(f.render(c), /code-feature-delivery/, 'missing session keeps current behavior')
      f.claim(a, '继续')
      assert.equal(f.render(a), '', 'group remains fixed for continuation')
      const groups = f.experiment.report()
      assert.equal(groups.native.sessions, 1)
      assert.equal(groups.guided.sessions, 1)
      assert.equal(groups.native.routeCounts['code-ci-repair'], 1)
      assert.equal(groups.guided.routeCounts['code-feature-delivery'], 1)
    } finally { f.dispose() }
  })

  it('observes native and Code Worker tools with paired error and bounded repeat attribution', () => {
    const f = fixture(() => 'guided')
    const session = {}
    const agent = { session }
    try {
      f.claim(agent, '修复 PR #77 CI 红叉')
      const args = JSON.stringify({ path: 'sensitive/private.txt', token: 'secret-value' })
      f.experiment.observe(session, toolCall(1, 'a', 'read', args))
      f.experiment.observe(session, toolResult(2, 'a', true))
      f.experiment.observe(session, toolCall(3, 'b', 'read', args))
      f.experiment.observe(session, toolResult(4, 'b'))
      f.experiment.observe(session, toolCall(5, 'c', 'code_verify_suite'))
      f.experiment.observe(session, toolResult(6, 'c'))
      f.experiment.observe(session, event('assistant/message', 7, {
        usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5 },
      }))
      f.experiment.observe(session, event('turn/end', 8, { reason: { kind: 'completed' } }))
      f.experiment.observe(session, event('turn/end', 8, { reason: { kind: 'completed' } }))
      const x = f.experiment.report().guided
      assert.equal(x.toolCalls, 3)
      assert.equal(x.nativeToolCalls, 2)
      assert.equal(x.codeWorkerCalls, 1)
      assert.equal(x.toolErrors, 1)
      assert.equal(x.repeatCandidates, 1)
      assert.equal(x.repeatsAfterFailure, 1)
      assert.equal(x.turns, 1)
      assert.equal(x.completedTurns, 1)
      assert.equal(x.billedTokens, 155)
      assert.equal(x.usageSamples, 1)
      assert.equal(JSON.stringify(f.experiment.report()).includes('secret-value'), false)
      assert.equal(JSON.stringify(f.experiment.report()).includes('sensitive/private.txt'), false)
    } finally { f.dispose() }
  })

  it('ignores unassigned sessions and incomplete events without recording raw contents', () => {
    const f = fixture()
    try {
      const ignored = {}
      f.experiment.observe(ignored, toolCall(1, 'a', 'read'))
      assert.equal(f.experiment.report().guided.toolCalls, 0)
      f.claim({ session: ignored }, '今晚吃什么')
      assert.equal(f.experiment.report().guided.sessions, 0)
      f.claim({ session: ignored }, '实现 React 新功能')
      f.experiment.observe(ignored, event('tool/call', 1, { name: 'read', arguments: '{"secret":1}' }))
      f.experiment.observe(ignored, event('tool/result', 2, { message: { toolCallId: 'a', isError: true } }))
      assert.equal(f.experiment.report().guided.toolCalls, 0)
      const report = createInternalAbReportTool(f.experiment)
      const output = report.execute({}, { signal: new AbortController().signal })
      assert.ok(output instanceof Promise)
    } finally { f.dispose() }
  })

  it('isolates groups, discards overlarge arguments and clears memory on dispose', () => {
    const arms = ['native', 'guided']
    const f = fixture(() => arms.shift())
    const a = { session: {} }, b = { session: {} }
    try {
      f.claim(a, '修复 CI 红叉'); f.claim(b, '修复 CI 红叉')
      f.experiment.observe(a.session, toolCall(1, 'x', 'read', 'x'.repeat(20_000)))
      f.experiment.observe(a.session, toolCall(2, 'y', 'read', 'x'.repeat(20_000)))
      f.experiment.observe(a.session, event('turn/end', 3, { reason: { kind: 'error' } }))
      f.experiment.observe(b.session, toolCall(1, 'z', 'write'))
      const s = f.experiment.report()
      assert.equal(s.native.repeatCandidates, 0)
      assert.equal(s.native.errorTurns, 1)
      assert.equal(s.guided.toolCalls, 1)
      f.experiment.clear()
      assert.equal(f.experiment.report().native.sessions, 0)
      assert.equal(f.experiment.report().guided.toolCalls, 0)
    } finally { f.dispose() }
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ExecutionStats, createExecutionStatsTool } from '../packages/delta-code/lib/execution-stats.js'

const signal = new AbortController().signal
const execution = session => ({ agent: { session }, signal })
const verifiedStep = passed => ({
  passed, exitCode: passed ? 0 : 2,
  outcome: passed ? 'succeeded' : 'failed',
  timedOut: false, truncated: false, signal: '',
})
const verifiedSuite = passed => ({
  passed, scope: 'focused', results: [verifiedStep(passed)], skipped: [],
})

describe('Code Worker native session execution metrics', () => {
  it('counts identical tool requests but never records raw payloads', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const tool = stats.wrap({
      name: 'code_workflow_route',
      execute: async () => ({ mode: 'fast' }),
    })
    const payload = { secret: 'should-not-appear-in-metrics', path: 'project/private.ts' }
    await tool.execute(payload, execution(session))
    await tool.execute(payload, execution(session))
    const snapshot = stats.read(execution(session))
    assert.equal(snapshot.scope, 'current-session')
    assert.equal(snapshot.calls, 2)
    assert.equal(snapshot.duplicateCalls, 1)
    assert.equal(snapshot.repeatedFailedCalls, 0)
    assert.equal(snapshot.tools[0].calls, 2)
    assert.equal(JSON.stringify(snapshot).includes(payload.secret), false)
    assert.equal(JSON.stringify(snapshot).includes(payload.path), false)
    stats.clear()
    assert.equal(stats.read(execution(session)).calls, 0)
  })

  it('observes native result events only by name and without double-counting Delta tools', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const agent = { session }
    const own = stats.wrap({ name: 'code_verify', execute: async () => verifiedStep(true) })
    await own.execute({ secret: 'sensitive token' }, { agent, signal })
    stats.observeNativeResult({ agent, name: 'code_verify' }, { isError: false })
    stats.observeNativeResult({ agent, name: 'read', arguments: { secret: 'hidden' } }, { isError: false })
    stats.observeNativeResult({ agent, name: 'read' }, { isError: true })
    stats.observeNativeResult({ agent, name: 'skill' }, { value: { secret: 'hidden' } })
    stats.observeNativeResult({ agent, name: 'bad name with spaces' }, { isError: true })
    const snap = stats.read({ agent, signal })
    assert.equal(snap.calls, 1)
    assert.equal(snap.nativeResults, 3)
    assert.equal(snap.nativeErrors, 1)
    assert.equal(snap.nativeUnconfirmed, 1)
    assert.deepEqual(snap.nativeTools, [
      { name: 'read', results: 2, errors: 1 },
      { name: 'skill', results: 1, errors: 0 },
    ])
    assert.equal(JSON.stringify(snap).includes('sensitive token'), false)
    assert.equal(JSON.stringify(snap).includes('hidden'), false)
    assert.equal(stats.read(execution({})).nativeResults, 0)
  })

  it('distinguishes thrown errors, failed results and repeated failed requests', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const rejected = stats.wrap({
      name: 'code_git_status',
      execute: async () => { throw Error('Host permission denied: credential value') },
    })
    for (let i = 0; i < 2; i++) {
      await assert.rejects(rejected.execute({ cwd: 'private/source' }, execution(session)), /permission denied/)
    }
    const verification = stats.wrap({
      name: 'code_verify_suite',
      execute: async () => verifiedSuite(false),
    })
    await verification.execute({ scripts: ['test'] }, execution(session))
    const gate = stats.wrap({
      name: 'code_delivery_gate',
      execute: async () => ({ stage: 'blocked' }),
    })
    await gate.execute({}, execution(session))
    const snapshot = stats.read(execution(session))
    assert.equal(snapshot.calls, 4)
    assert.equal(snapshot.duplicateCalls, 1)
    assert.equal(snapshot.repeatedFailedCalls, 1)
    assert.equal(stats.readRepeatedFailedCalls(execution(session).agent), 1)
    assert.equal(stats.readRepeatedFailedCalls({ session: {} }), 0)
    assert.equal(snapshot.errors, 2)
    assert.equal(snapshot.failedOutcomes, 2)
    assert.equal(snapshot.failureKinds.permission, 2)
    assert.equal(snapshot.verificationFailed, 1)
    assert.equal(snapshot.verificationUnconfirmed, 0)
    assert.equal(snapshot.deliveryBlocked, 1)
    assert.equal(JSON.stringify(snapshot).includes('credential'), false)
  })

  it('counts only explicit verification and delivery evidence', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const verification = stats.wrap({
      name: 'code_verify_suite', execute: async () => verifiedSuite(true),
    })
    const gate = stats.wrap({
      name: 'code_delivery_gate', execute: async () => ({ stage: 'verified', ready: true }),
    })
    const resume = stats.wrap({
      name: 'code_resume', execute: async () => ({ stage: 'reconcile' }),
    })
    await verification.execute({}, execution(session))
    await resume.execute({}, execution(session))
    await gate.execute({}, execution(session))
    const result = stats.read(execution(session))
    assert.equal(result.verificationPassed, 1)
    assert.equal(result.verificationUnconfirmed, 0)
    assert.equal(result.focusedPassed, 1)
    assert.equal(result.deliveryVerified, 1)
    assert.equal(result.deliveryBlocked, 0)
    assert.equal(result.failedOutcomes, 0)
    assert.equal(result.calls, 3)
  })

  it('reports incomplete or contradictory verification claims as unconfirmed', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const inconsistent = [
      { ...verifiedStep(true), exitCode: 1 },
      { ...verifiedStep(true), signal: 'SIGTERM' },
      { ...verifiedStep(true), truncated: true },
      { ...verifiedStep(true), timedOut: true },
      { passed: true },
      { ...verifiedSuite(true), skipped: ['test'] },
      { ...verifiedSuite(true), results: [{ passed: true }] },
    ]
    for (const [index, value] of inconsistent.entries()) {
      const name = index >= 5 ? 'code_verify_suite' : 'code_verify'
      await stats.wrap({ name, execute: async () => value }).execute({}, execution(session))
    }
    const current = stats.read(execution(session))
    assert.equal(current.verificationPassed, 0)
    assert.equal(current.verificationFailed, 0)
    assert.equal(current.verificationUnconfirmed, inconsistent.length)
    assert.equal(current.focusedPassed, 0)
  })

  it('never mixes sessions and never tracks the stats reader itself', async () => {
    const stats = new ExecutionStats()
    const left = {}, right = {}
    const probe = stats.wrap({ name: 'code_host_probe', execute: async () => ({ ok: true }) })
    const reader = stats.wrap(createExecutionStatsTool(stats))
    await probe.execute({}, execution(left))
    await reader.execute({}, execution(left))
    await reader.execute({}, execution(right))
    const own = await reader.execute({}, execution(left))
    assert.equal(own.calls, 1)
    assert.equal((await reader.execute({}, execution(right))).calls, 0)
    assert.equal(stats.read({ signal }).scope, 'unavailable')
    assert.equal(stats.read({ signal }).calls, 0)
  })

  it('derives a safe next step from native Todo and observed verification, never model claims', async () => {
    const { createExecutionNextTool } = await import('../packages/delta-code/lib/delta-code-adapter/providers/dsh/execution-next.js')
    const stats = new ExecutionStats()
    const session = {}
    const native = { tasks: [
      { content: 'Fix failure', status: 'in_progress' },
      { content: 'Run final checks', status: 'pending' },
    ], writeSeq: 4, invalid: false }
    const tool = createExecutionNextTool({ read: () => native, dispose() {} }, stats)
    const ex = execution(session)
    let next = await tool.execute({}, ex)
    assert.equal(next.transition, 'continue')
    assert.equal(next.deliveryConfirmed, false)
    const verify = stats.wrap({ name: 'code_verify', execute: async () => verifiedStep(false) })
    await verify.execute({}, ex)
    next = await tool.execute({}, ex)
    assert.equal(next.transition, 'diagnose')
    const edit = stats.wrap({ name: 'code_multi_edit', execute: async () => ({ applied: 1 }) })
    await edit.execute({}, ex)
    next = await tool.execute({}, ex)
    assert.equal(next.transition, 'verify', 'a new mutation invalidates earlier test outcomes')
    const successful = stats.wrap({ name: 'code_verify', execute: async () => verifiedStep(true) })
    await successful.execute({}, ex)
    next = await tool.execute({}, ex)
    assert.equal(next.transition, 'continue')
    native.tasks[0].status = 'completed'
    native.tasks[1].status = 'completed'
    next = await tool.execute({}, ex)
    assert.equal(next.transition, 'verify', 'completed Todos still require a fresh delivery gate')
    assert.equal(next.deliveryConfirmed, false)
    stats.clear()
    assert.equal(stats.readLastObservation(ex.agent).kind, 'none')
  })

  it('fails closed on native checkpoint loss and Host denial, without replaying writes', async () => {
    const { createExecutionNextTool } = await import('../packages/delta-code/lib/delta-code-adapter/providers/dsh/execution-next.js')
    const stats = new ExecutionStats()
    const session = {}
    const ex = execution(session)
    const native = { tasks: [{ content: 'Fix CI', status: 'pending' }], writeSeq: 1, invalid: false }
    const tool = createExecutionNextTool({ read: () => native, dispose() {} }, stats)
    const denied = stats.wrap({ name: 'code_git_status', execute: async () => {
      throw Error('Host permission denied')
    } })
    await assert.rejects(denied.execute({}, ex), /permission denied/)
    const next = await tool.execute({}, ex)
    assert.equal(next.transition, 'blocked')
    assert.match(next.nextAction, /permission/)
    assert.equal(next.deliveryConfirmed, false)
    native.invalid = true
    const missing = await tool.execute({}, ex)
    assert.equal(missing.transition, 'blocked')
    assert.deepEqual(missing.remaining, [])
    const unavailable = createExecutionNextTool({ read: () => undefined, dispose() {} }, stats)
    assert.equal((await unavailable.execute({}, ex)).transition, 'blocked')
  })

  it('reports compaction review without replaying user content or creating work', async () => {
    const { createExecutionNextTool } = await import('../packages/delta-code/lib/delta-code-adapter/providers/dsh/execution-next.js')
    const stats = new ExecutionStats()
    const agent = { session: {} }
    const ex = { agent, signal }
    let nativeReads = 0
    const resume = { read() {
      nativeReads++
      return { tasks: [{ content: 'Revalidate constraint', status: 'pending' }], writeSeq: 7, invalid: false }
    }, dispose() {} }
    const marker = { read() {
      return { summarySeq: 10, summaries: 1, invalid: false }
    }, dispose() {} }
    const tool = createExecutionNextTool(resume, stats, marker)
    const result = await tool.execute({}, ex)
    assert.equal(result.transition, 'continue')
    assert.equal(result.contextReviewState, 'review')
    assert.equal(result.contextSummarySeq, 10)
    assert.equal(result.contextTodoRefreshed, false)
    assert.match(result.contextReviewAction, /user constraints/)
    assert.equal(result.deliveryConfirmed, false)
    assert.equal(nativeReads, 1)
    assert.equal(stats.read(ex).calls, 0)
    const absent = createExecutionNextTool(resume, stats).execute({}, ex)
    assert.equal((await absent).contextReviewState, 'unavailable')
  })

  it('bounds fingerprint memory and does not misclassify a distant repeat', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const tool = stats.wrap({ name: 'code_project_profile', execute: async () => ({ project: 'sample' }) })
    await tool.execute({ key: 'old' }, execution(session))
    for (let index = 0; index < 80; index++) await tool.execute({ key: index }, execution(session))
    await tool.execute({ key: 'old' }, execution(session))
    const snapshot = stats.read(execution(session))
    assert.equal(snapshot.calls, 82)
    assert.equal(snapshot.duplicateCalls, 0)
    assert.equal(snapshot.tools[0].calls, 82)
  })
})

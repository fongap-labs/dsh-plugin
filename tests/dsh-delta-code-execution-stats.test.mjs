import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ExecutionStats, createExecutionStatsTool } from '../packages/dsh-delta-code/lib/execution-stats.js'

const signal = new AbortController().signal
const execution = session => ({ agent: { session }, signal })

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
      execute: async () => ({ passed: false, scope: 'focused' }),
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
    assert.equal(snapshot.errors, 2)
    assert.equal(snapshot.failedOutcomes, 2)
    assert.equal(snapshot.failureKinds.permission, 2)
    assert.equal(snapshot.verificationFailed, 1)
    assert.equal(snapshot.deliveryBlocked, 1)
    assert.equal(JSON.stringify(snapshot).includes('credential'), false)
  })

  it('counts only explicit verification and delivery evidence', async () => {
    const stats = new ExecutionStats()
    const session = {}
    const verification = stats.wrap({
      name: 'code_verify_suite', execute: async () => ({ passed: true, scope: 'focused' }),
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
    assert.equal(result.focusedPassed, 1)
    assert.equal(result.deliveryVerified, 1)
    assert.equal(result.deliveryBlocked, 0)
    assert.equal(result.failedOutcomes, 0)
    assert.equal(result.calls, 3)
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

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  remainingDeliveryTasks, validateTaskAcceptance, isTerminalGateTodo, gate,
  hasCompleteDeliveryEvidence,
} from '../packages/dsh-delta-code/lib/delta-code-quality/delivery-policy.js'
import {
  remainingDeliveryTasks as oldRemaining, validateTaskAcceptance as oldAcceptance,
  createDeliveryGateTool,
} from '../packages/dsh-delta-code/lib/tools/delivery-gate.js'

describe('Delta Code Host-neutral delivery policy', () => {
  it('keeps native Host execution and SDK dependencies outside pure policy', () => {
    const src = readFileSync(new URL(
      '../packages/dsh-delta-code/src/delta-code-quality/delivery-policy.ts', import.meta.url), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'Context', 'ToolDefinition', 'runCommand(', 'process.env', 'node:fs']) {
      assert.equal(src.includes(forbidden), false, forbidden)
    }
    assert.equal(oldRemaining, remainingDeliveryTasks)
    assert.equal(oldAcceptance, validateTaskAcceptance)
    assert.equal(typeof createDeliveryGateTool, 'function')
  })

  it('validates native Todo bounds and rejects invented or repeated tasks', () => {
    const tasks = [
      { content: 'Inspect existing implementation', status: 'completed' },
      { content: 'Fix and verify', status: 'in_progress' },
    ]
    assert.deepEqual(remainingDeliveryTasks(tasks), ['Fix and verify'])
    assert.throws(() => remainingDeliveryTasks([]), /1\.\.32 tasks/)
    assert.throws(() => remainingDeliveryTasks([...tasks, tasks[0]]), /duplicate delivery task/)
    assert.throws(() => remainingDeliveryTasks([{ content: 'x', status: 'blocked' }]), /invalid/)
  })

  it('never accepts missing, reordered or unrelated final verification checks', () => {
    const todo = [{ content: 'Implement feature', status: 'completed' }]
    assert.deepEqual(validateTaskAcceptance(todo, ['test'], [
      { task: 'Implement feature', criterion: 'Tests pass for the target feature', checks: ['test'] },
    ]), [{ task: 'Implement feature', criterion: 'Tests pass for the target feature', checks: ['test'] }])
    assert.throws(() => validateTaskAcceptance(todo, ['test'], [
      { task: 'Different task', criterion: 'Tests pass correctly', checks: ['test'] },
    ]), /differs/)
    assert.throws(() => validateTaskAcceptance(todo, ['test'], [
      { task: 'Implement feature', criterion: 'Tests pass correctly', checks: ['build'] },
    ]), /executed final scripts/)
  })

  it('recognizes terminal gate self-reference but does not mark unverified work complete', () => {
    const tasks = [
      { content: 'Implement change', status: 'completed' },
      { content: 'Final delivery gate', status: 'pending' },
    ]
    assert.equal(isTerminalGateTodo(tasks, ['Final delivery gate']), true)
    assert.equal(isTerminalGateTodo(tasks, ['Implement change']), false)
    const blocked = gate('blocked', 'Collect fresh Host evidence', ['Verify tests'])
    assert.equal(blocked.ready, false)
    assert.deepEqual(blocked.remaining, ['Verify tests'])
    const unproved = gate('verified', 'Inspect diff')
    assert.equal(unproved.stage, 'blocked')
    assert.equal(unproved.ready, false)
    assert.match(unproved.blockers.join(' '), /evidence incomplete/)
    const checks = [{ script: 'test', exitCode: 0, passed: true }]
    const evidence = ['Fresh Host test and immutable Git state inspected']
    const taskEvidence = [{ task: 'Implement change', criterion: 'Test passes', checks }]
    assert.equal(hasCompleteDeliveryEvidence([], [], checks, evidence, taskEvidence), true)
    const completed = gate('verified', 'Inspect diff', [], 'a'.repeat(40), [],
      ['src/main.ts'], checks, evidence, taskEvidence)
    assert.equal(completed.stage, 'verified')
    assert.equal(completed.ready, true)
    assert.equal(hasCompleteDeliveryEvidence([], [], checks, [], taskEvidence), false)
    assert.equal(hasCompleteDeliveryEvidence([], [], [{ ...checks[0], exitCode: 1 }], evidence, taskEvidence), false)
    assert.equal(hasCompleteDeliveryEvidence([], [], checks, evidence,
      [{ ...taskEvidence[0], checks: [{ script: 'build', exitCode: 0, passed: true }] }]), false)
  })
})

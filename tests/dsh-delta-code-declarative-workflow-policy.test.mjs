import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALL_CODING_SKILLS } from '../packages/dsh-delta-code/lib/skills.js'
import {
  decideCodingWorkflow, createWorkflowRouteTool,
} from '../packages/dsh-delta-code/lib/workflow-route.js'
import {
  DEFAULT_CODING_WORKFLOW_RULES, CODING_TASK_KINDS, CODING_SCOPES, CODING_RISKS,
  REQUIRED_WORKFLOW_STOP_CONDITIONS, STANDARD_WORKFLOW_VERIFICATION,
  RESEARCH_WORKFLOW_VERIFICATION,
} from '../packages/dsh-delta-code/lib/delta-code-strategy/workflow-policy.js'
import { deltaCodeStrategy } from '../packages/dsh-delta-code/lib/delta-code-strategy/index.js'

const exec = { signal: new AbortController().signal }

function expectedLegacy(taskKind, scope, risk) {
  const isPlanned = risk === 'high' || scope === 'large' || scope === 'medium'
  const isHighImpact = risk === 'high' || scope === 'large'
  if (taskKind === 'ci') return {
    mode: 'ci-repair', skills: ['code-ci-repair', 'code-verification-gate'],
    verification: STANDARD_WORKFLOW_VERIFICATION,
  }
  if (taskKind === 'review') return {
    mode: 'review', skills: ['code-review-readiness', 'code-verification-gate'],
    verification: STANDARD_WORKFLOW_VERIFICATION,
  }
  if (taskKind === 'research') return {
    mode: 'research', skills: ['code-context-discipline', 'code-brainstorming'],
    verification: RESEARCH_WORKFLOW_VERIFICATION,
  }
  if (taskKind === 'bugfix') return {
    mode: 'diagnose',
    skills: [
      'code-root-cause-debugging',
      ...(isPlanned ? ['code-writing-plans', 'code-executing-plans'] : []),
      'code-test-driven-development',
      ...(isHighImpact ? ['code-request-review'] : []),
      'code-verification-gate', 'code-finish-branch',
    ],
    verification: STANDARD_WORKFLOW_VERIFICATION,
  }
  if (!isPlanned) return {
    mode: 'fast', skills: ['code-fast-change', 'code-verification-gate'],
    verification: STANDARD_WORKFLOW_VERIFICATION,
  }
  return {
    mode: 'planned',
    skills: [
      ...(isHighImpact ? ['code-brainstorming'] : []),
      'code-writing-plans', 'code-executing-plans', 'code-test-driven-development',
      ...(isHighImpact ? ['code-request-review', 'code-review-readiness'] : []),
      'code-verification-gate', 'code-finish-branch',
    ],
    verification: STANDARD_WORKFLOW_VERIFICATION,
  }
}

describe('Delta Code declarative coding workflow policy', () => {
  it('preserves the complete pre-refactor task/scope/risk behavior matrix', () => {
    const ids = new Set(ALL_CODING_SKILLS.map(skill => skill.name))
    assert.equal(DEFAULT_CODING_WORKFLOW_RULES.length, 6)
    assert.deepEqual(DEFAULT_CODING_WORKFLOW_RULES.map(rule => rule.id), [
      'ci-repair', 'read-only-review', 'research', 'root-cause-before-edit',
      'small-change', 'planned-delivery',
    ])
    for (const taskKind of CODING_TASK_KINDS) {
      for (const scope of CODING_SCOPES) {
        for (const risk of CODING_RISKS) {
          const input = { taskKind, scope, risk }
          const actual = decideCodingWorkflow(input)
          const expected = expectedLegacy(taskKind, scope, risk)
          assert.equal(actual.mode, expected.mode, JSON.stringify(input))
          assert.deepEqual(actual.skills, expected.skills, JSON.stringify(input))
          assert.deepEqual(actual.verification, expected.verification, JSON.stringify(input))
          assert.deepEqual(actual.executionWaves, [[0]])
          assert.equal(actual.parallelCandidate, false)
          assert.deepEqual(actual.stopConditions, REQUIRED_WORKFLOW_STOP_CONDITIONS)
          for (const name of actual.skills) assert.ok(ids.has(name), name)
        }
      }
    }
    const policy = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-strategy/workflow-policy.ts', import.meta.url), 'utf8')
    for (const prohibited of ['@deepseek-ai', 'Context', 'subprocess', 'fetch(', 'node:fs']) {
      assert.equal(policy.includes(prohibited), false, prohibited)
    }
  })

  it('preserves safe native parallel waves only for planned feature/refactor writes', () => {
    for (const taskKind of ['feature', 'refactor']) {
      const result = decideCodingWorkflow({
        taskKind, scope: 'large', risk: 'medium', independentTasks: 3,
        nativeSubagents: true, taskPaths: [['src/a.ts'], ['src/b.ts'], ['src/c.ts']],
      })
      assert.equal(result.parallelCandidate, true)
      assert.deepEqual(result.executionWaves, [[0, 1, 2]])
      assert.ok(result.skills.includes('code-parallel-work'))
      assert.ok(result.skills.includes('code-subagent-delivery'))
      assert.ok(!result.skills.includes('code-executing-plans'))
    }
    const conflicting = decideCodingWorkflow({
      taskKind: 'feature', scope: 'large', risk: 'medium', independentTasks: 2,
      nativeSubagents: true, taskPaths: [['src/a'], ['src/a/file.ts']],
    })
    assert.deepEqual(conflicting.executionWaves, [[0], [1]])
    assert.ok(conflicting.skills.includes('code-executing-plans'))
    assert.ok(!conflicting.skills.includes('code-subagent-delivery'))
    for (const missing of [
      { nativeSubagents: false, taskPaths: [['src/a'], ['src/b']] },
      { nativeSubagents: true },
    ]) {
      const result = decideCodingWorkflow({
        taskKind: 'feature', scope: 'large', risk: 'medium', independentTasks: 2, ...missing,
      })
      assert.equal(result.parallelCandidate, false)
      assert.deepEqual(result.executionWaves, [[0], [1]])
    }
  })

  it('uses reviewed catalog extensions without editing the selection engine', async () => {
    const reviewed = [{
      id: 'reviewed-feature',
      taskKinds: ['feature'], shouldPlan: false,
      mode: 'fast',
      steps: [{ skill: 'code-context-discipline' }, { skill: 'code-verification-gate' }],
      verification: ['Verify the exact target dependency contract.'],
    }, ...DEFAULT_CODING_WORKFLOW_RULES]
    const input = { taskKind: 'feature', scope: 'small', risk: 'low' }
    assert.deepEqual(decideCodingWorkflow(input).skills, ['code-fast-change', 'code-verification-gate'])
    const customized = decideCodingWorkflow(input, reviewed)
    assert.deepEqual(customized.skills, ['code-context-discipline', 'code-verification-gate'])
    assert.deepEqual(customized.verification, ['Verify the exact target dependency contract.'])
    assert.deepEqual(customized.stopConditions, REQUIRED_WORKFLOW_STOP_CONDITIONS)
    const tool = createWorkflowRouteTool(reviewed)
    assert.equal(tool.name, 'code_workflow_route')
    assert.deepEqual((await tool.execute(input, exec)).skills, customized.skills)
    assert.deepEqual(tool.parameters.taskKind.enum, [...CODING_TASK_KINDS])
    assert.deepEqual(tool.parameters.scope.enum, [...CODING_SCOPES])
    assert.deepEqual(tool.parameters.risk.enum, [...CODING_RISKS])

    const feature = deltaCodeStrategy({
      workflowRules: reviewed,
      registerSkills: () => () => {},
      registerRouter: () => () => {},
      registerPrompt: () => () => {},
    })
    assert.deepEqual((await feature.tools[0].execute(input, exec)).skills, customized.skills)
    assert.deepEqual(decideCodingWorkflow(input).skills, ['code-fast-change', 'code-verification-gate'])
  })

  it('cannot turn diagnostic work into unsafe parallel writes or omit mandatory stops', () => {
    const unsafeProfile = [{
      id: 'wrong-parallel',
      taskKinds: ['bugfix'], mode: 'planned', canParallelize: true,
      steps: [
        { skill: 'code-parallel-work' }, { skill: 'code-subagent-delivery' },
        { skill: 'code-root-cause-debugging' }, { skill: 'code-verification-gate' },
      ],
      verification: [],
    }]
    const result = decideCodingWorkflow({
      taskKind: 'bugfix', scope: 'large', risk: 'high', independentTasks: 2,
      nativeSubagents: true, taskPaths: [['src/a.ts'], ['src/b.ts']],
    }, unsafeProfile)
    assert.equal(result.parallelCandidate, false)
    assert.deepEqual(result.executionWaves, [[0], [1]])
    assert.deepEqual(result.skills, ['code-root-cause-debugging', 'code-verification-gate'])
    assert.deepEqual(result.stopConditions, REQUIRED_WORKFLOW_STOP_CONDITIONS)
    assert.throws(() => decideCodingWorkflow({
      taskKind: 'feature', scope: 'small', risk: 'low',
    }, []), /no reviewed coding workflow policy/)
    for (const input of [
      { taskKind: 'invalid', scope: 'small', risk: 'low' },
      { taskKind: 'feature', scope: 'unknown', risk: 'low' },
      { taskKind: 'feature', scope: 'small', risk: 'unknown' },
    ]) assert.throws(() => decideCodingWorkflow(input), /invalid taskKind, scope or risk/)
    assert.throws(() => decideCodingWorkflow({
      taskKind: 'feature', scope: 'large', risk: 'high',
      independentTasks: 2, nativeSubagents: true, taskPaths: [['src/a'], ['../unsafe']],
    }), /taskPaths/)
  })
})

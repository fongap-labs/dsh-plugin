import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_CODING_SKILLS, CODING_SKILLS } from '../packages/dsh-code-worker/lib/skills.js'
import { WORKFLOW_SKILLS } from '../packages/dsh-code-worker/lib/workflow-skills.js'

test('one-plugin coding workflow catalog is complete, unique and loadable', () => {
  const names = ALL_CODING_SKILLS.map(skill => skill.name)
  assert.equal(names.length, 19)
  assert.equal(new Set(names).size, names.length)
  assert.equal(CODING_SKILLS.length, 4)
  assert.equal(WORKFLOW_SKILLS.length, 15)
  for (const skill of ALL_CODING_SKILLS) {
    assert.match(skill.name, /^code-[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(skill.title.length > 8, skill.name)
    assert.ok(skill.description.length >= 40 && skill.description.length < 260, skill.name)
    assert.ok(skill.instructions.length >= 4 && skill.instructions.length <= 8, skill.name)
    for (const instruction of skill.instructions) {
      assert.ok(instruction.length > 45, skill.name + ': empty or underspecified rule')
    }
  }
  for (const id of [
    'code-workflow', 'code-fast-change', 'code-brainstorming', 'code-writing-plans',
    'code-executing-plans', 'code-subagent-delivery', 'code-parallel-work',
    'code-test-driven-development', 'code-root-cause-debugging',
    'code-worktrees', 'code-request-review', 'code-receive-review',
    'code-verification-gate', 'code-finish-branch', 'code-skill-authoring',
    'code-context-discipline', 'code-incident-diagnosis',
  ]) assert.ok(names.includes(id), id)
})

test('workflow has honest verification and no duplicate runtime claims', () => {
  const byName = new Map(ALL_CODING_SKILLS.map(skill => [skill.name, skill.instructions.join('\n')]))
  assert.match(byName.get('code-workflow'), /route|Route/)
  assert.match(byName.get('code-verification-gate'), /not run|not a pass|unrun/)
  assert.match(byName.get('code-subagent-delivery'), /Host agent|Host exposes|official Host/)
  assert.match(byName.get('code-parallel-work'), /disjoint|independent/)
  assert.match(byName.get('code-context-discipline'), /filenames only/)
  assert.match(byName.get('code-finish-branch'), /Never auto-merge/)
})

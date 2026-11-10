import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_CODING_SKILLS, CODING_SKILLS } from '../packages/dsh-delta-code/lib/skills.js'
import { WORKFLOW_SKILLS } from '../packages/dsh-delta-code/lib/workflow-skills.js'

test('one-plugin coding workflow catalog is complete, unique and loadable', () => {
  const names = ALL_CODING_SKILLS.map(skill => skill.name)
  assert.equal(names.length, 21)
  assert.equal(new Set(names).size, names.length)
  assert.equal(CODING_SKILLS.length, 4)
  assert.equal(WORKFLOW_SKILLS.length, 17)
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
    'code-context-discipline', 'code-incident-diagnosis', 'code-autonomous-loop', 'code-ci-repair',
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
  assert.match(byName.get('code-writing-plans'), /execution waves/)
  assert.match(byName.get('code-brainstorming'), /ADDED\/MODIFIED\/REMOVED/)
  assert.match(byName.get('code-request-review'), /security, performance and maintainability/)
  assert.match(byName.get('code-incident-diagnosis'), /learning loop/)
})

test('native planning and execution share Host todo state and evidence checkpoints', () => {
  const byName = new Map(ALL_CODING_SKILLS.map(skill => [skill.name, skill.instructions.join('\n')]))
  const planning = byName.get('code-writing-plans')
  const executing = byName.get('code-executing-plans')
  const feature = byName.get('code-feature-delivery')
  assert.match(planning, /goal|observable goal/)
  assert.match(planning, /acceptance criteria/)
  assert.match(planning, /dependencies/)
  assert.match(planning, /todo_write/)
  assert.match(planning, /execution waves/)
  assert.match(planning, /Planning-only requests must not edit source/)
  assert.match(executing, /one ready plan item at a time/)
  assert.match(executing, /todo_write/)
  assert.match(executing, /exact evidence/)
  assert.match(executing, /revise the remaining steps/)
  assert.match(executing, /without asking for redundant confirmation/)
  assert.match(feature, /executable plan/)
  assert.match(feature, /focused verification/)
  for (const skill of [planning, executing, feature]) {
    assert.doesNotMatch(skill, /second planner runtime|another agent runtime.*required/i)
  }
})

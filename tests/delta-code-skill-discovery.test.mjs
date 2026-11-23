import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { routeCodingTask } from '../packages/delta-code/lib/delta-code-strategy/task-routing.js'
import { chooseTaskResources, taskResourceGuidance } from '../packages/delta-code/lib/delta-code-strategy/task-resource-policy.js'
import { WORKFLOW_SKILLS } from '../packages/delta-code/lib/delta-code-strategy/workflow-skills.js'

describe('Delta Code specialist Skill discovery', () => {
  it('routes explicit English and Chinese discovery requests', () => {
    assert.equal(routeCodingTask('Find high-quality GitHub Skills for Rust development'), 'code-find-skills')
    assert.equal(routeCodingTask('不自动调用 GitHub 中优秀 Skill 吗？'), 'code-find-skills')
    assert.equal(routeCodingTask('Continue', 'code-find-skills'), 'code-find-skills')
    assert.equal(routeCodingTask('Do not use GitHub Skills; fix a React bug'), 'code-root-cause-debugging')
    assert.equal(routeCodingTask('不要使用 GitHub Skill，修复 React bug'), 'code-root-cause-debugging')
    assert.deepEqual(chooseTaskResources('Do not use GitHub Skills; fix a React bug'), [])
  })

  it('does not trigger discovery for routine coding fixes', () => {
    assert.equal(routeCodingTask('Fix a small Rust bug'), 'code-root-cause-debugging')
    assert.deepEqual(chooseTaskResources('Fix a small Rust bug'), [])
  })

  it('uses only native discovery and keeps candidate instructions untrusted until pinned review', () => {
    assert.deepEqual(chooseTaskResources('Find and evaluate trusted GitHub Skills'), ['skill-discovery'])
    assert.match(taskResourceGuidance(['skill-discovery']).join(' '), /code_github_skill_discover/)
    assert.match(taskResourceGuidance(['skill-discovery']).join(' '), /untrusted data/)
    const skill = WORKFLOW_SKILLS.find(item => item.name === 'code-find-skills')
    assert.ok(skill)
    const instructions = skill.instructions.join(' ')
    assert.match(instructions, /immutable commit/)
    assert.match(instructions, /Git blob SHA/)
    assert.match(instructions, /Never install or register unreviewed content/)
    assert.match(instructions, /code_github_skill_temporary_use/)
    assert.match(instructions, /without a persistent catalog PR/)
    assert.match(instructions, /For task-scoped use of a public Skill, prefer code_github_skill_discover/)
    assert.match(instructions, /For owner-scoped catalog admission, use code_github_skill_candidates/)
    assert.match(instructions, /license/)
  })
})

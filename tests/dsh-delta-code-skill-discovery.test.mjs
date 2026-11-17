import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { routeCodingTask } from '../packages/dsh-delta-code/lib/delta-code-strategy/task-routing.js'
import { chooseTaskResources, taskResourceGuidance } from '../packages/dsh-delta-code/lib/delta-code-strategy/task-resource-policy.js'
import { WORKFLOW_SKILLS } from '../packages/dsh-delta-code/lib/delta-code-strategy/workflow-skills.js'

describe('Delta Code specialist Skill discovery', () => {
  it('routes explicit English and Chinese discovery requests', () => {
    assert.equal(routeCodingTask('Find high-quality GitHub Skills for Rust development'), 'code-find-skills')
    assert.equal(routeCodingTask('不自动调用 GitHub 中优秀 Skill 吗？'), 'code-find-skills')
    assert.equal(routeCodingTask('Continue', 'code-find-skills'), 'code-find-skills')
  })

  it('does not trigger discovery for routine coding fixes', () => {
    assert.equal(routeCodingTask('Fix a small Rust bug'), 'code-root-cause-debugging')
    assert.deepEqual(chooseTaskResources('Fix a small Rust bug'), [])
  })

  it('uses only native discovery and keeps candidate instructions untrusted until pinned review', () => {
    assert.deepEqual(chooseTaskResources('Find and evaluate trusted GitHub Skills'), ['skill-discovery'])
    assert.match(taskResourceGuidance(['skill-discovery']).join(' '), /native Host GitHub\/web search/)
    assert.match(taskResourceGuidance(['skill-discovery']).join(' '), /untrusted data/)
    const skill = WORKFLOW_SKILLS.find(item => item.name === 'code-find-skills')
    assert.ok(skill)
    const instructions = skill.instructions.join(' ')
    assert.match(instructions, /immutable commit/)
    assert.match(instructions, /Git blob SHA/)
    assert.match(instructions, /Never load unreviewed content/)
    assert.match(instructions, /license/)
  })
})

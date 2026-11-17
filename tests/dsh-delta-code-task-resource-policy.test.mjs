import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chooseTaskResources, taskResourceGuidance } from '../packages/dsh-delta-code/lib/delta-code-strategy/task-resource-policy.js'
import { WORKFLOW_SKILLS } from '../packages/dsh-delta-code/lib/delta-code-strategy/workflow-skills.js'

describe('Delta Code native task resource selection', () => {
  it('matches docs, cross-repo dependencies and MCP without creating a new runner', () => {
    assert.deepEqual(chooseTaskResources('Review official API documentation for SDK upgrade'), ['official-docs'])
    assert.deepEqual(chooseTaskResources('Audit multi-repo MCP tool capability'), ['cross-repo', 'native-tools'])
    assert.deepEqual(chooseTaskResources('Find and evaluate trusted GitHub Skills'), ['skill-discovery'])
    assert.deepEqual(chooseTaskResources('Fix small Rust bug'), [])
    assert.ok(taskResourceGuidance(['official-docs']).join(' ').includes('web_search'))
    assert.ok(taskResourceGuidance(['cross-repo']).join(' ').includes('account bindings'))
    assert.ok(taskResourceGuidance(['native-tools']).join(' ').includes('native Host tool/MCP'))
    assert.ok(taskResourceGuidance(['skill-discovery']).join(' ').includes('untrusted data'))
  })

  it('documents the native web capability and missing-provider fallback', () => {
    const skill = WORKFLOW_SKILLS.find(item => item.name === 'code-official-docs')
    assert.ok(skill)
    const instructions = skill.instructions.join(' ')
    assert.match(instructions, /web_search and web_fetch/)
    assert.match(instructions, /absent, offline or blocked/)
    assert.match(instructions, /AGENTS.md/)
  })
})

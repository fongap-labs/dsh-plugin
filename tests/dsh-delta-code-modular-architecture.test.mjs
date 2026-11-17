import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../packages/dsh-delta-code/lib/index.js'
import { mountDeltaCodeFeatures } from '../packages/dsh-delta-code/lib/delta-code-kernel/feature.js'
import { selectDeltaDelegation } from '../packages/dsh-delta-code/lib/delta-code-collaboration/index.js'

function mockHost() {
  const tools = new Map()
  const skills = new Map()
  const prompts = new Set()
  const listeners = new Map()
  const host = {
    get: () => undefined,
    tools: { register(tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    } },
    inject(dependencies, callback) {
      if (dependencies.includes('skills')) {
        callback({ skills: { register(skill) {
          skills.set(skill.name, skill)
          return () => skills.delete(skill.name)
        } } })
      } else if (dependencies.includes('systemPrompt')) {
        callback({ systemPrompt: {
          getSectionOrder: () => 1300,
          section(section) {
            prompts.add(section.name)
            return () => prompts.delete(section.name)
          },
          context(section) {
            prompts.add(section.name)
            return () => prompts.delete(section.name)
          },
        } })
      } else callback({})
    },
    on(event, listener) {
      const key = Symbol(event)
      listeners.set(key, { event, listener })
      return () => listeners.delete(key)
    },
  }
  return {
    host, tools, skills, prompts,
    emit(event) {
      for (const entry of [...listeners.values()]) if (entry.event === event) entry.listener()
    },
  }
}

describe('Delta Code modular architecture', () => {
  it('does not mount tools, skills, or prompts when disabled', () => {
    const state = mockHost()
    const dispose = apply(state.host, { enabled: false })
    assert.equal(state.tools.size, 0)
    assert.equal(state.skills.size, 0)
    assert.equal(state.prompts.size, 0)
    dispose()
  })

  it('fully removes and restores all registrations across volatile configuration changes', () => {
    const state = mockHost()
    const config = { enabled: true }
    const dispose = apply(state.host, config)
    assert.ok(state.tools.size > 0)
    assert.ok(state.skills.size > 0)
    assert.ok(state.prompts.size > 0)
    config.enabled = false
    state.emit('loader/volatile-update')
    assert.equal(state.tools.size, 0)
    assert.equal(state.skills.size, 0)
    assert.equal(state.prompts.size, 0)
    config.enabled = true
    state.emit('loader/volatile-update')
    assert.ok(state.tools.size > 0)
    assert.ok(state.skills.size > 0)
    dispose()
    dispose()
    assert.equal(state.tools.size, 0)
    assert.equal(state.skills.size, 0)
    assert.equal(state.prompts.size, 0)
  })

  it('rejects duplicate feature IDs and tool names before registering anything', () => {
    let count = 0
    const register = () => { count++; return () => { count-- } }
    assert.throws(() => mountDeltaCodeFeatures([
      { id: 'same', tools: [{ name: 'a' }] },
      { id: 'same', tools: [{ name: 'b' }] },
    ], { register }), /duplicate/)
    assert.equal(count, 0)
    assert.throws(() => mountDeltaCodeFeatures([
      { id: 'a', tools: [{ name: 'same' }] },
      { id: 'b', tools: [{ name: 'same' }] },
    ], { register }), /duplicate/)
    assert.equal(count, 0)
  })

  it('rolls back all active feature resources after a later activation fails', () => {
    const released = []
    assert.throws(() => mountDeltaCodeFeatures([
      { id: 'one', tools: [{ name: 'one' }], activate: () => () => released.push('feature') },
      { id: 'two', activate: () => { throw Error('bad mount') } },
    ], { register: () => () => released.push('tool') }), /bad mount/)
    assert.deepEqual(released, ['feature', 'tool'])
  })

  it('never delegates overlapping write targets or missing native agents', () => {
    assert.equal(selectDeltaDelegation({
      independentTasks: 3, sharedWriteTargets: true, nativeSubagentsAvailable: true,
    }), 'single-agent')
    assert.equal(selectDeltaDelegation({
      independentTasks: 3, sharedWriteTargets: false, nativeSubagentsAvailable: false,
    }), 'single-agent')
    assert.equal(selectDeltaDelegation({
      independentTasks: 3, sharedWriteTargets: false, nativeSubagentsAvailable: true,
    }), 'native-subagents')
  })
})

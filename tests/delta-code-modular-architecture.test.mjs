import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../packages/delta-code/lib/index.js'
import { mountDeltaCodeFeatures } from '../packages/delta-code/lib/delta-code-kernel/feature.js'
import { selectDeltaDelegation } from '../packages/delta-code/lib/delta-code-collaboration/index.js'

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
        callback({ skills: { registerProvider(factory) {
          const controller = new AbortController()
          const provider = factory({ signal: controller.signal, invalidate() {} })
          skills.set(provider.name, provider)
          return () => {
            skills.delete(provider.name)
            controller.abort(new Error('provider disposed'))
          }
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
      } else if (dependencies.includes('subprocess')) {
        return callback(host)
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

  it('restores last working configuration after transient Host tool-registration failure on reload', () => {
    const state = mockHost()
    const originalRegister = state.host.tools.register.bind(state.host.tools)
    let shouldRejectNext = false
    state.host.tools.register = (definition) => {
      if (shouldRejectNext && definition.name === 'code_multi_edit') {
        shouldRejectNext = false
        throw new Error('simulated Host registration refusal')
      }
      return originalRegister(definition)
    }
    const config = { enabled: true, git: { enabled: true } }
    const dispose = apply(state.host, config)
    const previousTools = [...state.tools.keys()].sort()
    assert.ok(previousTools.includes('code_git_status'))
    config.git.enabled = false
    shouldRejectNext = true
    assert.throws(() => state.emit('loader/volatile-update'), /simulated Host registration refusal/)
    assert.deepEqual([...state.tools.keys()].sort(), previousTools)
    assert.ok(state.skills.size > 0)
    assert.ok(state.prompts.size > 0)
    state.emit('loader/volatile-update')
    assert.equal(state.tools.has('code_git_status'), false)
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

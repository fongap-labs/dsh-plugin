import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_CODING_SKILLS } from '../packages/dsh-delta-code/lib/delta-code-strategy/skills.js'
import { registerCodingSkills } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/skills.js'
import { registerApprovedGitHubSkills } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/github-skills.js'

function host() {
  let inject
  const warnings = []
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ['skills'])
      inject = callback
    },
    logger: { warn(message) { warnings.push(message) } },
  }
  return { ctx, warnings, attach: (registry) => inject({ skills: registry }) }
}

describe('DSH native Skill lifecycle and rollback', () => {
  it('registers the built-in catalog exactly once for repeated injection and cleans up in reverse order', () => {
    const h = host()
    const loaded = []
    const released = []
    const registry = {
      register(skill) {
        loaded.push(skill.name)
        return () => released.push(skill.name)
      },
    }
    const dispose = registerCodingSkills(h.ctx)
    const firstChildDispose = h.attach(registry)
    h.attach(registry)
    assert.deepEqual(loaded, ALL_CODING_SKILLS.map(skill => skill.name))
    assert.equal(typeof firstChildDispose, 'function')
    firstChildDispose()
    assert.deepEqual(released, [...loaded].reverse())
    h.attach(registry)
    assert.equal(loaded.length, ALL_CODING_SKILLS.length * 2)
    dispose()
    dispose()
    assert.equal(released.length, ALL_CODING_SKILLS.length * 2)
    h.attach(registry)
    assert.equal(loaded.length, ALL_CODING_SKILLS.length * 2)
    assert.deepEqual(h.warnings, [])
  })

  it('rolls back all disposable registrations on a partial failure and allows retry', () => {
    const h = host()
    const active = new Set()
    let fail = true
    const registry = {
      register(skill) {
        if (fail && skill.name === ALL_CODING_SKILLS[4].name) throw Error('registry refused fifth Skill')
        active.add(skill.name)
        return () => active.delete(skill.name)
      },
    }
    const stop = registerCodingSkills(h.ctx)
    h.attach(registry)
    assert.equal(active.size, 0)
    assert.ok(h.warnings.some(x => /rolled back/.test(x)))
    fail = false
    h.attach(registry)
    assert.equal(active.size, ALL_CODING_SKILLS.length)
    stop()
    assert.equal(active.size, 0)
  })

  it('protects older Hosts with missing disposers from retrying a partial batch', () => {
    const h = host()
    const calls = []
    const registry = {
      register(skill) {
        calls.push(skill.name)
        if (calls.length === 3) throw Error('unrecoverable registration')
        return undefined
      },
    }
    const stop = registerCodingSkills(h.ctx)
    h.attach(registry)
    h.attach(registry)
    assert.equal(calls.length, 3)
    assert.ok(h.warnings.some(x => /cannot be rolled back/.test(x)))
    stop()
  })

  it('does not duplicate legacy no-disposer registrations after child teardown', () => {
    const h = host()
    let count = 0
    const registry = { register() { count++; return undefined } }
    const stop = registerCodingSkills(h.ctx)
    const childDispose = h.attach(registry)
    childDispose()
    h.attach(registry)
    assert.equal(count, ALL_CODING_SKILLS.length)
    assert.ok(h.warnings.some(x => /no disposer/.test(x)))
    stop()
  })

  it('does not register approved provider twice and permits Host child remount', () => {
    const h = host()
    let calls = 0
    let removals = 0
    const registry = {
      registerProvider(factory) {
        calls++
        assert.equal(factory({ signal: new AbortController().signal, invalidate() {} }).name,
          'delta-code-approved-github')
        return () => { removals++ }
      },
    }
    const stop = registerApprovedGitHubSkills(h.ctx)
    const childDispose = h.attach(registry)
    h.attach(registry)
    assert.equal(calls, 1)
    childDispose()
    assert.equal(removals, 1)
    h.attach(registry)
    assert.equal(calls, 2)
    stop()
    stop()
    assert.equal(removals, 2)
    h.attach(registry)
    assert.equal(calls, 2)
  })

  it('keeps provider conflicts optional, handles errors and other Host registries independently', () => {
    const h = host()
    let conflicts = 0
    const incompatible = {
      registerProvider() { conflicts++; throw Error('provider conflict') },
    }
    const healthy = {
      registerProvider() { return () => {} },
    }
    const stop = registerApprovedGitHubSkills(h.ctx)
    h.attach(incompatible)
    h.attach(incompatible)
    assert.equal(conflicts, 2)
    assert.equal(typeof h.attach(healthy), 'function')
    assert.ok(h.warnings.every(x => /provider unavailable/.test(x)))
    stop()
  })
})

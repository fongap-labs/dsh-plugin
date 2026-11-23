import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ALL_CODING_SKILLS } from '../packages/delta-code/lib/delta-code-strategy/skills.js'
import { registerCodingSkills } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/skills.js'
import { registerApprovedGitHubSkills } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/github-skills.js'

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
  return { ctx, warnings, attach: registry => inject({ skills: registry }) }
}

function disposableProviderRegistry() {
  const controllers = []
  const providers = []
  let removals = 0
  const registry = {
    registerProvider(factory) {
      const controller = new AbortController()
      controllers.push(controller)
      providers.push(factory({ signal: controller.signal, invalidate() {} }))
      return () => {
        removals++
        controller.abort(new Error('provider registration disposed'))
      }
    },
  }
  return { registry, controllers, providers, get removals() { return removals } }
}

describe('DSH native Skill capability gate and lifecycle', () => {
  it('publishes only metadata until the native loader selects a Skill', async () => {
    const h = host()
    const r = disposableProviderRegistry()
    const stop = registerCodingSkills(h.ctx)
    const childDispose = h.attach(r.registry)
    const provider = r.providers[0]
    try {
      assert.equal(provider.name, 'delta-code-coding')
      const candidates = await provider.list()
      assert.deepEqual(candidates.map(skill => skill.name), ALL_CODING_SKILLS.map(skill => skill.name))
      assert.ok(candidates.every(skill => !Object.hasOwn(skill, 'content')))
      const selected = candidates.find(skill => skill.name === 'code-root-cause-debugging')
      assert.match((await provider.get(selected)).content, /Root-cause debugging/)
      assert.equal(await provider.get({ ...selected, locator: 'other-skill' }), undefined)
      assert.equal(await provider.get({ ...selected, provider: 'untrusted' }), undefined)
    } finally {
      childDispose()
      stop()
    }
    assert.equal(r.removals, 1)
    assert.deepEqual(await provider.list(), [])
  })

  it('registers a single provider per Host and unregisters on Host child or plugin teardown', async () => {
    const h = host()
    const r = disposableProviderRegistry()
    const stop = registerCodingSkills(h.ctx)
    const firstChildDispose = h.attach(r.registry)
    h.attach(r.registry)
    assert.equal(r.providers.length, 1)
    firstChildDispose()
    assert.equal(r.removals, 1)
    h.attach(r.registry)
    assert.equal(r.providers.length, 2)
    assert.ok((await r.providers[1].list()).length)
    stop()
    stop()
    assert.equal(r.removals, 2)
    assert.deepEqual(await r.providers[1].list(), [])
    assert.ok(r.controllers.every(x => x.signal.aborted))
    h.attach(r.registry)
    assert.equal(r.providers.length, 2)
    assert.deepEqual(h.warnings, [])
  })

  it('does not use legacy register when native provider capability is missing', () => {
    const h = host()
    let legacyCalls = 0
    const legacyHost = { register() { legacyCalls++; return () => {} } }
    const stop = registerCodingSkills(h.ctx)
    h.attach(legacyHost)
    h.attach(legacyHost)
    assert.equal(legacyCalls, 0)
    assert.ok(h.warnings.some(text => /lifecycle unavailable.*disabled/.test(text)))
    stop()
  })

  it('disables a provider immediately if registration returned no disposer', async () => {
    const h = host()
    let provider
    let invalidations = 0
    let registrations = 0
    const unsupported = {
      registerProvider(factory) {
        registrations++
        provider = factory({
          signal: new AbortController().signal,
          invalidate() { invalidations++ },
        })
        return undefined
      },
    }
    const stop = registerCodingSkills(h.ctx)
    h.attach(unsupported)
    assert.deepEqual(await provider.list(), [])
    const selected = { name: 'code-fast-change', provider: 'delta-code-coding', locator: 'code-fast-change' }
    assert.equal(await provider.get(selected), undefined)
    assert.equal(invalidations, 1)
    h.attach(unsupported)
    assert.equal(registrations, 1)
    assert.ok(h.warnings.some(text => /no disposer.*disabled/.test(text)))
    stop()
  })

  it('allows retry after a rejected native provider registration without leaking Skills', async () => {
    const h = host()
    let calls = 0
    const r = disposableProviderRegistry()
    const registry = {
      registerProvider(factory) {
        calls++
        if (calls === 1) throw new Error('provider conflict')
        return r.registry.registerProvider(factory)
      },
    }
    const stop = registerCodingSkills(h.ctx)
    h.attach(registry)
    h.attach(registry)
    assert.equal(calls, 2)
    assert.ok((await r.providers[0].list()).length > 0)
    assert.ok(h.warnings.some(text => /registration failed/.test(text)))
    stop()
    assert.equal(r.removals, 1)
  })

  it('does not duplicate the remote provider and aborts it on child disposal', async () => {
    const h = host()
    const r = disposableProviderRegistry()
    const stop = registerApprovedGitHubSkills(h.ctx)
    const childDispose = h.attach(r.registry)
    h.attach(r.registry)
    assert.equal(r.providers.length, 1)
    const provider = r.providers[0]
    assert.equal(provider.name, 'delta-code-approved-github')
    assert.ok((await provider.list()).length > 0)
    childDispose()
    assert.equal(r.removals, 1)
    assert.deepEqual(await provider.list(), [])
    h.attach(r.registry)
    assert.equal(r.providers.length, 2)
    stop()
    assert.equal(r.removals, 2)
    assert.deepEqual(await r.providers[1].list(), [])
    assert.ok(r.controllers.every(controller => controller.signal.aborted))
  })

  it('disables GitHub remote Skills if provider teardown is unsupported', async () => {
    const h = host()
    let provider
    let registrations = 0
    let invalidations = 0
    const legacy = {
      registerProvider(factory) {
        registrations++
        provider = factory({ signal: new AbortController().signal, invalidate() { invalidations++ } })
        return undefined
      },
    }
    const stop = registerApprovedGitHubSkills(h.ctx)
    h.attach(legacy)
    assert.deepEqual(await provider.list(), [])
    assert.equal(invalidations, 1)
    h.attach(legacy)
    assert.equal(registrations, 1)
    assert.ok(h.warnings.some(text => /no disposer.*disabled/.test(text)))
    stop()
  })

  it('isolates remote provider registration conflicts from other Host registries', async () => {
    const h = host()
    let conflicts = 0
    const incompatible = { registerProvider() { conflicts++; throw new Error('provider conflict') } }
    const healthy = disposableProviderRegistry()
    const stop = registerApprovedGitHubSkills(h.ctx)
    h.attach(incompatible)
    h.attach(incompatible)
    assert.equal(conflicts, 2)
    assert.equal(typeof h.attach(healthy.registry), 'function')
    assert.ok(h.warnings.every(text => /provider unavailable/.test(text)))
    stop()
    assert.equal(healthy.removals, 1)
  })
})

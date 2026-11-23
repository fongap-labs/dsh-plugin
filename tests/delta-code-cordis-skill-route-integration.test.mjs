import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import * as codeWorker from '../packages/delta-code/lib/index.js'

const exec = () => ({ signal: new AbortController().signal })
const settle = async (ready) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (ready()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(ready(), 'Cordis optional service injection did not settle')
}

function nativeServices({ withDisposer = true } = {}) {
  const tools = new Map()
  const providers = new Map()
  const controllers = []
  const prompts = new Map()
  const promptSections = new Map()
  let skillRegistrations = 0
  let legacySkillRegistrations = 0
  const skills = {
    register() {
      legacySkillRegistrations++
      throw new Error('legacy skill registration is forbidden')
    },
    registerProvider(factory) {
      skillRegistrations++
      const controller = new AbortController()
      controllers.push(controller)
      const control = { signal: controller.signal, invalidate() {} }
      const provider = factory(control)
      if (providers.has(provider.name)) throw new Error('duplicate skill provider')
      providers.set(provider.name, provider)
      if (!withDisposer) return undefined
      return () => {
        if (providers.get(provider.name) === provider) providers.delete(provider.name)
        controller.abort(new Error('provider disposed'))
      }
    },
  }
  const systemPrompt = {
    getSectionOrder() { return 1200 },
    section(entry) {
      if (promptSections.has(entry.name)) throw new Error('duplicate prompt section')
      promptSections.set(entry.name, entry)
      return () => { if (promptSections.get(entry.name) === entry) promptSections.delete(entry.name) }
    },
    context(entry) {
      if (prompts.has(entry.name)) throw new Error('duplicate dynamic context')
      prompts.set(entry.name, entry)
      return () => { if (prompts.get(entry.name) === entry) prompts.delete(entry.name) }
    },
  }
  return {
    tools, providers, controllers, prompts, promptSections, skills, systemPrompt,
    get skillRegistrations() { return skillRegistrations },
    get legacySkillRegistrations() { return legacySkillRegistrations },
    toolsService: {
      register(definition) {
        if (tools.has(definition.name)) throw new Error('duplicate tool')
        tools.set(definition.name, definition)
        return () => { if (tools.get(definition.name) === definition) tools.delete(definition.name) }
      },
    },
  }
}

async function mount(ctx, overrides = {}) {
  return await ctx.plugin({
    name: codeWorker.name,
    inject: codeWorker.inject,
    apply: codeWorker.apply,
  }, { github: { enabled: false }, ...overrides })
}

describe('Delta Code real Cordis optional-services integration acceptance', () => {
  it('mounts native Skill providers lazily, routes only user inbox messages and releases every contribution', async () => {
    const ctx = new Context()
    const host = nativeServices()
    const releaseTools = ctx.provide('tools', host.toolsService)
    const releaseSkills = ctx.provide('skills', host.skills)
    const releasePrompt = ctx.provide('systemPrompt', host.systemPrompt)
    let fiber
    try {
      fiber = await mount(ctx)
      await settle(() => host.tools.has('code_workflow_route') &&
        host.providers.has('delta-code-coding') &&
        host.providers.has('delta-code-approved-github') &&
        host.prompts.has('delta-code:auto-routing'))
      assert.equal(host.skillRegistrations, 2)
      assert.equal(host.legacySkillRegistrations, 0)
      assert.ok(host.promptSections.has('delta-code:guidance'))
      const localProvider = host.providers.get('delta-code-coding')
      const summaries = await localProvider.list()
      assert.ok(summaries.length > 0)
      assert.ok(summaries.every(candidate => !Object.hasOwn(candidate, 'content')))
      const chosen = summaries.find(candidate => candidate.name === 'code-root-cause-debugging')
      assert.ok(chosen)
      const loaded = await localProvider.get(chosen)
      assert.match(loaded.content, /Root-cause debugging/)
      const remoteProvider = host.providers.get('delta-code-approved-github')
      assert.ok((await remoteProvider.list()).length > 0)

      const agent = {}
      const second = {}
      const dynamic = host.prompts.get('delta-code:auto-routing')
      const render = target => dynamic.text({ agent: target })
      assert.equal(render(agent), '')
      await ctx.emit('agent/inbox/claimed', {
        agent, message: { source: { kind: 'tool' },
          content: [{ type: 'text', text: 'Fix GitHub Actions CI failure' }] },
      })
      assert.equal(render(agent), '')
      await ctx.emit('agent/inbox/claimed', {
        agent, message: { source: { kind: 'user' },
          content: [{ type: 'text', text: 'Fix GitHub Actions CI failure' }] },
      })
      assert.match(render(agent), /code-ci-repair/)
      assert.equal(render(second), '')
      await ctx.emit('agent/inbox/claimed', {
        agent, message: { source: { kind: 'user' },
          content: [{ type: 'text', text: '继续推进任务链' }] },
      })
      assert.match(render(agent), /code-ci-repair/)
      await ctx.emit('agent/disposed', { agent })
      assert.equal(render(agent), '')

      const route = await host.tools.get('code_workflow_route').execute({
        taskKind: 'feature', scope: 'large', risk: 'medium', independentTasks: 2,
        nativeSubagents: false, taskPaths: [['src/a.ts'], ['src/b.ts']],
      }, exec())
      assert.equal(route.parallelCandidate, false)
      assert.deepEqual(route.executionWaves, [[0], [1]])
      assert.ok(route.skills.includes('code-executing-plans'))

      await fiber.dispose()
      fiber = undefined
      assert.equal(host.providers.size, 0)
      assert.equal(host.prompts.size, 0)
      assert.equal(host.promptSections.size, 0)
      assert.equal(host.tools.size, 0)
      assert.ok(host.controllers.every(controller => controller.signal.aborted))
      assert.deepEqual(await localProvider.list(), [])
      assert.deepEqual(await remoteProvider.list(), [])
      assert.equal(await localProvider.get(chosen), undefined)
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await releasePrompt()
      await releaseSkills()
      await releaseTools()
    }
  })

  it('retains native tools while a Host without disposable Skills disables both providers', async () => {
    const ctx = new Context()
    const host = nativeServices({ withDisposer: false })
    const releaseTools = ctx.provide('tools', host.toolsService)
    const releaseSkills = ctx.provide('skills', host.skills)
    const releasePrompt = ctx.provide('systemPrompt', host.systemPrompt)
    let fiber
    try {
      fiber = await mount(ctx)
      await settle(() => host.tools.has('code_workflow_route') &&
        host.skillRegistrations >= 2)
      assert.equal(host.legacySkillRegistrations, 0)
      assert.equal(host.providers.size, 2)
      assert.deepEqual(await host.providers.get('delta-code-coding').list(), [])
      assert.deepEqual(await host.providers.get('delta-code-approved-github').list(), [])
      assert.ok(host.tools.has('code_host_probe'))
      assert.ok(host.tools.has('code_workflow_route'))
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await releasePrompt()
      await releaseSkills()
      await releaseTools()
    }
  })

  it('mounts temporary public Skill consultation without a native Skill provider and removes the tool on disposal', async () => {
    const ctx = new Context()
    const host = nativeServices()
    const releaseTools = ctx.provide('tools', host.toolsService)
    let fiber
    try {
      fiber = await mount(ctx, { github: { enabled: true } })
      await settle(() => host.tools.has('code_github_skill_temporary_use'))
      assert.equal(host.providers.size, 0, 'temporary consultation must not register a persistent Skill provider')
      assert.equal(host.skillRegistrations, 0)
      const temporary = host.tools.get('code_github_skill_temporary_use')
      const audit = host.tools.get('code_github_skill_public_review')
      assert.ok(audit, 'persistent catalog evidence path remains available')
      await assert.rejects(temporary.execute({
        repository: '../private',
        path: 'skills/example/SKILL.md',
        commit: 'a'.repeat(40),
        sourceBlobSha: 'b'.repeat(40),
        licenseBlobSha: 'c'.repeat(40),
      }, exec()), /Invalid public Skill audit repository/, 'invalid sources fail before HTTP or credentials')
      await fiber.dispose()
      fiber = undefined
      assert.equal(host.tools.has('code_github_skill_temporary_use'), false)
      assert.equal(host.tools.has('code_github_skill_public_review'), false)
      assert.equal(host.providers.size, 0)
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await releaseTools()
    }
  })

  it('keeps existing routing and tool schemas intact if optional Skill services are absent', async () => {
    const ctx = new Context()
    const host = nativeServices()
    const releaseTools = ctx.provide('tools', host.toolsService)
    const releasePrompt = ctx.provide('systemPrompt', host.systemPrompt)
    let fiber
    try {
      fiber = await mount(ctx)
      await settle(() => host.tools.has('code_workflow_route') &&
        host.prompts.has('delta-code:auto-routing'))
      assert.equal(host.skillRegistrations, 0)
      const agent = {}
      await ctx.emit('agent/inbox/claimed', {
        agent, message: { source: { kind: 'user' },
          content: [{ type: 'text', text: 'Implement a React component' }] },
      })
      assert.match(host.prompts.get('delta-code:auto-routing').text({ agent }), /code-feature-delivery/)
      const route = await host.tools.get('code_workflow_route').execute({
        taskKind: 'bugfix', scope: 'small', risk: 'low',
      }, exec())
      assert.equal(route.mode, 'diagnose')
      assert.ok(route.skills.includes('code-root-cause-debugging'))
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await releasePrompt()
      await releaseTools()
    }
  })
})

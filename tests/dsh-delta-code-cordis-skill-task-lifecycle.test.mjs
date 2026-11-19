import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import * as codeWorker from '../packages/dsh-delta-code/lib/index.js'

async function settle(ready) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.ok(ready(), 'Real Cordis service lifecycle did not settle')
}

function skillHost() {
  const providers = new Map()
  const controllers = new Set()
  let invalidations = 0
  let disposals = 0
  return {
    providers, controllers,
    get invalidations() { return invalidations },
    get disposals() { return disposals },
    registerProvider(factory) {
      const controller = new AbortController()
      controllers.add(controller)
      const provider = factory({
        signal: controller.signal,
        invalidate() { invalidations++ },
      })
      assert.ok(!providers.has(provider.name), 'Native Host rejects duplicate providers')
      providers.set(provider.name, provider)
      return () => {
        disposals++
        if (providers.get(provider.name) === provider) providers.delete(provider.name)
        controller.abort(new Error('native Skill registration removed'))
      }
    },
  }
}

function nativeTools() {
  const definitions = new Map()
  return {
    definitions,
    register(definition) {
      assert.ok(!definitions.has(definition.name), 'duplicate native tool')
      definitions.set(definition.name, definition)
      return () => { if (definitions.get(definition.name) === definition) definitions.delete(definition.name) }
    },
  }
}

function pendingFetcher() {
  const requests = []
  return {
    requests,
    fetch(_url, init) {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        assert.ok(signal, 'Native Skill fetches must carry a cancellation signal')
        const pending = { url: String(_url), signal }
        requests.push(pending)
        const cancel = () => reject(signal.reason ?? new Error('fetch canceled'))
        if (signal.aborted) cancel()
        else signal.addEventListener('abort', cancel, { once: true })
      })
    },
  }
}

function userMessage(ctx, agent, text, kind = 'user') {
  return ctx.emit('agent/inbox/claimed', {
    agent, message: { source: { kind }, content: [{ type: 'text', text }] },
  })
}

describe('Delta Code real Cordis task-scoped Skill lifecycle', () => {
  it('isolates concurrent Agent fetches, respects continuations, opt-out, disposal and plugin teardown', async () => {
    const previousFetch = globalThis.fetch
    const fetcher = pendingFetcher()
    const ctx = new Context()
    const skills = skillHost()
    const tools = nativeTools()
    globalThis.fetch = fetcher.fetch
    const releaseTools = ctx.provide('tools', tools)
    const releaseSkills = ctx.provide('skills', skills)
    let fiber
    try {
      fiber = await ctx.plugin({
        name: codeWorker.name, inject: codeWorker.inject, apply: codeWorker.apply,
      }, { github: { enabled: false } })
      await settle(() => skills.providers.has('delta-code-approved-github') &&
        skills.providers.has('delta-code-coding') &&
        tools.definitions.has('code_workflow_route'))
      const provider = skills.providers.get('delta-code-approved-github')
      const [candidate] = await provider.list()
      assert.ok(candidate)
      assert.equal(candidate.content, undefined, 'Native list must never preload Skill text')
      assert.equal(fetcher.requests.length, 0, 'No network request before Host get')

      const first = {}
      const second = {}
      await userMessage(ctx, first, 'Implement a React component')
      await userMessage(ctx, second, 'Refactor React UI')
      const firstLoad = provider.get(candidate, { scope: first })
      const secondLoad = provider.get(candidate, { scope: second })
      await settle(() => fetcher.requests.length === 2)
      assert.ok(fetcher.requests.every(request => !request.signal.aborted))

      await userMessage(ctx, first, 'Continue current task', 'tool')
      await userMessage(ctx, first, '继续推进任务')
      assert.ok(fetcher.requests.every(request => !request.signal.aborted),
        'Tool output and same-task continuation must not cancel work')

      await userMessage(ctx, first, 'Diagnose a different backend API failure')
      await assert.rejects(firstLoad, /skill task superseded/)
      assert.equal(fetcher.requests[0].signal.aborted, true)
      assert.equal(fetcher.requests[1].signal.aborted, false,
        'A different Agent must remain alive during task replacement')

      const replacement = provider.get(candidate, { scope: first })
      await settle(() => fetcher.requests.length === 3)
      await userMessage(ctx, first, 'Do not use external GitHub Skills')
      await assert.rejects(replacement, /external Skill use denied by user/)
      assert.deepEqual(await provider.list({ scope: first }), [])
      assert.equal(await provider.get(candidate, { scope: first }), undefined)
      assert.ok((await provider.list({ scope: second })).length > 0,
        'Agent opt-out cannot disable another Agent')
      assert.ok(skills.invalidations >= 1)

      await ctx.emit('agent/disposed', { agent: second })
      await assert.rejects(secondLoad, /skill agent disposed/)
      assert.equal(fetcher.requests[1].signal.aborted, true)
      assert.deepEqual(await provider.list({ scope: second }), [],
        'Native Host must not rediscover remote Skills for disposed Agent')
      assert.equal(await provider.get(candidate, { scope: second }), undefined)
      await userMessage(ctx, second, 'Start a fresh task after disposal')
      assert.deepEqual(await provider.list({ scope: second }), [],
        'Late claimed message cannot resurrect the terminated Agent')
      assert.equal(fetcher.requests.length, 3,
        'A disposed Agent must not launch additional remote requests')
      const freshAgent = {}
      assert.ok((await provider.list({ scope: freshAgent })).length > 0,
        'A separate, new Agent remains independent')
      assert.equal(skills.providers.size, 2)
      await fiber.dispose()
      fiber = undefined
      assert.equal(skills.providers.size, 0)
      assert.equal(tools.definitions.size, 0)
      assert.ok([...skills.controllers].every(c => c.signal.aborted))
      assert.deepEqual(await provider.list(), [])
      assert.equal(await provider.get(candidate), undefined)
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await releaseSkills()
      await releaseTools()
      globalThis.fetch = previousFetch
    }
  })

  it('unregisters on native Skills service withdrawal and re-registers once on remount', async () => {
    const ctx = new Context()
    const tools = nativeTools()
    const first = skillHost()
    const second = skillHost()
    const releaseTools = ctx.provide('tools', tools)
    let releaseSkills = ctx.provide('skills', first)
    let fiber
    try {
      fiber = await ctx.plugin({
        name: codeWorker.name, inject: codeWorker.inject, apply: codeWorker.apply,
      }, { github: { enabled: false } })
      await settle(() => first.providers.size === 2)
      const formerProvider = first.providers.get('delta-code-approved-github')
      await releaseSkills()
      releaseSkills = undefined
      await settle(() => first.providers.size === 0)
      assert.deepEqual(await formerProvider.list(), [])
      assert.equal(first.disposals, 2)
      assert.ok([...first.controllers].every(c => c.signal.aborted))

      releaseSkills = ctx.provide('skills', second)
      await settle(() => second.providers.size === 2)
      assert.equal(second.controllers.size, 2)
      assert.equal(first.disposals, 2)
      assert.ok((await second.providers.get('delta-code-coding').list()).length > 0)
      assert.ok(tools.definitions.has('code_workflow_route'))
      await fiber.dispose()
      fiber = undefined
      assert.equal(second.providers.size, 0)
      assert.equal(tools.definitions.size, 0)
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      if (releaseSkills) await releaseSkills()
      await releaseTools()
    }
  })
})

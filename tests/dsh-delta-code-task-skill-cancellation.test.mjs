import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { registerApprovedGitHubSkills } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/github-skills.js'

function host() {
  const listeners = new Map()
  const registrations = []
  const controllers = []
  let invalidations = 0
  let disposals = 0
  let provider
  const ctx = {
    on(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(handler)
      return () => {
        listeners.get(name).delete(handler)
        if (listeners.get(name).size === 0) listeners.delete(name)
      }
    },
    inject(services, listener) {
      assert.deepEqual(services, ['skills'])
      listener({ skills: {
        registerProvider(factory) {
          const controller = new AbortController()
          controllers.push(controller)
          provider = factory({ signal: controller.signal, invalidate() { invalidations++ } })
          registrations.push(provider)
          return () => {
            disposals++
            controller.abort(new Error('provider registration disposed'))
          }
        },
      } })
    },
    logger: { warn() {} },
  }
  return {
    ctx, listeners, registrations, controllers,
    get provider() { return provider },
    get invalidations() { return invalidations },
    get disposals() { return disposals },
    emit(name, payload) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(payload)
    },
    message(agent, text, kind = 'user') {
      this.emit('agent/inbox/claimed', {
        agent, message: { source: { kind }, content: [{ type: 'text', text }] },
      })
    },
  }
}

function pendingFetches() {
  const requests = []
  const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => {
    requests.push(signal)
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  return { requests, fetcher }
}

async function afterFetches(fetches, count) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (fetches.requests.length >= count) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.equal(fetches.requests.length, count, 'fetch did not start')
}

describe('Delta Code remote Skill task-scoped cancellation', () => {
  it('cancels only superseded Agent fetches; ignores tool content and preserves continuations', async () => {
    const h = host()
    const f = pendingFetches()
    const stop = registerApprovedGitHubSkills(h.ctx, f.fetcher)
    const agentA = {}
    const agentB = {}
    try {
      h.message(agentA, 'Implement a React component')
      h.message(agentB, 'Refactor React UI')
      const [candidate] = await h.provider.list({ scope: agentA })
      assert.ok(candidate)
      const oldA = h.provider.get(candidate, { scope: agentA })
      const activeB = h.provider.get(candidate, { scope: agentB })
      await afterFetches(f, 2)

      h.message(agentA, 'CI failed', 'tool')
      h.message(agentA, '继续推进任务')
      assert.ok(f.requests.every(signal => !signal.aborted), 'continuation/tool output must not cancel requests')

      h.message(agentA, 'Review a different TypeScript repository')
      await assert.rejects(oldA, /skill task superseded/)
      assert.equal(f.requests[0].aborted, true)
      assert.equal(f.requests[1].aborted, false)

      const currentA = h.provider.get(candidate, { scope: agentA })
      await afterFetches(f, 3)
      h.emit('agent/disposed', { agent: agentB })
      await assert.rejects(activeB, /skill agent disposed/)
      assert.equal(f.requests[2].aborted, false)
      // A late Host get/list must not re-create state for a retired Agent.
      assert.deepEqual(await h.provider.list({ scope: agentB }), [])
      assert.equal(await h.provider.get(candidate, { scope: agentB }), undefined)
      h.message(agentB, 'Implement a fresh UI task')
      assert.deepEqual(await h.provider.list({ scope: agentB }), [])
      assert.equal(f.requests.length, 3)
      assert.ok((await h.provider.list({ scope: agentA })).length > 0)

      stop()
      await assert.rejects(currentA, /skill plugin disposed/)
      assert.equal(h.disposals, 1)
      assert.equal(h.listeners.size, 0)
      assert.deepEqual(await h.provider.list({ scope: agentA }), [])
      stop()
      assert.equal(h.disposals, 1)
    } finally {
      stop()
    }
  })

  it('hides remote Skills on user opt-out and refreshes only the relevant catalog state', async () => {
    const h = host()
    const f = pendingFetches()
    const stop = registerApprovedGitHubSkills(h.ctx, f.fetcher)
    const first = {}
    const other = {}
    try {
      const [candidate] = await h.provider.list({ scope: first })
      assert.ok(candidate)
      assert.ok((await h.provider.list({ scope: other })).length > 0)
      h.message(first, 'Do not use GitHub Skills for this task')
      assert.equal(h.invalidations, 1)
      assert.deepEqual(await h.provider.list({ scope: first }), [])
      assert.equal(await h.provider.get(candidate, { scope: first }), undefined)
      assert.ok((await h.provider.list({ scope: other })).length > 0)
      assert.equal(f.requests.length, 0)

      h.message(first, '继续')
      assert.deepEqual(await h.provider.list({ scope: first }), [])
      assert.equal(h.invalidations, 1)
      h.message(first, 'Implement a new React component')
      assert.equal(h.invalidations, 2)
      assert.ok((await h.provider.list({ scope: first })).length > 0)
      const pending = h.provider.get(candidate, { scope: first })
      await afterFetches(f, 1)
      h.message(first, 'Do not use GitHub Skills')
      await assert.rejects(pending, /external Skill use denied by user/)
      assert.equal(h.invalidations, 3)
      h.emit('agent/disposed', { agent: first })
      assert.equal(h.invalidations, 4)
    } finally {
      stop()
    }
  })

  it('retains native caller cancellation when the Host supplies no scoped Agent identity', async () => {
    const h = host()
    const f = pendingFetches()
    const stop = registerApprovedGitHubSkills(h.ctx, f.fetcher)
    try {
      const [candidate] = await h.provider.list()
      const controller = new AbortController()
      const pending = h.provider.get(candidate, { signal: controller.signal })
      await afterFetches(f, 1)
      controller.abort(new Error('native caller canceled'))
      await assert.rejects(pending, /native caller canceled/)
      assert.equal(f.requests[0].aborted, true)
      assert.equal(h.invalidations, 0)
    } finally {
      stop()
    }
  })
})

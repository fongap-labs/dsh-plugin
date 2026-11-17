import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SkillOutcomeFeedback } from '../packages/dsh-delta-code/lib/delta-code-strategy/skill-outcome-feedback.js'
import { registerAutomaticCodingRouter } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/auto-routing.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const react = 'vercel-react-best-practices'
const compose = 'vercel-composition-patterns'
const names = [react, compose]
const provider = 'delta-code-approved-github'

describe('Delta Code bounded Skill outcome feedback', () => {
  it('counts approved, actually loaded skills and definite checks only', () => {
    const feedback = new SkillOutcomeFeedback()
    feedback.beginTask()
    feedback.noteLoaded(react, 'unreviewed')
    feedback.noteLoaded('unreviewed', provider)
    feedback.observeVerification(true)
    assert.deepEqual(feedback.read(react), { loads: 0, verified: 0, failed: 0 })
    feedback.noteLoaded(react, provider)
    feedback.noteLoaded(react, provider)
    feedback.observeVerification(true)
    feedback.observeVerification(false)
    assert.deepEqual(feedback.read(react), { loads: 1, verified: 1, failed: 0 })
  })

  it('never ranks on insufficient evidence, and never recommends unapproved names', () => {
    const feedback = new SkillOutcomeFeedback()
    feedback.beginTask()
    feedback.noteLoaded(compose, provider)
    feedback.observeVerification(true)
    assert.deepEqual(feedback.prioritize(names), names)
    assert.deepEqual(feedback.prioritize(['unreviewed']), [])
  })

  it('does not assign a shared verification result to multiple loaded Skills', () => {
    const feedback = new SkillOutcomeFeedback()
    feedback.beginTask()
    feedback.noteLoaded(react, provider)
    feedback.noteLoaded(compose, provider)
    feedback.observeVerification(true)
    assert.deepEqual(feedback.read(react), { loads: 1, verified: 0, failed: 0 })
    assert.deepEqual(feedback.read(compose), { loads: 1, verified: 0, failed: 0 })
  })

  it('uses at least three meaningful observations before reordering equivalent matches', () => {
    const feedback = new SkillOutcomeFeedback()
    for (let index = 0; index < 5; index += 1) {
      feedback.beginTask()
      feedback.noteLoaded(compose, provider)
      feedback.observeVerification(true)
      feedback.beginTask()
      feedback.noteLoaded(react, provider)
      feedback.observeVerification(false)
    }
    assert.deepEqual(feedback.prioritize(names), [compose, react])
    assert.deepEqual(feedback.read(compose), { loads: 5, verified: 5, failed: 0 })
    assert.deepEqual(feedback.read(react), { loads: 5, verified: 0, failed: 5 })
  })
})

describe('Delta Code native result wiring', () => {
  it('updates only approved, observed skills and resets attribution at every user task', () => {
    const listeners = new Map()
    let prompt
    const host = {
      on(name, listener) { listeners.set(name, listener); return () => listeners.delete(name) },
      inject(dependencies, listener) {
        assert.deepEqual(dependencies, ['systemPrompt'])
        listener({ systemPrompt: { context(entry) {
          prompt = entry
          return () => { prompt = undefined }
        } } })
      },
    }
    const dispose = registerAutomaticCodingRouter(host, () => normalizeConfig({}))
    const agent = {}
    const claim = (text) => listeners.get('agent/inbox/claimed')({
      agent, message: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
    })
    const result = (name, value) => listeners.get('tools/result')(
      { agent, name }, { isError: false, value },
    )
    for (let index = 0; index < 5; index += 1) {
      claim('Implement React compound components')
      result('skill', { name: compose, provider })
      result('code_verify', { passed: true })
      claim('Implement React compound components')
      result('skill', { name: react, provider })
      result('code_verify', { passed: false })
    }
    claim('Implement React compound components')
    const guidance = prompt.text({ agent })
    assert.match(guidance, /Approved external specialist Skill candidates/)
    assert.ok(guidance.indexOf(compose) < guidance.indexOf(react))
    result('skill', { name: react, provider })
    claim('Refactor a Rust API implementation') // same route but unrelated task
    result('code_verify', { passed: true }) // must not be credited to React
    claim('Implement React compound components')
    const later = prompt.text({ agent })
    assert.ok(later.indexOf(compose) < later.indexOf(react))
    dispose()
    assert.equal(listeners.size, 0)
  })
})

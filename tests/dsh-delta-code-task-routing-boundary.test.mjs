import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { routeCodingTask } from '../packages/dsh-delta-code/lib/delta-code-strategy/task-routing.js'
import { registerAutomaticCodingRouter } from '../packages/dsh-delta-code/lib/auto-routing.js'

const root = new URL('../packages/dsh-delta-code/src/', import.meta.url)

describe('Delta Code host-neutral route policy', () => {
  it('keeps task routing independent from Harness services and SDK types', () => {
    const policy = readFileSync(new URL('delta-code-strategy/task-routing.ts', root), 'utf8')
    const feature = readFileSync(new URL('delta-code-strategy/index.ts', root), 'utf8')
    const provider = readFileSync(new URL('delta-code-adapter/providers/dsh/auto-routing.ts', root), 'utf8')
    assert.doesNotMatch(policy, /@deepseek-ai|ctx\\.|systemPrompt|providers\\//)
    assert.doesNotMatch(feature, /providers\\//)
    assert.match(provider, /agent\\/inbox\\/claimed/)
    assert.match(provider, /systemPrompt/)
    assert.equal(typeof registerAutomaticCodingRouter, 'function')
  })

  it('preserves deterministic routes and continuation behavior', () => {
    assert.equal(routeCodingTask('Fix GitHub Actions CI failure'), 'code-ci-repair')
    assert.equal(routeCodingTask('implement a new React component'), 'code-feature-delivery')
    assert.equal(routeCodingTask('continue', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('What is the weather?'), undefined)
  })
})

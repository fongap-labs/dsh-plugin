import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  routeCodingTask, DEFAULT_CODING_ROUTE_RULES,
} from '../packages/dsh-delta-code/lib/delta-code-strategy/task-routing.js'
import {
  chooseTaskResources, taskResourceGuidance, DEFAULT_TASK_RESOURCE_RULES,
} from '../packages/dsh-delta-code/lib/delta-code-strategy/task-resource-policy.js'
import { matchesDeclarativeRule } from '../packages/dsh-delta-code/lib/delta-code-strategy/declarative-rules.js'
import { registerAutomaticCodingRouter } from '../packages/dsh-delta-code/lib/auto-routing.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

describe('Delta Code reviewed declarative task policy catalog', () => {
  it('keeps stable built-in behavior and uses ordered first-match priority', () => {
    assert.equal(routeCodingTask('Fix GitHub Actions CI failure'), 'code-ci-repair')
    assert.equal(routeCodingTask('设计 API 架构方案'), 'code-writing-plans')
    assert.equal(routeCodingTask('只修改一个 TypeScript 函数名称'), 'code-fast-change')
    assert.equal(routeCodingTask('页面截图与设计稿对齐，像素级视觉一致性'), 'code-visual-parity')
    assert.equal(routeCodingTask('继续', 'code-ci-repair'), 'code-ci-repair')
    assert.ok(DEFAULT_CODING_ROUTE_RULES.every(rule => rule.route && rule.anyOf?.length))
    assert.deepEqual(chooseTaskResources('Audit multi-repo MCP tool capability'), ['cross-repo', 'native-tools'])
    assert.equal(DEFAULT_TASK_RESOURCE_RULES.length, 4)
    const custom = [
      { route: 'code-review-readiness', anyOf: [/CI failure/i] },
      ...DEFAULT_CODING_ROUTE_RULES,
    ]
    assert.equal(routeCodingTask('Fix GitHub Actions CI failure', undefined, custom), 'code-review-readiness')
    assert.equal(routeCodingTask('Fix GitHub Actions CI failure'), 'code-ci-repair')
  })

  it('supports new scoped rules and resource types without editing engine branches', () => {
    const routeRules = [
      { route: 'code-specialist-future', anyOf: [/audit-proof/], requiresCodingIntent: true },
      ...DEFAULT_CODING_ROUTE_RULES,
    ]
    assert.equal(routeCodingTask('Review code audit-proof', undefined, routeRules), 'code-specialist-future')
    assert.equal(routeCodingTask('Review code audit-proof'), 'code-review-readiness')
    assert.equal(routeCodingTask('What is audit-proof?', undefined, routeRules), undefined)

    const customResources = [
      { resource: 'api-dependency-audit', anyOf: [/dependency safety audit/i],
        guidance: 'Review only authorized dependencies and do not execute external installers.' },
      ...DEFAULT_TASK_RESOURCE_RULES,
    ]
    const resources = chooseTaskResources('Run dependency safety audit in Rust code', customResources)
    assert.deepEqual(resources, ['api-dependency-audit'])
    assert.deepEqual(taskResourceGuidance(resources, customResources), [
      'Review only authorized dependencies and do not execute external installers.',
    ])
    assert.deepEqual(chooseTaskResources('Run dependency safety audit in Rust code'), [])
  })

  it('respects every policy signal without RegExp global or sticky state leakage', () => {
    const anyOf = { anyOf: [/cargo/gi, /swift/y], allOf: [/build/i], noneOf: [/skip/i] }
    assert.equal(matchesDeclarativeRule(anyOf, 'cargo build'), true)
    assert.equal(matchesDeclarativeRule(anyOf, 'cargo build'), true)
    assert.equal(matchesDeclarativeRule(anyOf, 'swift build'), true)
    assert.equal(matchesDeclarativeRule(anyOf, 'cargo build skip'), false)
    assert.equal(matchesDeclarativeRule({ anyOf: [] }, 'anything'), false)
    assert.equal(matchesDeclarativeRule({}, 'anything'), false)
    assert.throws(() => matchesDeclarativeRule({ anyOf: ['not-a-pattern'] }, 'anything'), /regular expressions/)

    const rules = [{ resource: 'official-docs', anyOf: [/docs/gi], guidance: 'Verified docs only' }]
    assert.deepEqual(chooseTaskResources('docs, docs', rules), ['official-docs'])
    assert.deepEqual(chooseTaskResources('docs, docs', rules), ['official-docs'])
    assert.deepEqual(taskResourceGuidance(['unregistered-resource'], rules), [])
  })

  it('cannot bypass explicit Code Worker or external-Skill opt-outs through injected rules', () => {
    const custom = [
      { route: 'code-feature-delivery', anyOf: [/typescript/i] },
      { route: 'code-find-skills', anyOf: [/skills/i] },
    ]
    assert.equal(routeCodingTask('不要使用 Code Worker，帮我改 TypeScript 代码', undefined, custom), undefined)
    const text = 'Find GitHub Skills but do not use GitHub Skills'
    assert.notEqual(routeCodingTask(text, undefined, custom), 'code-find-skills')
    assert.deepEqual(chooseTaskResources(text, [
      { resource: 'skill-discovery', anyOf: [/skills/i], guidance: 'External Skill search' },
    ]), [])
    assert.equal(routeCodingTask('继续', 'code-ci-repair', custom), 'code-ci-repair')
  })

  it('injects reviewed policy catalogs into the Host without starting a second runtime', () => {
    const handlers = new Map()
    let render
    const host = {
      on(event, handler) {
        handlers.set(event, handler)
        return () => handlers.delete(event)
      },
      inject(services, callback) {
        assert.deepEqual(services, ['systemPrompt'])
        callback({ systemPrompt: { context(entry) {
          render = entry.text
          return () => { render = undefined }
        } } })
      },
    }
    const policies = {
      routeRules: [{ route: 'code-review-readiness', anyOf: [/audit-proof/i] },
        ...DEFAULT_CODING_ROUTE_RULES],
      resourceRules: [{ resource: 'approved-input', anyOf: [/audit-proof/i],
        guidance: 'Review only verified source input.' }],
    }
    const stop = registerAutomaticCodingRouter(host, () => normalizeConfig({}), policies)
    const agent = {}
    handlers.get('agent/inbox/claimed')({
      agent, message: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Review code audit-proof' }] },
    })
    assert.match(render({ agent }), /code-review-readiness/)
    assert.match(render({ agent }), /Review only verified source input/)
    handlers.get('agent/inbox/claimed')({
      agent, message: { source: { kind: 'tool' }, content: [{ type: 'text', text: 'Fix CI failure' }] },
    })
    assert.doesNotMatch(render({ agent }), /code-ci-repair/)
    stop()
    assert.equal(render, undefined)
    assert.equal(handlers.size, 0)
  })
})

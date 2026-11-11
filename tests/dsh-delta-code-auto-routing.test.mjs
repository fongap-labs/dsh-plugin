import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { routeCodingTask, registerAutomaticCodingRouter } from '../packages/dsh-delta-code/lib/auto-routing.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

function fixture() {
  const listeners = new Map()
  let dynamic
  let settings = normalizeConfig({})
  const host = {
    on(name, callback) {
      listeners.set(name, callback)
      return () => listeners.delete(name)
    },
    inject(deps, callback) {
      assert.deepEqual(deps, ['systemPrompt'])
      callback({ systemPrompt: {
        context(entry) {
          dynamic = entry
          return () => { dynamic = undefined }
        },
      } })
    },
  }
  const dispose = registerAutomaticCodingRouter(host, () => settings)
  const claim = (agent, text, source = 'user') => listeners.get('agent/inbox/claimed')?.({
    agent, message: { source: { kind: source }, content: [{ type: 'text', text }] },
  })
  const render = agent => dynamic?.text({ agent }) ?? ''
  return {
    claim, render, dispose, listeners,
    update: config => { settings = normalizeConfig(config) },
  }
}

describe('Code Worker automatic user-task routing', () => {
  it('selects minimal workflows for coding requests in Chinese and English', () => {
    assert.equal(routeCodingTask('PR #76 CI红叉，定位并修复'), 'code-ci-repair')
    assert.equal(routeCodingTask('Fix CI failure in GitHub Actions'), 'code-ci-repair')
    assert.equal(routeCodingTask('修复 Python 程序崩溃的 bug'), 'code-root-cause-debugging')
    assert.equal(routeCodingTask('请审查这个 Rust PR 的代码'), 'code-review-readiness')
    assert.equal(routeCodingTask('设计 API 架构方案'), 'code-writing-plans')
    assert.equal(routeCodingTask('只修改一个 TypeScript 函数名称'), 'code-fast-change')
    assert.equal(routeCodingTask('实现一个 React 新功能'), 'code-feature-delivery')
    assert.equal(routeCodingTask('继续', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('继续推进任务链', 'code-feature-delivery'), 'code-feature-delivery')
    assert.equal(routeCodingTask('继续推进', 'code-root-cause-debugging'), 'code-root-cause-debugging')
    assert.equal(routeCodingTask('继续执行任务', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('接着做', 'code-review-readiness'), 'code-review-readiness')
    assert.equal(routeCodingTask('继续推进任务链'), undefined)
  })

  it('prioritizes the instruction after a long CI log instead of stale failure text', () => {
    const log = 'GitHub Actions CI failed: error 500\n'.repeat(240)
    assert.ok(log.length > 4096)
    assert.equal(routeCodingTask(log + '\n请设计 API 架构方案'), 'code-writing-plans')
    assert.equal(routeCodingTask(log + '\n请修复 GitHub CI 红叉'), 'code-ci-repair')
  })
  it('adds only lightweight guidance to fast changes', () => {
    const f = fixture()
    try {
      const agent = {}
      f.claim(agent, '只修改一个 TypeScript 函数名称')
      assert.match(f.render(agent), /minimal fast change/)
      assert.match(f.render(agent), /optional, not required/)
      assert.doesNotMatch(f.render(agent), /automatically selected coding workflow/)
    } finally { f.dispose() }
  })

  it('does not route general conversation, explanations, or opt-outs', () => {
    assert.equal(routeCodingTask('今天有什么新闻'), undefined)
    assert.equal(routeCodingTask('解释一下 Python 是什么'), undefined)
    assert.equal(routeCodingTask('不要使用 Code Worker，帮我改 TypeScript 代码'), undefined)
    assert.equal(routeCodingTask('continue'), undefined)
  })
  it('automatically applies only the current agent coding workflow', () => {
    const f = fixture()
    const alice = {}
    const bob = {}
    f.claim(alice, '修复 PR #76 CI 红叉')
    assert.match(f.render(alice), /code-ci-repair/)
    assert.equal(f.render(bob), '')
    f.claim(bob, '实现一个 React 新功能')
    assert.match(f.render(bob), /code-feature-delivery/)
    assert.match(f.render(alice), /code-ci-repair/)
    f.claim(alice, '继续推进任务链')
    assert.match(f.render(alice), /code-ci-repair/)
    f.claim(alice, '继续')
    assert.match(f.render(alice), /code-ci-repair/)
    f.claim(alice, '今晚吃什么')
    assert.equal(f.render(alice), '')
    f.dispose()
    assert.equal(f.render(bob), '')
    assert.equal(f.listeners.size, 0)
  })
  it('ignores injected tool content and supports a user-controlled disable', () => {
    const f = fixture()
    const agent = {}
    f.claim(agent, '修复 PR #76 CI 红叉', 'tool-result')
    assert.equal(f.render(agent), '')
    f.claim(agent, '修复 PR #76 CI 红叉')
    assert.match(f.render(agent), /code-ci-repair/)
    f.update({ autoRouting: false })
    assert.equal(f.render(agent), '')
    f.update({ enabled: false })
    assert.equal(f.render(agent), '')
    f.dispose()
  })
})

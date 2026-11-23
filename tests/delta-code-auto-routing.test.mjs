import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { routeCodingTask, registerAutomaticCodingRouter } from '../packages/delta-code/lib/auto-routing.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'
import { UserTaskContext } from '../packages/delta-code/lib/delta-code-strategy/intent-contract.js'

function fixture(nativeResume, taskContext, stats) {
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
  const dispose = registerAutomaticCodingRouter(host, () => settings, undefined, nativeResume, taskContext, stats)
  const claim = (agent, text, source = 'user') => listeners.get('agent/inbox/claimed')?.({
    agent, message: { source: { kind: source }, content: [{ type: 'text', text }] },
  })
  const render = agent => dynamic?.text({ agent }) ?? ''
  return {
    claim, render, dispose, listeners,
    emit: (name, ...args) => listeners.get(name)?.(...args),
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
    assert.equal(routeCodingTask('\u53ea\u4fee\u6539\u6574\u4e2a TypeScript \u9879\u76ee\u7684\u5168\u90e8\u63a5\u53e3'), 'code-feature-delivery')
    assert.equal(routeCodingTask('\u4ec5\u4fee\u6539\u6240\u6709 Rust \u6a21\u5757\u7684\u63a5\u53e3'), 'code-feature-delivery')
    assert.equal(routeCodingTask('实现一个 React 新功能'), 'code-feature-delivery')
    assert.equal(routeCodingTask('继续', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('继续推进任务链', 'code-feature-delivery'), 'code-feature-delivery')
    assert.equal(routeCodingTask('继续，禁止新增环境变量', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('继续推进任务，保留现有 CI 门禁', 'code-feature-delivery'), 'code-feature-delivery')
    assert.equal(routeCodingTask('继续，禁止新增环境变量'), undefined)
    assert.equal(routeCodingTask('继续推进', 'code-root-cause-debugging'), 'code-root-cause-debugging')
    assert.equal(routeCodingTask('继续执行任务', 'code-ci-repair'), 'code-ci-repair')
    assert.equal(routeCodingTask('接着做', 'code-review-readiness'), 'code-review-readiness')
    assert.equal(routeCodingTask('继续推进任务链'), undefined)
  })

  it('routes specialist performance, runtime, visual and skill evaluation tasks', () => {
    assert.equal(routeCodingTask('优化启动性能，减少 500ms 延迟'), 'code-perf-issue')
    assert.equal(routeCodingTask('benchmark 显示内存泄漏，追踪 CPU profile'), 'code-runtime-forensics')
    assert.equal(routeCodingTask('页面截图与设计稿对齐，像素级视觉一致性'), 'code-visual-parity')
    assert.equal(routeCodingTask('评估新 Skill 的行为表现，对比旧版本输出'), 'code-skill-evaluation')
    assert.equal(routeCodingTask('measure latency and compare baseline'), 'code-perf-issue')
    assert.equal(routeCodingTask('analyze heap snapshot for leak'), 'code-runtime-forensics')
    assert.equal(routeCodingTask('visual regression test against reference screenshot'), 'code-visual-parity')
    assert.equal(routeCodingTask('evaluate prompt change against rubric'), 'code-skill-evaluation')
  })


  it('keeps the current task source across continuation with optional routing disabled', () => {
    const taskContext = new UserTaskContext()
    const f = fixture(undefined, taskContext)
    try {
      const agent = {}
      f.update({ autoRouting: false })
      f.claim(agent, '修复真实 CI 红叉，并且不得绕过中央门禁')
      assert.equal(taskContext.read(agent), '修复真实 CI 红叉，并且不得绕过中央门禁')
      f.claim(agent, '继续')
      assert.equal(taskContext.read(agent), '修复真实 CI 红叉，并且不得绕过中央门禁')
      f.claim(agent, '继续，禁止新增环境变量')
      assert.deepEqual(taskContext.readSources(agent), {
        current: '继续，禁止新增环境变量',
        inherited: ['修复真实 CI 红叉，并且不得绕过中央门禁'],
        historyIncomplete: false,
      })
      f.claim(agent, '继续')
      assert.equal(taskContext.read(agent), '继续，禁止新增环境变量')
      f.claim(agent, '改为审查源码')
      assert.equal(taskContext.read(agent), '改为审查源码')
      f.emit('agent/disposed', { agent })
      assert.equal(taskContext.read(agent), undefined)
    } finally { f.dispose() }
  })

  it('prioritizes the instruction after a long CI log instead of stale failure text', () => {
    const log = 'GitHub Actions CI failed: error 500\n'.repeat(240)
    assert.ok(log.length > 4096)
    assert.equal(routeCodingTask(log + '\n请设计 API 架构方案'), 'code-writing-plans')
    assert.equal(routeCodingTask(log + '\n请修复 GitHub CI 红叉'), 'code-ci-repair')
  })
  it('suggests pinned web guidance only once for relevant web tasks and honors opt-outs', () => {
    const f = fixture()
    try {
      const agent = {}
      f.claim(agent, 'Fix CSS dialog keyboard focus')
      assert.match(f.render(agent), /code_modern_web_guidance/)
      assert.match(f.render(agent), /Do not run npx/)
      f.emit('tools/result', { agent, name: 'code_modern_web_guidance' },
        { isError: false, value: { action: 'search', matches: [] } })
      assert.doesNotMatch(f.render(agent), /use action=search/)
      f.claim(agent, '继续')
      assert.doesNotMatch(f.render(agent), /use action=search/)
      f.claim(agent, 'Fix Rust backend build')
      assert.doesNotMatch(f.render(agent), /code_modern_web_guidance/)
      f.claim(agent, 'Fix HTML dialog but do not use GitHub Skills')
      assert.doesNotMatch(f.render(agent), /code_modern_web_guidance/)
      f.claim(agent, '修复 HTML 弹窗焦点')
      assert.match(f.render(agent), /code_modern_web_guidance/)
    } finally { f.dispose() }
  })

  it('adds only lightweight guidance to fast changes', () => {
    const f = fixture()
    try {
      const agent = {}
      f.claim(agent, '只修改一个 TypeScript 函数名称')
      assert.match(f.render(agent), /minimal fast change/)
      assert.match(f.render(agent), /optional, not required/)
      assert.match(f.render(agent), /unbounded \*\*\/\* glob/)
      assert.doesNotMatch(f.render(agent), /automatically selected coding workflow/)
    } finally { f.dispose() }
  })

  it('preserves hints for a true continuation but clears them when a new task shares the same route', () => {
    const f = fixture()
    try {
      const agent = {}
      f.claim(agent, 'Implement React component with official API documentation')
      assert.match(f.render(agent), /vercel-react-best-practices/)
      assert.match(f.render(agent), /official versioned API documentation/)
      f.claim(agent, '继续推进任务链')
      assert.match(f.render(agent), /vercel-react-best-practices/)
      assert.match(f.render(agent), /official versioned API documentation/)
      f.claim(agent, 'Implement a Rust library cache layer')
      assert.match(f.render(agent), /code-feature-delivery/)
      assert.doesNotMatch(f.render(agent), /vercel-react-best-practices/)
      assert.doesNotMatch(f.render(agent), /official versioned API documentation/)
    } finally { f.dispose() }
  })

  it('honors user external Skill opt-out throughout task continuations', () => {
    const f = fixture()
    try {
      const agent = {}
      f.claim(agent, 'Implement a React UI, but do not use GitHub Skills')
      assert.match(f.render(agent), /code-feature-delivery/)
      assert.match(f.render(agent), /External GitHub Skills are disabled by the user/)
      assert.doesNotMatch(f.render(agent), /vercel-react-best-practices/)
      assert.doesNotMatch(f.render(agent), /load code-find-skills/)
      f.claim(agent, '继续推进任务链')
      assert.match(f.render(agent), /External GitHub Skills are disabled by the user/)
      assert.doesNotMatch(f.render(agent), /vercel-react-best-practices/)
      f.claim(agent, 'Implement a React UI with official API documentation')
      assert.match(f.render(agent), /vercel-react-best-practices/)
      assert.doesNotMatch(f.render(agent), /External GitHub Skills are disabled by the user/)
    } finally { f.dispose() }
  })

  it('offers a final-gate advisory only for completed native Todo checkpoints', () => {
    const states = new Map()
    const reader = { read: agent => states.get(agent), dispose() {} }
    const f = fixture(reader)
    try {
      const agent = {}
      f.update({ execution: { allowCommands: true } })
      f.claim(agent, 'Implement a React feature')
      states.set(agent, { writeSeq: 12, invalid: false, tasks: [
        { content: 'Implement React feature', status: 'completed' },
      ] })
      assert.match(f.render(agent), /native Todo checkpoint reports implementation tasks complete/)
      f.emit('tools/result', { agent, name: 'code_delivery_gate' },
        { isError: false, value: { stage: 'blocked', ready: false } })
      assert.doesNotMatch(f.render(agent), /native Todo checkpoint reports implementation tasks complete/)
      states.set(agent, { writeSeq: 13, invalid: false, tasks: [
        { content: 'Implement React feature', status: 'completed' },
      ] })
      assert.match(f.render(agent), /native Todo checkpoint reports implementation tasks complete/)
      states.set(agent, { writeSeq: 14, invalid: false, tasks: [
        { content: 'Implement React feature', status: 'pending' },
      ] })
      assert.doesNotMatch(f.render(agent), /native Todo checkpoint reports implementation tasks complete/)
      f.update({ autoRouting: false })
      assert.equal(f.render(agent), '')
    } finally { f.dispose() }
  })

  it('does not infer readiness from invalid or missing native Todo history', () => {
    const f = fixture({ read() { return { writeSeq: 6, invalid: true, tasks: [
      { content: 'Implement feature', status: 'completed' },
    ] } }, dispose() {} })
    try {
      const agent = {}
      f.update({ execution: { allowCommands: true } })
      f.claim(agent, 'Implement a React feature')
      assert.doesNotMatch(f.render(agent), /native Todo checkpoint reports implementation tasks complete/)
    } finally { f.dispose() }
  })

  it('warns once per observed repeat failure and isolates the next user task', () => {
    const counts = new WeakMap()
    const stats = { readRepeatedFailedCalls: agent => counts.get(agent) ?? 0 }
    const f = fixture(undefined, undefined, stats)
    const agent = {}
    const other = {}
    try {
      f.claim(agent, 'Fix the broken CI tests')
      assert.doesNotMatch(f.render(agent), /identical arguments was repeated/)
      counts.set(agent, 1)
      assert.match(f.render(agent), /identical arguments was repeated/)
      assert.doesNotMatch(f.render(agent), /secret-value/)
      assert.doesNotMatch(f.render(agent), /identical arguments was repeated/, 'once per failure count')
      f.claim(agent, '继续推进任务')
      assert.doesNotMatch(f.render(agent), /identical arguments was repeated/)
      counts.set(agent, 2)
      assert.match(f.render(agent), /identical arguments was repeated/)
      f.claim(other, 'Fix the broken CI tests')
      assert.doesNotMatch(f.render(other), /identical arguments was repeated/)
      f.claim(agent, 'Fix a new CI failure')
      assert.doesNotMatch(f.render(agent), /identical arguments was repeated/, 'new task baseline')
      f.update({ autoRouting: false })
      counts.set(agent, 3)
      assert.equal(f.render(agent), '', 'disabled routing never injects hints')
    } finally { f.dispose() }
  })

  it('does not route general conversation, explanations, or opt-outs', () => {
    assert.equal(routeCodingTask('今天有什么新闻'), undefined)
    assert.equal(routeCodingTask('解释一下 Python 是什么'), undefined)
    assert.equal(routeCodingTask('不要使用 Code Worker，帮我改 TypeScript 代码'), undefined)
    assert.equal(routeCodingTask('continue'), undefined)
    assert.equal(routeCodingTask('为什么我的电脑最近性能很差'), undefined)
    assert.equal(routeCodingTask('解释一下 Skill evaluation 是什么'), undefined)
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
    assert.match(f.render(bob), /independent read-only diff review/)
    assert.ok(f.render(bob).includes('code_capabilities list/get/compose'))
    assert.match(f.render(bob), /keyword-based hint, not authority/)
    assert.match(f.render(bob), /load only applicable Skills through the native catalog/)
    assert.doesNotMatch(f.render(bob), /For each ready task, create or adjust a failing test/)
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

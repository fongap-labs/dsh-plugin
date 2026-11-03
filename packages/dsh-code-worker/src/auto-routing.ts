import type { Context } from '@deepseek-ai/cordis'
import type { Settings } from './types.js'
import { ALL_CODING_SKILLS } from './skills.js'

export type CodingRoute = 'code-ci-repair' | 'code-root-cause-debugging' | 'code-review-readiness'
  | 'code-writing-plans' | 'code-fast-change' | 'code-feature-delivery'

const CONTINUE = /^(?:继续|接着|继续做|继续执行|继续修|go on|continue|proceed|keep going)[。.!！\s]*$/i
const OPT_OUT = /(?:不要|别|停止|关闭|禁用)(?:使用|加载|启用)?\s*(?:code[\s-]?worker|编程模式|coding\s*mode)|(?:disable|don't use|do not use)\s+(?:code[\s-]?worker|coding\s*mode)/i
const CODE_OBJECT = /(?:代码|源码|编程|程序|脚本|仓库|项目|插件|组件|接口|函数|模块|依赖|单元测试|构建|编译|部署|工作流|工单|PR\b|CI\b|GitHub|TypeScript|JavaScript|Python|Rust|Cargo|Go\b|React|Vue|API\b|bug\b|repo(?:sitory)?\b|code\b|test(?:s|ing)?\b|workflow\b|commit\b|pull request\b|\.tsx?\b|\.jsx?\b|\.py\b|\.rs\b|\.go\b)/i
const CODE_ACTION = /(?:修复|修正|改进|改造|实现|开发|编写|写一个|添加|新增|增加|删除|重构|优化|升级|审查|排查|调试|检测|测试|检查|合并|提交|运行|搭建|集成|落地|补齐|完善|处理|复现|定位|设计|规划|扫描|分析|评估|fix\b|implement\b|build\b|code\b|debug\b|refactor\b|review\b|test\b|run\b|add\b|remove\b|update\b|integrate\b|create\b)/i
const CI_FAILURE = /(?:CI\b|PR\b|GitHub|actions?|workflow|工作流|检查|构建).{0,28}(?:红叉|失败|报错|不通过|failed|failure|error|red\b)|(?:红叉|失败|报错|不通过|failed|failure).{0,28}(?:CI\b|PR\b|checks?|workflow|工作流)/i
const DEBUG = /(?:bug|错误|异常|报错|崩溃|失败|无法|不工作|闪退|失效|回归|修复|定位|排查|debug|broken|crash|failing|fix)/i
const REVIEW = /(?:审查|审计|code\s*review|review\b|安全检查|检查\s*(?:diff|PR|代码))|(?:评审|分析).{0,12}(?:PR|diff|源码|代码)/i
const PLAN = /(?:设计方案|架构设计|实施方案|施工方案|技术方案|规划|制定计划|design\s+(?:a|the)\s+(?:system|architecture)|write\s+(?:an?\s+)?plan)/i
const SMALL = /(?:只|仅|就|简单|小改|微调|一处|单个|一行|改名|重命名|文案|typo|small|tiny|single|one.line|rename)/i

/**
 * Route only user-authored coding intent, not arbitrary tool output or quoted text.
 * Short follow-ups inherit the current task route. A general discussion has no route.
 */
export function routeCodingTask(text: string, previous?: CodingRoute): CodingRoute | undefined {
  const input = text.trim().slice(0, 4096)
  if (!input || OPT_OUT.test(input)) return undefined
  if (CONTINUE.test(input)) return previous
  if (CI_FAILURE.test(input)) return 'code-ci-repair'
  if (!CODE_OBJECT.test(input) || !CODE_ACTION.test(input)) return undefined
  if (REVIEW.test(input)) return 'code-review-readiness'
  if (DEBUG.test(input)) return 'code-root-cause-debugging'
  if (PLAN.test(input) && !/(?:实现|开发|落地|implement|build)/i.test(input)) return 'code-writing-plans'
  if (SMALL.test(input) && input.length < 220) return 'code-fast-change'
  return 'code-feature-delivery'
}

interface UserClaim {
  agent?: object
  message?: {
    source?: { kind?: string }
    content?: Array<{ type?: string; text?: string }>
  }
}

interface PromptAssemblyContext {
  agent?: object
}

interface RuntimePromptService {
  context?: (entry: {
    name: string
    order: number
    text: (context: PromptAssemblyContext) => string
    interpolate: boolean
  }) => (() => void) | void
}

interface RuntimeContext {
  on?: (event: string, listener: (payload: UserClaim) => void) => (() => void) | void
  inject: (services: string[], listener: (child: unknown) => void) => unknown
}

/**
 * DSH claims user inbox messages before prompt assembly. The native dynamic
 * context therefore routes the *current agent* without a second dispatcher,
 * extra model call, raw user text in prompts, or manual skill invocation.
 */
export function registerAutomaticCodingRouter(ctx: Context, settings: () => Settings): () => void {
  const routed = new WeakMap<object, CodingRoute>()
  const byName = new Map(ALL_CODING_SKILLS.map(skill => [skill.name, skill]))
  const runtime = ctx as unknown as RuntimeContext
  const disposers: Array<() => void> = []
  let isActive = true
  if (typeof runtime.on === 'function') {
    const unsubscribe = runtime.on('agent/inbox/claimed', ({ agent, message }) => {
      if (!isActive || !settings().enabled || !settings().autoRoutingEnabled || !agent || !message) return
      if (message.source?.kind !== 'user') return
      const text = Array.isArray(message.content)
        ? message.content.filter(item => item.type === 'text' && typeof item.text === 'string')
          .map(item => item.text).join('\n').slice(0, 4096)
        : ''
      const next = routeCodingTask(text, routed.get(agent))
      if (next) routed.set(agent, next)
      else routed.delete(agent)
    })
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe)
    const clear = runtime.on('agent/disposed', ({ agent }) => { if (agent) routed.delete(agent) })
    if (typeof clear === 'function') disposers.push(clear)
  }
  runtime.inject(['systemPrompt'], child => {
    if (!isActive) return
    const service = (child as { systemPrompt?: RuntimePromptService }).systemPrompt
    if (typeof service?.context !== 'function') return
    const dispose = service.context({
      name: 'dsh-code-worker:auto-routing',
      order: 1301,
      interpolate: false,
      text(context) {
        if (!isActive || !settings().enabled || !settings().autoRoutingEnabled || !context.agent) return ''
        const route = routed.get(context.agent)
        if (!route) return ''
        const skill = byName.get(route)
        if (!skill) return ''
        return [
          '# Code Worker: automatically selected coding workflow',
          'The current user message is a coding request. Follow the user and repository instructions first.',
          'Selected procedure: ' + skill.name + '. Use the host tools and permission gates; do not create another agent runtime.',
          ...skill.instructions.map(line => '- ' + line),
          'Before claiming completion, verify the actual changes and tests. Do not report an unrun check as passed.',
        ].join('\n')
      },
    })
    if (typeof dispose === 'function') disposers.push(dispose)
  })
  return () => {
    isActive = false
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* best effort during host teardown */ }
    }
  }
}

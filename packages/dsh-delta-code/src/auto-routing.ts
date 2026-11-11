import type { Context } from '@deepseek-ai/cordis'
import type { Settings } from './types.js'
import { ALL_CODING_SKILLS } from './skills.js'

export type CodingRoute = 'code-ci-repair' | 'code-root-cause-debugging' | 'code-review-readiness'
  | 'code-writing-plans' | 'code-fast-change' | 'code-feature-delivery'

const CONTINUE = /^(?:(?:\u7ee7\u7eed|\u63a5\u7740)(?:(?:\u63a8\u8fdb|\u63a8\u8350|\u6267\u884c|\u5b8c\u6210|\u5f00\u53d1|\u4fee\u590d|\u505a)(?:\u4efb\u52a1\u94fe|\u4efb\u52a1|\u5de5\u4f5c\u6d41|\u5f00\u53d1|\u4fee\u590d)?|\u4efb\u52a1\u94fe)?|go on|continue|proceed|keep going)(?:\u4e00\u4e0b|\u5427|\u554a)?[\u3002.!\uff01\s]*$/i
const OPT_OUT = /(?:\u4e0d\u8981|\u522b|\u505c\u6b62|\u5173\u95ed|\u7981\u7528)(?:\u4f7f\u7528|\u52a0\u8f7d|\u542f\u7528)?\s*(?:code[\s-]?worker|\u7f16\u7a0b\u6a21\u5f0f|coding\s*mode)|(?:disable|don't use|do not use)\s+(?:code[\s-]?worker|coding\s*mode)/i
const CODE_OBJECT = /(?:\u4ee3\u7801|\u6e90\u7801|\u7f16\u7a0b|\u7a0b\u5e8f|\u811a\u672c|\u4ed3\u5e93|\u9879\u76ee|\u63d2\u4ef6|\u7ec4\u4ef6|\u63a5\u53e3|\u51fd\u6570|\u6a21\u5757|\u4f9d\u8d56|\u5355\u5143\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u90e8\u7f72|\u5de5\u4f5c\u6d41|\u5de5\u5355|PR\b|CI\b|GitHub|TypeScript|JavaScript|Python|Rust|Cargo|Go\b|React|Vue|API\b|bug\b|repo(?:sitory)?\b|code\b|test(?:s|ing)?\b|workflow\b|commit\b|pull request\b|\.tsx?\b|\.jsx?\b|\.py\b|\.rs\b|\.go\b)/i
const CODE_ACTION = /(?:\u4fee\u590d|\u4fee\u6b63|\u4fee\u6539|\u6539\u8fdb|\u6539\u9020|\u5b9e\u73b0|\u5f00\u53d1|\u7f16\u5199|\u5199\u4e00\u4e2a|\u6dfb\u52a0|\u65b0\u589e|\u589e\u52a0|\u5220\u9664|\u91cd\u6784|\u4f18\u5316|\u5347\u7ea7|\u5ba1\u67e5|\u6392\u67e5|\u8c03\u8bd5|\u68c0\u6d4b|\u6d4b\u8bd5|\u68c0\u67e5|\u5408\u5e76|\u63d0\u4ea4|\u8fd0\u884c|\u642d\u5efa|\u96c6\u6210|\u843d\u5730|\u8865\u9f50|\u5b8c\u5584|\u5904\u7406|\u590d\u73b0|\u5b9a\u4f4d|\u8bbe\u8ba1|\u89c4\u5212|\u626b\u63cf|\u5206\u6790|\u8bc4\u4f30|fix\b|implement\b|build\b|code\b|debug\b|refactor\b|review\b|test\b|run\b|add\b|remove\b|update\b|integrate\b|create\b)/i
const CI_FAILURE = /(?:CI\b|PR\b|GitHub|actions?|workflow|\u5de5\u4f5c\u6d41|\u68c0\u67e5|\u6784\u5efa).{0,28}(?:\u7ea2\u53c9|\u5931\u8d25|\u62a5\u9519|\u4e0d\u901a\u8fc7|failed|failure|error|red\b)|(?:\u7ea2\u53c9|\u5931\u8d25|\u62a5\u9519|\u4e0d\u901a\u8fc7|failed|failure).{0,28}(?:CI\b|PR\b|checks?|workflow|\u5de5\u4f5c\u6d41)/i
const DEBUG = /(?:bug|\u9519\u8bef|\u5f02\u5e38|\u62a5\u9519|\u5d29\u6e83|\u5931\u8d25|\u65e0\u6cd5|\u4e0d\u5de5\u4f5c|\u95ea\u9000|\u5931\u6548|\u56de\u5f52|\u4fee\u590d|\u5b9a\u4f4d|\u6392\u67e5|debug|broken|crash|failing|fix)/i
const REVIEW = /(?:\u5ba1\u67e5|\u5ba1\u8ba1|code\s*review|review\b|\u5b89\u5168\u68c0\u67e5|\u68c0\u67e5\s*(?:diff|PR|\u4ee3\u7801))|(?:\u8bc4\u5ba1|\u5206\u6790).{0,12}(?:PR|diff|\u6e90\u7801|\u4ee3\u7801)/i
const PLAN = /(?:\u8bbe\u8ba1\u65b9\u6848|\u67b6\u6784\u8bbe\u8ba1|\u67b6\u6784\u65b9\u6848|\u5b9e\u65bd\u65b9\u6848|\u65bd\u5de5\u65b9\u6848|\u6280\u672f\u65b9\u6848|\u89c4\u5212|\u5236\u5b9a\u8ba1\u5212|design\s+(?:a|the)\s+(?:system|architecture)|write\s+(?:an?\s+)?plan)/i
const SMALL = /(?:\u53ea|\u4ec5|\u5c31|\u7b80\u5355|\u5c0f\u6539|\u5fae\u8c03|\u4e00\u5904|\u5355\u4e2a|\u4e00\u884c|\u6539\u540d|\u91cd\u547d\u540d|\u6587\u6848|typo|small|tiny|single|one.line|rename)/i

/**
 * Route only user-authored coding intent, not arbitrary tool output or quoted text.
 * Short follow-ups inherit the current task route. A general discussion has no route.
 */
export function routeCodingTask(text: string, previous?: CodingRoute): CodingRoute | undefined {
  const trimmed = text.trim()
  // Long logs often precede the actual user instruction. Favor the tail
  // when it contains a coding action, rather than routing on old CI errors.
  const head = trimmed.length > 4096 ? trimmed.slice(0, 2048) : ''
  const tail = trimmed.length > 4096 ? trimmed.slice(-2048) : trimmed
  const finalLine = tail.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) || tail
  const tailIntent = CODE_ACTION.test(finalLine) &&
    (CODE_OBJECT.test(finalLine) || (PLAN.test(finalLine) && CODE_OBJECT.test(head)))
  const input = tailIntent ? finalLine : head ? head + '\n' + tail : tail
  if (!input || OPT_OUT.test(tail)) return undefined
  if (CONTINUE.test(finalLine)) return previous
  if (CI_FAILURE.test(input)) return 'code-ci-repair'
  if (!CODE_OBJECT.test(input) || !CODE_ACTION.test(input)) return undefined
  if (REVIEW.test(input)) return 'code-review-readiness'
  if (DEBUG.test(input)) return 'code-root-cause-debugging'
  if (PLAN.test(input) && !/(?:\u5b9e\u73b0|\u5f00\u53d1|\u843d\u5730|implement|build)/i.test(input)) return 'code-writing-plans'
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
          .map(item => item.text).join('\n')
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
      name: 'dsh-delta-code:auto-routing',
      order: 1301,
      interpolate: false,
      text(context) {
        if (!isActive || !settings().enabled || !settings().autoRoutingEnabled || !context.agent) return ''
        const route = routed.get(context.agent)
        if (!route) return ''
        const skill = byName.get(route)
        if (!skill) return ''
        if (route === 'code-fast-change') {
          return [
            '# Code Worker: minimal fast change',
            'Use native DSH editing and the smallest meaningful native test first. Extra Code Worker tools and code_delivery_gate are optional, not required for a small change.',
            'Report actual changes, checks and any unverified outcome; never claim unrun tests passed.',
          ].join('\n')
        }
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

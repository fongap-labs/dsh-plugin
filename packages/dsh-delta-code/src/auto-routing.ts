import type { Context } from '@deepseek-ai/cordis'
import type { Settings } from './types.js'
import { ALL_CODING_SKILLS } from './skills.js'

import { routeCodingTask } from './core/coding-intent.js'
import type { CodingRoute } from './core/coding-intent.js'
export { routeCodingTask } from './core/coding-intent.js'
export type { CodingRoute } from './core/coding-intent.js'

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
      name: 'dsh-delta-code:auto-routing',
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

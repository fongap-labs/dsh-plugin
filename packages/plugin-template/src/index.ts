/**
 * DeepSeek Harness Host Plugin scaffold.
 * Keep identity and lifecycle at the boundary; place optional features in host/.
 * The scaffold generator rewrites the unique package name when making a plugin.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerTool } from '@fongap-labs/shared'
import { normalizeTemplateConfig, type TemplateConfig } from './host/config.js'
import { createGreetingTool } from './host/greeting.js'
import type {} from '@deepseek-ai/dsh-system-prompt'

export type { TemplateConfig } from './host/config.js'

/** One required identity constant, rewritten by the scaffold generator. */
export const name = '@fongap-labs/plugin-template'
export const inject = ['tools']
// A named fallback is necessary only if the Host cannot provide section order.
const FALLBACK_PROMPT_ORDER = 1300

export function apply(ctx: Context, config?: TemplateConfig): () => void {
  const settings = normalizeTemplateConfig(config)
  const disposers: Array<() => void> = []
  let isDisposed = false
  const own = (disposer: unknown) => {
    if (typeof disposer !== 'function') return
    if (isDisposed) {
      try { disposer() } catch { /* best-effort cleanup */ }
      return
    }
    disposers.push(disposer as () => void)
  }
  const cleanup = () => {
    if (isDisposed) return
    isDisposed = true
    for (let i = disposers.length - 1; i >= 0; i--) {
      try { disposers[i]!() } catch { /* best-effort cleanup */ }
    }
    disposers.length = 0
  }

  if (!settings.enabled || !ctx) return cleanup

  // Derive example tool and prompt identifiers from the package identity.
  // Generated plugins never inherit a duplicate "template_greet" registry key.
  const slug = name.split('/').at(-1) || name
  const toolName = `${slug.replace(/-/g, '_')}_greet`
  const registration = registerTool(ctx, createGreetingTool(toolName, settings.greeting))
  if (registration.registered) own(registration.disposer)
  else if (registration.error) ctx.logger?.warn?.(`${name}: ${registration.error.message}`)

  // An empty prompt is not an instruction to inject template guidance.
  // Prefer the Host-defined prompt order; retain the convention as fallback.
  if (settings.systemPromptText && typeof ctx.inject === 'function') {
    try {
      ctx.inject(['systemPrompt'], (child) => {
        if (isDisposed) return
        try {
          const service = child.systemPrompt
          if (typeof service?.section !== 'function') return
          const hostOrder = service.getSectionOrder?.('TOOL_EDIT')
          const order = settings.promptOrder
            ?? (typeof hostOrder === 'number' && Number.isFinite(hostOrder) ? hostOrder : FALLBACK_PROMPT_ORDER)
          own(service.section({
            name: `${name}:guidance`,
            order,
            text: settings.systemPromptText,
          }))
        } catch (error) {
          ctx.logger?.warn?.(`${name}: prompt registration failed: ${String(error)}`)
        }
      })
    } catch (error) {
      ctx.logger?.warn?.(`${name}: optional systemPrompt injection unavailable: ${String(error)}`)
    }
  }

  return cleanup
}

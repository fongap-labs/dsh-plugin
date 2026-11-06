/**
 * Delta Suite Host entry. Keep the public Cordis contract stable while the
 * configuration, HTTP routes and provider clients live in host/ modules.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerRoutes } from './host/routes.js'
import { registerStandalonePoc } from './host/standalone-poc.js'
import { makeWebSearchProvider } from './host/search.js'
import { registerMemoryTools } from './host/memory-tools.js'
import { registerGatewayReliability } from './host/gateway-reliability.js'
import type { GatewayReliabilityConfig } from './host/gateway-reliability.js'

export const name = '@fongap-labs/dsh-suite-delta'
export const inject = ['webServer']

export interface Config {
  gatewayReliability?: GatewayReliabilityConfig
  /** Developer-only, explicit opt-in. Never on by default or in releases. */
  standalonePoc?: boolean
}

export function apply(ctx: Context, config: Config = {}): void {
  registerGatewayReliability(ctx, config.gatewayReliability)
  registerRoutes(ctx)
  if (config.standalonePoc === true) registerStandalonePoc(ctx)
  registerMemoryTools(ctx)
  // The official DeepSeek extension enables Session Log contribution by default.
  // Exclude every request before the host reads log records. This is a second
  // defense; users must still persist enabled: false in the Host profile so
  // disabling or uninstalling Delta UI cannot re-enable uploads.
  // A partial/mock Host may not provide Cordis injection. Keep routing usable
  // and register the privacy rule once the optional service becomes available.
  const optionalHost = ctx as unknown as {
    inject?: (dependencies: string[], callback: (child: unknown) => void) => unknown
  } | null
  // Register a keyless source at the same Host seam as native web_search.
  // The bundle patch selects this id; profile overrides can still select paid providers.
  optionalHost?.inject?.(['web'], (child) => {
    const web = (child as { web?: {
      registerSearchProvider: (provider: ReturnType<typeof makeWebSearchProvider>) => unknown
    } }).web
    web?.registerSearchProvider(makeWebSearchProvider())
  })
  // Follow the explicit Harness UI language preference for model replies.
  // The Host owns locale.preference; reading it at assembly time makes language
  // changes effective on the next model step without injecting chat messages.
  // An absent preference leaves the normal model behavior unchanged.
  optionalHost?.inject?.(['systemPrompt', 'settings'], (child) => {
    const host = child as {
      effect?: (callback: () => unknown, label?: string) => unknown
      systemPrompt?: { section: (value: { name: string; order: number; text: () => string }) => unknown }
      settings?: { describe: (options?: { redactSecrets?: boolean }) => Array<{
        ns: string
        value?: { preference?: unknown }
      }> }
    }
    if (!host.systemPrompt || !host.settings || !host.effect) return
    host.effect(() => host.systemPrompt!.section({
      name: 'delta:reply-language',
      order: 10150,
      text: () => {
        try {
          const locale = host.settings!.describe({ redactSecrets: true })
            .find((item) => item.ns === 'locale')?.value?.preference
          if (typeof locale !== 'string') return ''
          if (/^zh(?:-|$)/i.test(locale)) {
            return 'Reply in Simplified Chinese by default. Preserve code, names, citations, and explicitly requested output languages.'
          }
          if (/^en(?:-|$)/i.test(locale)) {
            return 'Reply in English by default. Preserve code, names, citations, and explicitly requested output languages.'
          }
        } catch {
          // The preference can be unavailable while the Host settings load.
        }
        return ''
      },
    }), 'dsh-suite-delta: reply language follows Host locale')
  })
  optionalHost?.inject?.(['sessionLogDeepSeek'], (child) => {
    const service = (child as { sessionLogDeepSeek?: {
      registerExclusion: (exclude: () => boolean) => unknown
    } }).sessionLogDeepSeek
    service?.registerExclusion(() => true)
  })
}

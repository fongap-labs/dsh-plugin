/**
 * Delta UI Host entry. Keep the public Cordis contract stable while the
 * configuration, HTTP routes and provider clients live in host/ modules.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerRoutes } from './host/routes.js'
import { makeDuckDuckGoProvider } from './host/duckduckgo.js'

export const name = '@fongap-labs/dsh-ui-delta'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  registerRoutes(ctx)
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
      registerSearchProvider: (provider: ReturnType<typeof makeDuckDuckGoProvider>) => unknown
    } }).web
    web?.registerSearchProvider(makeDuckDuckGoProvider())
  })
  optionalHost?.inject?.(['sessionLogDeepSeek'], (child) => {
    const service = (child as { sessionLogDeepSeek?: {
      registerExclusion: (exclude: () => boolean) => unknown
    } }).sessionLogDeepSeek
    service?.registerExclusion(() => true)
  })
}

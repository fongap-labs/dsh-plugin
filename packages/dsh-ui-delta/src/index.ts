/**
 * Delta UI Host entry. Keep the public Cordis contract stable while the
 * configuration, HTTP routes and provider clients live in host/ modules.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerRoutes } from './host/routes.js'

export const name = '@fongap-labs/dsh-ui-delta'
export const inject = ['webServer']

export function apply(ctx: Context): void {
  registerRoutes(ctx)
  // The official DeepSeek extension enables Session Log contribution by default.
  // Exclude every request before the host reads log records. This is a second
  // defense; users must still persist enabled: false in the Host profile so
  // disabling or uninstalling Delta UI cannot re-enable uploads.
  ctx.inject(['sessionLogDeepSeek'], (child) => {
    const service = (child as unknown as { sessionLogDeepSeek?: {
      registerExclusion: (exclude: () => boolean) => unknown
    } }).sessionLogDeepSeek
    service?.registerExclusion(() => true)
  })
}

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
}

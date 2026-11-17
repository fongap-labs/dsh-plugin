/** Delta Code plugin entry. All business features are composed by the kernel. */
import type { Context } from '@deepseek-ai/cordis'
import type { CodeWorkerConfig } from './types.js'
import { normalizeConfig } from './runtime.js'
import { mountDeltaCode } from './delta-code-composition.js'

export { Config } from './config.js'
export type { CodeWorkerConfig, GitHubAccountConfig, LspServerConfig } from './types.js'

export const name = '@fongap-labs/dsh-delta-code'
// Keep the existing Host injection contract until independent service
// lifecycle tests cover the alternative module-scoped subprocess injection.
export const inject = ['tools', 'subprocess']

export function apply(ctx: Context, config?: CodeWorkerConfig): () => void {
  let release = mountDeltaCode(ctx, normalizeConfig(config))
  let closed = false
  const runtime = ctx as unknown as {
    on?: (event: string, listener: () => void) => void | (() => void)
  }
  const stopUpdates = runtime.on?.('loader/volatile-update', () => {
    if (closed) return
    // Validate the replacement before releasing the currently mounted generation.
    const settings = normalizeConfig(config)
    release()
    release = mountDeltaCode(ctx, settings)
  })
  return () => {
    if (closed) return
    closed = true
    if (typeof stopUpdates === 'function') stopUpdates()
    release()
  }
}

/** Delta Code plugin entry. All business features are composed by the kernel. */
import type { Context } from '@deepseek-ai/cordis'
import type { CodeWorkerConfig } from './types.js'
import { normalizeConfig } from './runtime.js'
import { mountDeltaCode } from './delta-code-composition.js'

export { Config } from './config.js'
export type { CodeWorkerConfig, GitHubAccountConfig, LspServerConfig } from './types.js'

export const name = '@fongap-labs/dsh-delta-code'
// Non-command features only require the native tool registry.
// Command-backed features inject subprocess separately and degrade independently.
export const inject = ['tools']

export function apply(ctx: Context, config?: CodeWorkerConfig): () => void {
  let release = mountDeltaCode(ctx, normalizeConfig(config))
  let isClosed = false
  const runtime = ctx as unknown as {
    on?: (event: string, listener: () => void) => void | (() => void)
  }
  const stopUpdates = runtime.on?.('loader/volatile-update', () => {
    if (isClosed) return
    // Validate the replacement before releasing the currently mounted generation.
    const settings = normalizeConfig(config)
    release()
    release = mountDeltaCode(ctx, settings)
  })
  return () => {
    if (isClosed) return
    isClosed = true
    if (typeof stopUpdates === 'function') stopUpdates()
    release()
  }
}

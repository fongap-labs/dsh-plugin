import type { Context } from '@deepseek-ai/cordis'
import type { ExecutionStats } from '../../../delta-code-support/execution-stats.js'

type NativeRuntime = {
  on?: (event: string, callback: (execution: unknown, outcome: unknown) => void) => (() => void) | void
}

/**
 * Optional, disposable Host result observer. It sees no native arguments,
 * cannot infer duplicate calls, and does not alter tool execution.
 */
export function registerNativeToolStats(ctx: Context, stats: ExecutionStats): () => void {
  const runtime = ctx as unknown as NativeRuntime
  if (typeof runtime.on !== 'function') return () => {}
  let active = true
  const unbind = runtime.on('tools/result', (execution, outcome) => {
    if (!active) return
    try { stats.observeNativeResult(execution, outcome) } catch {
      // Never break a native tool call or modify its outcome for telemetry.
    }
  })
  return () => {
    active = false
    if (typeof unbind === 'function') unbind()
  }
}

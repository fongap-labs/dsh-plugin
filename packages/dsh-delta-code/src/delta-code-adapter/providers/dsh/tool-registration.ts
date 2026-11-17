import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { registerTool } from '@fongap-labs/shared'
import type { DeltaCodeRegistrar } from '../../../delta-code-kernel/feature.js'
import type { ExecutionStats } from '../../../delta-code-support/execution-stats.js'

/** Only the DSH provider knows how to attach tools to the Host. */
export function dshToolRegistrar(
  ctx: Context, stats: ExecutionStats,
): DeltaCodeRegistrar<ToolDefinition> {
  return {
    register(definition) {
      const tool = stats.wrap(definition)
      const result = registerTool(ctx, tool)
      if (result.registered && typeof result.disposer === 'function') return result.disposer
      if (result.error) ctx.logger?.warn?.('dsh-delta-code: tool "' + tool.name +
        '" was not registered: ' + result.error.message)
    },
  }
}

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createMultiEditTool } from './multi-edit.js'
import { createProjectProfileTool } from './profile.js'
import { createHostProbeTool } from './host-probe.js'
import { createLspProbeTool } from './lsp.js'

export function deltaCodeCoding(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-coding',
    tools: [createMultiEditTool(ctx, settings), createProjectProfileTool(ctx, settings),
      createHostProbeTool(ctx), createLspProbeTool(ctx, settings)],
  }
}

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createMultiEditTool } from './multi-edit.js'
import { createProjectProfileTool } from './profile.js'
import { createHostProbeTool } from './host-probe.js'
import { createLspProbeTool } from './lsp.js'

/** Editing and Host inspection work without a mounted subprocess. */
export function deltaCodeCodingWithoutCommands(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-coding-core',
    tools: [createMultiEditTool(ctx, settings), createProjectProfileTool(ctx, settings), createHostProbeTool(ctx)],
  }
}

/** LSP command probes require the Host subprocess capability. */
export function deltaCodeCodingCommands(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return { id: 'delta-code-coding-commands', tools: [createLspProbeTool(ctx, settings)] }
}

/** Compatibility factory for the original complete Coding feature. */
export function deltaCodeCoding(ctx: Context, settings: Settings): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-coding',
    tools: [
      ...(deltaCodeCodingWithoutCommands(ctx, settings).tools ?? []),
      ...(deltaCodeCodingCommands(ctx, settings).tools ?? []),
    ],
  }
}

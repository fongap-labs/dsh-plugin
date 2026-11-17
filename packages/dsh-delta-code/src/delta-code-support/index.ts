import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { ExecutionStats, createExecutionStatsTool } from './execution-stats.js'
import { InternalAbExperiment, createInternalAbReportTool } from './ab-metrics.js'

export function deltaCodeSupport(stats: ExecutionStats, experiment: InternalAbExperiment): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-support',
    tools: [createExecutionStatsTool(stats), createInternalAbReportTool(experiment)],
  }
}

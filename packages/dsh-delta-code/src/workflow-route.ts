import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'

import { decideCodingWorkflow } from './core/workflow-policy.js'
import type { RouteInput } from './core/workflow-policy.js'
export { decideCodingWorkflow } from './core/workflow-policy.js'
export type { CodingTaskKind, CodingScope, CodingRisk, RouteInput, RouteResult } from './core/workflow-policy.js'

export function createWorkflowRouteTool(): ToolDefinition {
  return defineTool({
    name: 'code_workflow_route',
    description: 'Choose a compact, deterministic coding lifecycle from existing Code Worker Skills. Read-only; does not dispatch agents, run commands or change files. For substantial tasks only: tiny changes can load code-fast-change directly.',
    parameters: {
      taskKind: { type: 'string', required: true, enum: ['feature', 'bugfix', 'refactor', 'review', 'ci', 'research'] },
      scope: { type: 'string', required: true, enum: ['small', 'medium', 'large'] },
      risk: { type: 'string', required: true, enum: ['low', 'medium', 'high'] },
      independentTasks: { type: 'integer', description: 'Number of independently reviewable work items, 1..100; default 1.' },
      nativeSubagents: { type: 'boolean', description: 'True only after confirming DSH native subagent dispatch is available and permitted.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      mode: { type: 'string', required: true },
      skills: { type: 'array', required: true, items: { type: 'string' } },
      parallelCandidate: { type: 'boolean', required: true },
      verification: { type: 'array', required: true, items: { type: 'string' } },
      stopConditions: { type: 'array', required: true, items: { type: 'string' } },
    } }, render(_args, value) {
      return [{ type: 'text', text: [
        'Coding route: ' + value.mode,
        'Load in order (only when relevant): ' + value.skills.join(' -> '),
        'Parallel candidate: ' + (value.parallelCandidate ? 'yes (only for disjoint write sets)' : 'no'),
        ...value.verification.map(line => 'Verify: ' + line),
        ...value.stopConditions.map(line => 'Stop: ' + line),
      ].join('\n') }]
    } },
    execute: async (args) => decideCodingWorkflow(args as RouteInput),
  })
}

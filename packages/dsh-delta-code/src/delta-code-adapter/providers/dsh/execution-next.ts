import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import type { NativeResumeReader } from '../../../delta-code-quality/resume-policy.js'
import { decideExecutionTransition } from '../../../delta-code-quality/execution-convergence.js'
import type { ExecutionStats } from '../../../delta-code-support/execution-stats.js'

/**
 * A read-only convergence advisory, never a second agent scheduler. The source
 * of task progress is DSH native sessionProjections, not model arguments.
 */
export function createExecutionNextTool(resume: NativeResumeReader, stats: ExecutionStats): ToolDefinition {
  return defineTool({
    name: 'code_execution_next',
    description: 'Suggest the next safe coding action using actual native Todo projection and session-scoped observed Delta verification/error events. Does not replay writes, run commands, certify delivery, or bypass Host gates.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      transition: { type: 'string', required: true },
      nextAction: { type: 'string', required: true },
      remaining: { type: 'array', required: true, items: { type: 'string' } },
      observation: { type: 'string', required: true },
      deliveryConfirmed: { type: 'boolean', required: true },
    } }, render(_args, result) {
      return [{ type: 'text', text: [
        'Execution transition: ' + result.transition,
        'Observed signal: ' + result.observation,
        'Next: ' + result.nextAction,
        ...result.remaining.slice(0, 8).map(item => 'Pending: ' + item),
        'Advisory only; never an independent test result, Host authorization or delivery certificate.',
      ].join('\n') }]
    } },
    async execute(_args, exec) {
      let state
      try { state = resume.read(exec.agent) } catch {
        // A corrupt or missing Host projection must fail closed.
        state = undefined
      }
      return decideExecutionTransition(state, stats.readLastObservation(exec.agent))
    },
  })
}

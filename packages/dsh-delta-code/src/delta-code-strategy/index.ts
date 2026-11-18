import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createWorkflowRouteTool } from './workflow-route.js'
import type { CodingWorkflowRule } from './workflow-policy.js'

export interface DeltaCodeStrategyBindings {
  /** Optional trusted policy injection, never hydrated from model/tool content. */
  workflowRules?: readonly CodingWorkflowRule[]
  registerSkills(): () => void
  registerRouter(): () => void
  registerPrompt(): () => void
}

export function deltaCodeStrategy(
  bindings: DeltaCodeStrategyBindings,
): DeltaCodeFeature<ReturnType<typeof createWorkflowRouteTool>> {
  return {
    id: 'delta-code-strategy',
    tools: [createWorkflowRouteTool(bindings.workflowRules)],
    activate() {
      const releases: Array<() => void> = []
      try {
        releases.push(bindings.registerSkills())
        releases.push(bindings.registerRouter())
        releases.push(bindings.registerPrompt())
      } catch (error) {
        for (const release of releases.reverse()) release()
        throw error
      }
      return () => { for (const release of releases.reverse()) release() }
    },
  }
}

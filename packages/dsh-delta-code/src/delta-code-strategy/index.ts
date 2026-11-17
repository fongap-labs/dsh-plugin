import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import { createWorkflowRouteTool } from './workflow-route.js'
import { registerCodingSkills } from './skills.js'
import { registerDeltaCodePrompt } from './prompt.js'

export function deltaCodeStrategy(
  ctx: Context, settings: Settings, registerRouter: () => () => void,
): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-strategy',
    tools: [createWorkflowRouteTool()],
    activate() {
      const releases: Array<() => void> = []
      try {
        releases.push(registerCodingSkills(ctx))
        releases.push(registerRouter())
        releases.push(registerDeltaCodePrompt(ctx, settings))
      } catch (error) {
        for (const release of releases.reverse()) release()
        throw error
      }
      return () => { for (const release of releases.reverse()) release() }
    },
  }
}

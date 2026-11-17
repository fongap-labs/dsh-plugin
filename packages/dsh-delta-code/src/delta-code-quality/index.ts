import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import type { DeltaCodeFeature } from '../delta-code-kernel/feature.js'
import type { NativeResumeReader } from './resume.js'
import { createVerifyTool } from './verify.js'
import { createVerifySuiteTool } from './verify-suite.js'
import { createDeliveryGateTool } from './delivery-gate.js'
import { createNativeResumeTool } from './resume.js'

export function deltaCodeQuality(
  ctx: Context, settings: Settings, nativeResume: NativeResumeReader,
): DeltaCodeFeature<ToolDefinition> {
  return {
    id: 'delta-code-quality',
    tools: [createVerifyTool(ctx, settings), createVerifySuiteTool(ctx, settings),
      createDeliveryGateTool(ctx, settings, nativeResume),
      createNativeResumeTool(ctx, settings, nativeResume)],
  }
}

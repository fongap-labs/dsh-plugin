import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from '../types.js'
import { mountDeltaCodeFeatures } from './feature.js'
import { dshToolRegistrar } from '../delta-code-adapter/providers/dsh/tool-registration.js'
import { registerGatewayRetryCoordinator } from '../delta-code-adapter/providers/dsh/gateway-retry-coordination.js'
import { deltaCodeCoding } from '../delta-code-coding/index.js'
import { deltaCodeStrategy } from '../delta-code-strategy/index.js'
import { deltaCodeQuality } from '../delta-code-quality/index.js'
import { registerNativeResume } from '../delta-code-quality/resume.js'
import { deltaCodeRepository } from '../delta-code-repository/index.js'
import { deltaCodeSupport } from '../delta-code-support/index.js'
import { InternalAbExperiment } from '../delta-code-support/ab-metrics.js'
import { ExecutionStats } from '../delta-code-support/execution-stats.js'

/** Only this composition root knows both Host adapters and feature implementations. */
export function mountDeltaCode(ctx: Context, settings: Settings): () => void {
  if (!settings.enabled) return () => {}
  const resume = registerNativeResume(ctx)
  const stats = new ExecutionStats()
  const experiment = new InternalAbExperiment()
  const releases: Array<() => void> = [
    () => resume.dispose(), () => stats.clear(), () => experiment.clear(),
  ]
  try {
    const runtime = ctx as unknown as {
      on?: (event: string, listener: (session: unknown, event: unknown) => void) => (() => void) | void
    }
    if (typeof runtime.on === 'function') {
      const stop = runtime.on('session/event', (session, event) =>
        experiment.observe(session, event as { type?: unknown; seq?: unknown; data?: unknown }))
      if (typeof stop === 'function') releases.push(stop)
    }
    const features = [
      deltaCodeCoding(ctx, settings),
      deltaCodeStrategy(ctx, settings, experiment),
      deltaCodeQuality(ctx, settings, resume),
      deltaCodeRepository(ctx, settings),
      deltaCodeSupport(stats, experiment),
    ] satisfies Array<import('./feature.js').DeltaCodeFeature<ToolDefinition>>
    releases.push(mountDeltaCodeFeatures(features, dshToolRegistrar(ctx, stats)))
    releases.push(registerGatewayRetryCoordinator(ctx, () => settings.enabled))
  } catch (error) {
    for (const release of releases.reverse()) { try { release() } catch {} }
    throw error
  }
  let active = true
  return () => {
    if (!active) return
    active = false
    for (const release of releases.reverse()) { try { release() } catch {} }
  }
}

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { Settings } from './types.js'
import { mountDeltaCodeFeatures } from './delta-code-kernel/feature.js'
import { dshToolRegistrar } from './delta-code-adapter/providers/dsh/tool-registration.js'
import { createGitHubTransport } from './delta-code-adapter/providers/github/api.js'
import { registerGatewayRetryCoordinator } from './delta-code-adapter/providers/dsh/gateway-retry-coordination.js'
import { deltaCodeCodingWithoutCommands, deltaCodeCodingCommands } from './delta-code-coding/index.js'
import { deltaCodeStrategy } from './delta-code-strategy/index.js'
import { deltaCodeQuality } from './delta-code-quality/index.js'
import { registerNativeResume } from './delta-code-quality/resume.js'
import { deltaCodeRepositoryRemote, deltaCodeRepositoryCommands } from './delta-code-repository/index.js'
import { deltaCodeSupport } from './delta-code-support/index.js'
import { InternalAbExperiment } from './delta-code-support/ab-metrics.js'
import { ExecutionStats } from './delta-code-support/execution-stats.js'

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
    // The lightweight strategy and diagnostic tools never need subprocess.
    const coreFeatures = [
      deltaCodeStrategy(ctx, settings, experiment),
      deltaCodeCodingWithoutCommands(ctx, settings),
      deltaCodeRepositoryRemote(ctx, settings, createGitHubTransport(settings.githubAccounts)),
      deltaCodeSupport(stats, experiment),
    ] satisfies Array<import('./delta-code-kernel/feature.js').DeltaCodeFeature<ToolDefinition>>
    releases.push(mountDeltaCodeFeatures(coreFeatures, dshToolRegistrar(ctx, stats)))

    // Cordis independently mounts/unmounts this group when subprocess becomes
    // available or changes. The child Context owns subprocess access; the
    // parent Context retains the already-injected tool registration service.
    let isCommandActive = true
    const commandDisposers = new Set<() => void>()
    const injected = ctx.inject(['subprocess'], child => {
      if (!isCommandActive) return
      const commandFeatures = [
        deltaCodeCodingCommands(child, settings),
        deltaCodeQuality(child, settings, resume),
        deltaCodeRepositoryCommands(child, settings),
      ] satisfies Array<import('./delta-code-kernel/feature.js').DeltaCodeFeature<ToolDefinition>>
      const unmount = mountDeltaCodeFeatures(commandFeatures, dshToolRegistrar(ctx, stats))
      commandDisposers.add(unmount)
      return () => {
        commandDisposers.delete(unmount)
        unmount()
      }
    })
    releases.push(() => {
      isCommandActive = false
      for (const unmount of commandDisposers) unmount()
      commandDisposers.clear()
      const stop = (injected as { dispose?: () => Promise<void> } | null)?.dispose
      if (typeof stop === 'function') void Promise.resolve(stop.call(injected)).catch(() => {
        ctx.logger?.warn?.('dsh-delta-code: subprocess injector disposal failed')
      })
    })
    releases.push(registerGatewayRetryCoordinator(ctx, () => settings.enabled))
  } catch (error) {
    for (const release of releases.reverse()) { try { release() } catch {} }
    throw error
  }
  let isActive = true
  return () => {
    if (!isActive) return
    isActive = false
    for (const release of releases.reverse()) { try { release() } catch {} }
  }
}

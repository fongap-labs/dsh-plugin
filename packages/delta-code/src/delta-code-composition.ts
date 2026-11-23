import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Settings } from './types.js'
import { mountDeltaCodeFeatures } from './delta-code-kernel/feature.js'
import { dshToolRegistrar } from './delta-code-adapter/providers/dsh/tool-registration.js'
import {
  createDshCodingCoreTools, createDshCodingCommandTools, createDshQualityTools,
  createDshRepositoryRemoteTools, createDshRepositoryCommandTools,
} from './delta-code-adapter/providers/dsh/feature-tools.js'
import { createGitHubTransport } from './delta-code-adapter/providers/github/api.js'
import { registerGatewayRetryCoordinator } from './delta-code-adapter/providers/dsh/gateway-retry-coordination.js'
import { deltaCodeCodingWithoutCommands, deltaCodeCodingCommands } from './delta-code-coding/index.js'
import { deltaCodeStrategy } from './delta-code-strategy/index.js'
import { registerAutomaticCodingRouter } from './delta-code-adapter/providers/dsh/auto-routing.js'
import { registerCodingSkills } from './delta-code-adapter/providers/dsh/skills.js'
import { registerApprovedGitHubSkills } from './delta-code-adapter/providers/dsh/github-skills.js'
import { registerDeltaCodePrompt } from './delta-code-adapter/providers/dsh/prompt.js'
import { deltaCodeQuality } from './delta-code-quality/index.js'
import { registerNativeResume } from './delta-code-quality/resume.js'
import { observeNativeDelegation } from './delta-code-adapter/providers/dsh/native-delegation.js'
import { deltaCodeRepositoryRemote, deltaCodeRepositoryCommands } from './delta-code-repository/index.js'
import { deltaCodeSupport } from './delta-code-support/index.js'
import { ExecutionStats } from './delta-code-support/execution-stats.js'
import { UserTaskContext } from './delta-code-strategy/intent-contract.js'
import { createExecutionNextTool } from './delta-code-adapter/providers/dsh/execution-next.js'
import { registerNativeToolStats } from './delta-code-adapter/providers/dsh/native-tool-stats.js'
import { registerNativeCompactionMarker } from './delta-code-adapter/providers/dsh/compaction-marker.js'
import { registerNativeSessionRepositories } from './delta-code-adapter/providers/dsh/session-repository-projection.js'
import { createSessionRepositoryCommand } from './delta-code-adapter/providers/dsh/session-repositories.js'

/** Only this composition root knows both Host adapters and feature implementations. */
export function mountDeltaCode(ctx: Context, settings: Settings): () => void {
  if (!settings.enabled) return () => {}
  const resume = registerNativeResume(ctx)
  const compaction = registerNativeCompactionMarker(ctx)
  const sessionRepositories = registerNativeSessionRepositories(ctx)
  const delegation = observeNativeDelegation(ctx)
  const stats = new ExecutionStats()
  const taskContext = new UserTaskContext()
  const releases: Array<() => void> = [
    () => resume.dispose(), () => compaction.dispose(), () => sessionRepositories.dispose(),
    () => delegation.dispose(), () => stats.clear(),
    () => taskContext.clear(),
  ]
  try {
    // The lightweight strategy and diagnostic tools never need subprocess.
    const coreFeatures = [
      deltaCodeStrategy({
        canDelegate: delegation.canDelegate,
        taskContext,
        registerSkills: () => {
          const releaseLocal = registerCodingSkills(ctx)
          try {
            const releaseApproved = registerApprovedGitHubSkills(ctx)
            return () => { releaseApproved(); releaseLocal() }
          } catch (error) {
            releaseLocal()
            throw error
          }
        },
        registerRouter: () => registerAutomaticCodingRouter(ctx, () => settings, undefined, resume, taskContext, stats),
        registerPrompt: () => registerDeltaCodePrompt(ctx, settings),
      }),
      deltaCodeCodingWithoutCommands(createDshCodingCoreTools(ctx, settings, sessionRepositories)),
      deltaCodeRepositoryRemote(createDshRepositoryRemoteTools(
        ctx, settings, createGitHubTransport(settings.githubAccounts, ctx))),
      deltaCodeQuality([createExecutionNextTool(resume, stats, compaction, taskContext)]),
      deltaCodeSupport(stats),
    ] satisfies Array<import('./delta-code-kernel/feature.js').DeltaCodeFeature<ToolDefinition>>
    releases.push(mountDeltaCodeFeatures(coreFeatures, dshToolRegistrar(ctx, stats)))
    releases.push(registerNativeToolStats(ctx, stats))

    // Keep the tool names registered after the first authorized Host mount.
    // Native agents can hold tool snapshots across a transient subprocess service
    // remount. Removing and re-registering them causes UNKNOWN_TOOL even though
    // the tool was advertised at the beginning of the model step.
    let isCommandActive = true
    let commandUnmount: (() => void) | undefined
    type CommandBinding = { tool: ToolDefinition; controller: AbortController }
    const commandTargets = new Map<string, CommandBinding>()
    const injected = ctx.inject(['subprocess'], child => {
      if (!isCommandActive) return
      const commandFeatures = [
        deltaCodeCodingCommands(createDshCodingCommandTools(child, settings, sessionRepositories)),
        deltaCodeQuality(createDshQualityTools(child, settings, resume, sessionRepositories)),
        deltaCodeRepositoryCommands(createDshRepositoryCommandTools(child, settings, sessionRepositories)),
      ] satisfies Array<import('./delta-code-kernel/feature.js').DeltaCodeFeature<ToolDefinition>>
      const definitions = commandFeatures.flatMap(feature => [...(feature.tools ?? [])])
      const controller = new AbortController()
      const incomingNames = new Set(definitions.map(tool => tool.name))
      if (commandUnmount) {
        // A changing definition graph needs a full plugin reconfiguration,
        // not a partial/ambiguous tool registry patch while a model is running.
        if (incomingNames.size !== commandTargets.size ||
            [...commandTargets.keys()].some(name => !incomingNames.has(name))) {
          ctx.logger?.warn?.('delta-code: subprocess tool surface changed on remount; keeping tools disabled until a full plugin reload')
          return
        }
      } else {
        const proxies = commandFeatures.map(feature => ({
          ...feature,
          tools: feature.tools?.map(tool => ({
            ...tool,
            async execute(args: any, exec: ToolRunContext) {
              const binding = commandTargets.get(tool.name)
              if (!binding || binding.controller.signal.aborted) {
                throw new Error('DSH Host subprocess is unavailable for ' + tool.name + '; reconnect the Host service')
              }
              const signal = AbortSignal.any([exec.signal, binding.controller.signal])
              return binding.tool.execute(args, { ...exec, signal })
            },
          } as ToolDefinition)),
        }))
        commandUnmount = mountDeltaCodeFeatures(proxies, dshToolRegistrar(ctx, stats))
      }
      // The Host is authoritative; never fall back to a previously mounted
      // child Context or local Node process while the service is withdrawn.
      for (const tool of definitions) commandTargets.set(tool.name, { tool, controller })
      return () => {
        controller.abort()
        for (const tool of definitions) {
          if (commandTargets.get(tool.name)?.controller === controller) commandTargets.delete(tool.name)
        }
      }
    })
    releases.push(() => {
      isCommandActive = false
      for (const binding of commandTargets.values()) binding.controller.abort()
      commandTargets.clear()
      commandUnmount?.()
      commandUnmount = undefined
      const stop = (injected as { dispose?: () => Promise<void> } | null)?.dispose
      if (typeof stop === 'function') void Promise.resolve(stop.call(injected)).catch(() => {
        ctx.logger?.warn?.('delta-code: subprocess injector disposal failed')
      })
    })
    let isRepositoryCommandActive = true
    const repositoryCommandInjection = ctx.inject(['commands', 'subprocess'], child => {
      if (!isRepositoryCommandActive) return
      const service = (child as unknown as {
        commands?: { register(definition: ReturnType<typeof createSessionRepositoryCommand>): () => void }
      }).commands
      if (typeof service?.register !== 'function') return
      return service.register(createSessionRepositoryCommand(child, settings, sessionRepositories))
    })
    releases.push(() => {
      isRepositoryCommandActive = false
      const stop = (repositoryCommandInjection as { dispose?: () => Promise<void> } | null)?.dispose
      if (typeof stop === 'function') void Promise.resolve(stop.call(repositoryCommandInjection)).catch(() => {
        ctx.logger?.warn?.('delta-code: session repository command injector disposal failed')
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

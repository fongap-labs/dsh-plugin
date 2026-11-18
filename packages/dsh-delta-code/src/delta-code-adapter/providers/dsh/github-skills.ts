/** DSH-native remote Skill Provider registration. No eager/legacy Skill fallback. */
import type { Context } from '@deepseek-ai/cordis'
import { createApprovedGitHubSkillProvider, type RemoteSkillProvider } from '../github/approved-skills.js'

interface SkillProviderControl {
  readonly signal: AbortSignal
  readonly invalidate: () => void
}
interface SkillHost {
  registerProvider?(create: (control: SkillProviderControl) => RemoteSkillProvider): (() => void) | void
}

export function registerApprovedGitHubSkills(ctx: Context): () => void {
  let isActive = true
  const registrations = new Map<SkillHost, () => void>()
  const unsupported = new WeakSet<SkillHost>()
  ctx.inject(['skills'], child => {
    if (!isActive) return
    const registry = (child as unknown as { skills?: SkillHost }).skills
    if (!registry || registrations.has(registry) || unsupported.has(registry)) return
    if (typeof registry.registerProvider !== 'function') {
      unsupported.add(registry)
      ctx.logger?.warn?.('dsh-delta-code: native Skill provider lifecycle unavailable; approved GitHub Skills disabled')
      return
    }
    let enabled = true
    let control: SkillProviderControl | undefined
    const cancelled = new AbortController()
    let dispose: (() => void) | void
    try {
      dispose = registry.registerProvider(lifecycle => {
        control = lifecycle
        const provider = createApprovedGitHubSkillProvider(fetch, undefined, {
          signal: AbortSignal.any([lifecycle.signal, cancelled.signal]),
        })
        return {
          ...provider,
          async list(options) { return enabled && isActive ? provider.list(options) : [] },
          async get(candidate, options) {
            return enabled && isActive ? provider.get(candidate, options) : undefined
          },
        }
      })
    } catch (error) {
      cancelled.abort()
      ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider unavailable: ' +
        (error instanceof Error ? error.message : String(error)))
      return
    }
    if (typeof dispose !== 'function') {
      enabled = false
      cancelled.abort()
      unsupported.add(registry)
      try { control?.invalidate() } catch { /* missing lifecycle is already disabled */ }
      ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider has no disposer; remote Skills disabled')
      return
    }
    const unregister = dispose
    let released = false
    const release = () => {
      if (released) return
      released = true
      enabled = false
      cancelled.abort()
      registrations.delete(registry)
      try { unregister() } catch {
        ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider disposal failed')
      }
    }
    registrations.set(registry, release)
    return release
  })
  return () => {
    if (!isActive) return
    isActive = false
    for (const release of [...registrations.values()].reverse()) release()
    registrations.clear()
  }
}

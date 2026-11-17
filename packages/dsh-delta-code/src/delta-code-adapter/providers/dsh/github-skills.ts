/** DSH-native Skill Provider registration; no alternative Skill runtime. */
import type { Context } from '@deepseek-ai/cordis'
import { createApprovedGitHubSkillProvider, type RemoteSkillProvider } from '../github/approved-skills.js'

interface SkillHost {
  registerProvider?(create: (control: { signal: AbortSignal; invalidate(): void }) => RemoteSkillProvider): (() => void) | void
}
export function registerApprovedGitHubSkills(ctx: Context): () => void {
  let isActive = true
  const registrations = new Map<SkillHost, () => void>()
  const noDisposerRegistries = new WeakSet<SkillHost>()
  ctx.inject(['skills'], child => {
    if (!isActive) return
    const registry = (child as unknown as { skills?: SkillHost }).skills
    if (typeof registry?.registerProvider !== 'function' || registrations.has(registry) || noDisposerRegistries.has(registry)) return
    let dispose: (() => void) | void
    try {
      dispose = registry.registerProvider(() => createApprovedGitHubSkillProvider())
    } catch (error) {
      ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider unavailable: ' +
        (error instanceof Error ? error.message : String(error)))
      return
    }
    if (typeof dispose !== 'function') {
      noDisposerRegistries.add(registry)
      ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider has no disposer; automatic unregistration is unavailable')
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      registrations.delete(registry)
      try { if (typeof dispose === 'function') dispose() } catch {
        /* Host may already have disposed the provider */
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

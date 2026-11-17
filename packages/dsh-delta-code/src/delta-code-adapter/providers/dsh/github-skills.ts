/** DSH-native Skill Provider registration; no alternative Skill runtime. */
import type { Context } from '@deepseek-ai/cordis'
import { createApprovedGitHubSkillProvider, type RemoteSkillProvider } from '../github/approved-skills.js'

interface SkillHost {
  registerProvider?(create: (control: { signal: AbortSignal; invalidate(): void }) => RemoteSkillProvider): (() => void) | void
}
export function registerApprovedGitHubSkills(ctx: Context): () => void {
  let isActive = true
  const disposers: Array<() => void> = []
  ctx.inject(['skills'], child => {
    if (!isActive) return
    const registry = (child as unknown as { skills?: SkillHost }).skills
    if (typeof registry?.registerProvider !== 'function') return // older Host: native Skills still work
    try {
      const dispose = registry.registerProvider(() => createApprovedGitHubSkillProvider())
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch (error) {
      ctx.logger?.warn?.('dsh-delta-code: approved GitHub Skill provider unavailable: ' +
        (error instanceof Error ? error.message : String(error)))
    }
  })
  return () => {
    isActive = false
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* Host may already have disposed the provider */ }
    }
  }
}

import type { Context } from '@deepseek-ai/cordis'
import { ALL_CODING_SKILLS } from '../../../delta-code-strategy/skills.js'

/** Only the DSH adapter owns the native Skills registry and its lifecycle. */
interface SkillRegistry {
  register(skill: {
    name: string
    description: string
    source: 'runtime'
    content: string
  }): (() => void) | void
}

export function registerCodingSkills(ctx: Context): () => void {
  let isActive = true
  // The same Host Skills service can be injected more than once during reload.
  // A registry can only receive a single complete generation per Delta mount.
  const registrations = new Map<SkillRegistry, () => void>()
  ctx.inject(['skills'], child => {
    if (!isActive) return
    const registry = (child as unknown as { skills?: SkillRegistry }).skills
    if (typeof registry?.register !== 'function' || registrations.has(registry)) return
    const disposers: Array<() => void> = []
    let missingDisposer = false
    try {
      for (const skill of ALL_CODING_SKILLS) {
        const dispose = registry.register({
          name: skill.name,
          description: skill.description,
          source: 'runtime',
          content: '# ' + skill.title + '\n\n' + skill.instructions.map(line => '- ' + line).join('\n'),
        })
        if (typeof dispose === 'function') disposers.push(dispose)
        else missingDisposer = true // older Hosts may not expose registration cleanup
      }
    } catch (error) {
      // An incomplete catalog must never keep its disposable subset published.
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch { /* continue compensating independent registrations */ }
      }
      if (missingDisposer) {
        // These contributions cannot be rolled back; do not register duplicates.
        registrations.set(registry, () => {})
        ctx.logger?.warn?.('dsh-delta-code: partial Skill registration cannot be rolled back on a Host without disposers')
      }
      ctx.logger?.warn?.('dsh-delta-code: Skill catalog registration failed and was rolled back: ' +
        (error instanceof Error ? error.message : String(error)))
      return
    }
    if (missingDisposer) {
      ctx.logger?.warn?.('dsh-delta-code: Host Skill registration has no disposer; automatic unregistration is unavailable')
    }
    let released = false
    const release = () => {
      if (released) return
      released = true
      registrations.delete(registry)
      for (const dispose of disposers.reverse()) {
        try { dispose() } catch { /* Host may have already removed the registration */ }
      }
    }
    registrations.set(registry, release)
    // DSH may dispose an injected child before the parent plugin unmounts.
    return release
  })
  return () => {
    if (!isActive) return
    isActive = false
    for (const release of [...registrations.values()].reverse()) release()
    registrations.clear()
  }
}

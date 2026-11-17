import type { Context } from '@deepseek-ai/cordis'
import { ALL_CODING_SKILLS } from '../../../delta-code-strategy/skills.js'

/** Only the DSH provider knows the native Skills registry lifecycle. */
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
  const disposers: Array<() => void> = []
  ctx.inject(['skills'], (child) => {
    if (!isActive) return
    const registry = (child as unknown as { skills?: SkillRegistry }).skills
    if (typeof registry?.register !== 'function') return
    for (const skill of ALL_CODING_SKILLS) {
      try {
        const dispose = registry.register({
          name: skill.name,
          description: skill.description,
          source: 'runtime',
          content: '# ' + skill.title + '\n\n' + skill.instructions.map(line => '- ' + line).join('\n'),
        })
        if (typeof dispose === 'function') disposers.push(dispose)
      } catch (error) {
        ctx.logger?.warn?.('dsh-delta-code: skill registration failed for ' + skill.name +
          ': ' + (error instanceof Error ? error.message : String(error)))
      }
    }
  })
  return () => {
    isActive = false
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* best-effort unmount */ }
    }
  }
}

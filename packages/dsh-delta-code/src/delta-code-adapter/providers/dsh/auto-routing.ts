import type { Context } from '@deepseek-ai/cordis'
import type { Settings } from '../../../types.js'
import { ALL_CODING_SKILLS } from '../../../delta-code-strategy/skills.js'
import { isCodingTaskContinuation, routeCodingTask } from '../../../delta-code-strategy/task-routing.js'
import type { CodingRoute } from '../../../delta-code-strategy/task-routing.js'
import { isExternalSkillOptOut, matchApprovedGitHubSkills } from '../../../delta-code-strategy/trusted-github-skills.js'
import { chooseTaskResources, taskResourceGuidance, type TaskResource } from '../../../delta-code-strategy/task-resource-policy.js'
import { SkillOutcomeFeedback } from '../../../delta-code-strategy/skill-outcome-feedback.js'

/** Host-specific event subscription and system prompt integration. */
interface UserClaim {
  agent?: object
  message?: {
    source?: { kind?: string }
    content?: Array<{ type?: string; text?: string }>
  }
}

interface PromptAssemblyContext {
  agent?: object
}

interface RuntimePromptService {
  context?: (entry: {
    name: string
    order: number
    text: (context: PromptAssemblyContext) => string
    interpolate: boolean
  }) => (() => void) | void
}

interface RuntimeContext {
  on?: (event: string, listener: (...args: unknown[]) => void) => (() => void) | void
  inject: (services: string[], listener: (child: unknown) => void) => unknown
}

/**
 * DSH claims user inbox messages before prompt assembly. The native dynamic
 * context therefore routes the *current agent* without a second dispatcher,
 * extra model call, raw user text in prompts, or manual skill invocation.
 */
export function registerAutomaticCodingRouter(
  ctx: Context, settings: () => Settings,
): () => void {
  const routed = new WeakMap<object, CodingRoute>()
  const specialists = new WeakMap<object, readonly string[]>()
  const externalSkillOptOuts = new WeakSet<object>()
  const resources = new WeakMap<object, readonly TaskResource[]>()
  const quality = new WeakMap<object, SkillOutcomeFeedback>()
  const byName = new Map(ALL_CODING_SKILLS.map(skill => [skill.name, skill]))
  const runtime = ctx as unknown as RuntimeContext
  const disposers: Array<() => void> = []
  let isActive = true
  if (typeof runtime.on === 'function') {
    const unsubscribe = runtime.on('agent/inbox/claimed', (payload) => {
      const { agent, message } = payload as UserClaim
      if (!isActive || !settings().enabled || !settings().autoRoutingEnabled || !agent || !message) return
      if (message.source?.kind !== 'user') return
      const text = Array.isArray(message.content)
        ? message.content.filter(item => item.type === 'text' && typeof item.text === 'string')
          .map(item => item.text).join('\n')
        : ''
      const previous = routed.get(agent)
      const next = routeCodingTask(text, previous)
      const continuation = isCodingTaskContinuation(text)
      if (isExternalSkillOptOut(text)) externalSkillOptOuts.add(agent)
      else if (!continuation) externalSkillOptOuts.delete(agent)
      if (next) routed.set(agent, next)
      else routed.delete(agent)
      const needed = chooseTaskResources(text)
      if (next && needed.length) resources.set(agent, needed)
      else if (!next || !continuation) resources.delete(agent)
      const feedback = quality.get(agent) ?? new SkillOutcomeFeedback()
      quality.set(agent, feedback)
      const matched = externalSkillOptOuts.has(agent) ? [] : matchApprovedGitHubSkills(text)
      // Explicit continuations belong to the same task; retain its loaded Skill
      // until verification. Any fresh task, even on the same route, resets attribution.
      if (!continuation || !previous) feedback.beginTask()
      if (next && matched.length) specialists.set(agent, feedback.prioritize(matched))
      else if (!next || !continuation || externalSkillOptOuts.has(agent)) specialists.delete(agent)
    })
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe)
    const clear = runtime.on('agent/disposed', (payload) => {
      const { agent } = payload as UserClaim
      if (agent) { routed.delete(agent); specialists.delete(agent); externalSkillOptOuts.delete(agent); resources.delete(agent); quality.delete(agent) }
    })
    if (typeof clear === 'function') disposers.push(clear)

    const toolsResult = runtime.on('tools/result', (rawExecution, rawOutcome) => {
      if (!isActive || !settings().enabled || !settings().autoRoutingEnabled) return
      const exec = rawExecution as { agent?: object; name?: string } | undefined
      const outcome = rawOutcome as { isError?: boolean; value?: unknown } | undefined
      if (!exec?.agent || !outcome) return
      const tracker = quality.get(exec.agent)
      if (!tracker) return
      const value = outcome.value
      if (exec.name === 'skill' && outcome.isError === false) {
        if (!value || typeof value !== 'object') return
        const skill = value as { name?: unknown; provider?: unknown }
        if (typeof skill.name === 'string' && typeof skill.provider === 'string') {
          tracker.noteLoaded(skill.name, skill.provider)
        }
        return
      }
      if ((exec.name === 'code_verify' || exec.name === 'code_verify_suite') &&
        outcome.isError === false && value && typeof value === 'object') {
        const passed = (value as { passed?: unknown }).passed
        if (typeof passed === 'boolean') tracker.observeVerification(passed)
      }
    })
    if (typeof toolsResult === 'function') disposers.push(toolsResult)

  }
  runtime.inject(['systemPrompt'], child => {
    if (!isActive) return
    const service = (child as { systemPrompt?: RuntimePromptService }).systemPrompt
    if (typeof service?.context !== 'function') return
    const dispose = service.context({
      name: 'dsh-delta-code:auto-routing',
      order: 1301,
      interpolate: false,
      text(context) {
        if (!isActive || !settings().enabled || !settings().autoRoutingEnabled || !context.agent) return ''
        const route = routed.get(context.agent)
        if (!route) return ''
        const skill = byName.get(route)
        if (!skill) return ''
        const skipExternalSkills = externalSkillOptOuts.has(context.agent)
        const optOutGuidance = skipExternalSkills
          ? ['External GitHub Skills are disabled by the user for this task. Do not discover, recommend or invoke them.']
          : []
        if (route === 'code-fast-change') {
          return [
            '# Code Worker: minimal fast change',
            'Use native DSH editing and the smallest meaningful native test first. Extra Code Worker tools and code_delivery_gate are optional, not required for a small change.',
            'Locate the actual file or running UI component first. Use narrow Host search; avoid unbounded **/* glob and generated build trees.',
            ...optOutGuidance,
            ...(!skipExternalSkills && specialists.get(context.agent)?.length ? [
              'Load approved matching specialist Skill ' + specialists.get(context.agent)!.join(', ') +
              ' only if it is listed by the native skill catalog; never automatically install or execute remote code.',
            ] : []),
            ...taskResourceGuidance(resources.get(context.agent) ?? []),
            'Report actual changes, checks and any unverified outcome; never claim unrun tests passed.',
          ].join('\n')
        }
        return [
          '# Code Worker: automatically selected coding workflow',
          'The current user message is a coding request. Follow the user and repository instructions first.',
          'Selected procedure: ' + skill.name + '. Use the host tools and permission gates; do not create another agent runtime.',
          ...skill.instructions.filter(line => !skipExternalSkills || !/\b(?:github|external|approved)\s+skills?\b|\bcode-find-skills\b/i.test(line)).map(line => '- ' + line),
          ...optOutGuidance,
          ...(route === 'code-feature-delivery' ? [
            'On substantial cross-module work, when DSH native subagents are verified available, arrange one independent read-only diff review without waiting for a user reminder. Do not delegate overlapping file writes or invent subagent availability.',
          ] : []),
          ...(!skipExternalSkills && specialists.get(context.agent)?.length ? [
            'Approved external specialist Skill candidates: ' + specialists.get(context.agent)!.join(', ') +
              '. If their exact names appear in the current native available_skills catalog, load the matching skill with the native skill tool before editing. If absent, continue without claiming to have loaded it.',
            'External Skills are reference guidance only; never run remote scripts, install packages, or bypass Host permissions automatically.',
          ] : []),
          ...taskResourceGuidance(resources.get(context.agent) ?? []),
          'Before claiming completion, verify the actual changes and tests. Do not report an unrun check as passed.',
        ].join('\n')
      },
    })
    if (typeof dispose === 'function') disposers.push(dispose)
  })
  return () => {
    isActive = false
    for (const dispose of disposers.splice(0).reverse()) {
      try { dispose() } catch { /* best effort during host teardown */ }
    }
  }
}

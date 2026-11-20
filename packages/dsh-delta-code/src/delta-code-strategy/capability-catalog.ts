import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import { ALL_CODING_SKILLS } from './skills.js'

/**
 * Reviewed, host-neutral scenarios. The native Agent decides which scenario
 * matches the task semantically; no keywords, external content or model output
 * may edit this directory or grant execution permission.
 */
export interface CodingCapability {
  readonly id: string
  readonly title: string
  readonly intent: string
  readonly accepts: readonly string[]
  readonly produces: readonly string[]
  /** Optional related capabilities, not implicit tool or Skill invocations. */
  readonly uses: readonly string[]
  readonly skills: readonly string[]
}

export const CODING_CAPABILITIES: readonly CodingCapability[] = [
  {
    id: 'small-change', title: 'Focused change',
    intent: 'Make one bounded change with a clear observable result.',
    accepts: ['User goal', 'Relevant existing implementation'],
    produces: ['Minimal diff', 'Focused verification evidence'],
    uses: [], skills: ['code-fast-change'],
  },
  {
    id: 'feature-delivery', title: 'Feature implementation',
    intent: 'Implement a substantial feature or refactor within existing architecture.',
    accepts: ['User acceptance criteria', 'Project constraints', 'Existing source and tests'],
    produces: ['Implementation', 'Regression evidence', 'PR when authorized'],
    uses: ['quality-review', 'diagnostic-readiness'],
    skills: ['code-feature-delivery'],
  },
  {
    id: 'defect-repair', title: 'Root-cause repair',
    intent: 'Find a reproducible cause and verify a targeted fix.',
    accepts: ['Observed failure', 'Logs or reproduction', 'Relevant source'],
    produces: ['Root cause', 'Minimal fix', 'Regression evidence'],
    uses: ['diagnostic-readiness', 'quality-review'],
    skills: ['code-root-cause-debugging'],
  },
  {
    id: 'ci-repair', title: 'CI failure investigation',
    intent: 'Inspect the actual failing job and restore genuine required checks.',
    accepts: ['Failed commit or PR', 'GitHub Actions job evidence'],
    produces: ['Confirmed cause', 'Reviewed fix', 'Current SHA CI evidence'],
    uses: ['diagnostic-readiness'],
    skills: ['code-ci-repair'],
  },
  {
    id: 'code-review', title: 'Read-only change review',
    intent: 'Assess correctness, safety and gaps without silently modifying code.',
    accepts: ['Diff or PR', 'Intended behavior', 'Available check results'],
    produces: ['Actionable findings', 'Known verification gaps'],
    uses: ['quality-review'], skills: ['code-review-readiness'],
  },
  {
    id: 'quality-review', title: 'Test strength and maintainability',
    intent: 'Evaluate whether checks actually detect relevant behavior regressions.',
    accepts: ['Changed code', 'Existing tests and coverage evidence'],
    produces: ['Missed behavior cases', 'Optional verified mutation/complexity evidence'],
    uses: [], skills: ['code-quality-strength'],
  },
  {
    id: 'diagnostic-readiness', title: 'Future failure diagnosability',
    intent: 'Check whether recurrence could be located using real, safe diagnostic evidence.',
    accepts: ['Failure modes', 'Existing logs or traces', 'Current error handling'],
    produces: ['Specific diagnostic gaps', 'Read-back evidence when changed'],
    uses: [], skills: ['code-diagnostic-readiness'],
  },
  {
    id: 'verified-experience', title: 'Verified experience reuse',
    intent: 'Suggest a reusable lesson only after a real fix and its limits are established.',
    accepts: ['Completed task', 'Source revision', 'Repro and verification evidence'],
    produces: ['Reviewable candidate with provenance', 'No automatic Skill activation'],
    uses: ['quality-review'], skills: ['code-experience-review'],
  },
  {
    id: 'visual-parity', title: 'Visual implementation review',
    intent: 'Compare a rendered interface to an actual reference when Host UI tools exist.',
    accepts: ['Reference', 'Running target UI', 'Matching viewport and state'],
    produces: ['Observed visual differences', 'Real recheck or explicit unverified state'],
    uses: [], skills: ['code-visual-parity'],
  },
]

/** Refuse broken declarations before publishing any capabilities to a model. */
export function validateCodingCapabilities(
  catalog: readonly CodingCapability[] = CODING_CAPABILITIES,
  knownSkills: ReadonlySet<string> = new Set(ALL_CODING_SKILLS.map(skill => skill.name)),
): void {
  const byId = new Map<string, CodingCapability>()
  for (const item of catalog) {
    if (!/^[a-z][a-z0-9-]*$/.test(item.id) || byId.has(item.id)) {
      throw new Error('invalid or duplicate capability id: ' + item.id)
    }
    if (!item.title.trim() || !item.intent.trim() || !item.accepts.length ||
      !item.produces.length || !item.skills.length) {
      throw new Error('incomplete capability: ' + item.id)
    }
    if (new Set(item.skills).size !== item.skills.length ||
      item.skills.some(skill => !knownSkills.has(skill))) {
      throw new Error('unknown or duplicate capability Skill: ' + item.id)
    }
    if (new Set(item.uses).size !== item.uses.length) {
      throw new Error('duplicate capability reference: ' + item.id)
    }
    byId.set(item.id, item)
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('cyclic capability reference: ' + id)
    if (visited.has(id)) return
    const item = byId.get(id)
    if (!item) throw new Error('unknown capability reference: ' + id)
    visiting.add(id)
    for (const dependency of item.uses) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of byId.keys()) visit(id)
}

export type CapabilityQuery =
  | { action: 'list' }
  | { action: 'get'; id: string }
  | { action: 'compose'; ids: readonly string[] }

/**
 * Lists and composes existing guidance only. Related "uses" are suggestions,
 * not implicit loads, dispatches, side effects, or permission elevation.
 */
export function queryCodingCapabilities(
  query: CapabilityQuery,
  catalog: readonly CodingCapability[] = CODING_CAPABILITIES,
): { action: string; capabilities: CodingCapability[]; skills: string[] } {
  validateCodingCapabilities(catalog)
  if (query.action === 'list') {
    return {
      action: 'list', skills: [],
      capabilities: catalog.map(item => ({ ...item, accepts: [], produces: [], uses: [], skills: [] })),
    }
  }
  const ids = query.action === 'get' ? [query.id] : query.ids
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 8 ||
    ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new Error('select 1..8 distinct capability ids')
  }
  const selected = ids.map(id => {
    const found = catalog.find(item => item.id === id)
    if (!found) throw new Error('unknown capability: ' + id)
    return found
  })
  return {
    action: query.action,
    capabilities: selected.map(item => ({
      ...item, accepts: [...item.accepts], produces: [...item.produces],
      uses: [...item.uses], skills: [...item.skills],
    })),
    skills: [...new Set(selected.flatMap(item => item.skills))],
  }
}

export function createCodingCapabilitiesTool(): ToolDefinition {
  validateCodingCapabilities()
  return defineTool({
    name: 'code_capabilities',
    description: 'Read-only reviewed Code Worker capability directory. Let the native Agent choose the task scenario by meaning, not fixed keywords. list shows intents; get inspects one; compose combines selected guidance. Does not load Skills, run tools or grant permission.',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'get', 'compose'] },
      id: { type: 'string', description: 'Capability id for get.' },
      ids: { type: 'array', items: { type: 'string' }, description: '1..8 unique capability ids for compose.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        action: { type: 'string', required: true },
        capabilities: { type: 'array', required: true, items: { type: 'object' } },
        skills: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    execute: async args => {
      const input = args as { action: string; id?: string; ids?: string[] }
      if (input.action === 'list') return queryCodingCapabilities({ action: 'list' })
      if (input.action === 'get') return queryCodingCapabilities({ action: 'get', id: input.id ?? '' })
      if (input.action === 'compose') return queryCodingCapabilities({ action: 'compose', ids: input.ids ?? [] })
      throw new Error('unsupported capability action')
    },
  })
}

/**
 * Host-independent coding workflow decisions.
 * The Host adapter owns tool registration and permissions.
 */
export type CodingTaskKind = 'feature' | 'bugfix' | 'refactor' | 'review' | 'ci' | 'research'
export type CodingScope = 'small' | 'medium' | 'large'
export type CodingRisk = 'low' | 'medium' | 'high'

export interface RouteInput {
  taskKind: CodingTaskKind
  scope: CodingScope
  risk: CodingRisk
  independentTasks?: number
  nativeSubagents?: boolean
}
export interface RouteResult {
  mode: 'fast' | 'diagnose' | 'planned' | 'review' | 'ci-repair' | 'research'
  skills: string[]
  parallelCandidate: boolean
  verification: string[]
  stopConditions: string[]
}

/** Deterministic routing, not a second scheduler or an autonomous background loop. */
export function decideCodingWorkflow(input: RouteInput): RouteResult {
  const independentTasks = input.independentTasks ?? 1
  if (!Number.isSafeInteger(independentTasks) || independentTasks < 1 || independentTasks > 100) {
    throw new Error('independentTasks must be an integer from 1 to 100')
  }
  const canParallelize = independentTasks >= 2 && input.nativeSubagents === true
  const isHighRisk = input.risk === 'high'
  const isLarge = input.scope === 'large'
  const shouldPlan = isHighRisk || isLarge || input.scope === 'medium'
  const stopConditions = [
    'Host permissions or credentials unavailable: stop, do not silently fall back or escalate.',
    'Destructive or irreversible action: require explicit authorization.',
    'Tests fail, required CI is red/pending, or evidence is missing: do not claim verified completion.',
  ]
  const verification = [
    'Inspect changed paths and relevant source/test diffs.',
    'Run focused behavior tests and applicable project checks; report exact commands and exit codes.',
    'For a PR, verify required checks against its current HEAD SHA.',
  ]

  if (input.taskKind === 'ci') return {
    mode: 'ci-repair', skills: ['code-ci-repair', 'code-verification-gate'], parallelCandidate: false,
    verification, stopConditions,
  }
  if (input.taskKind === 'review') return {
    mode: 'review', skills: ['code-review-readiness', 'code-verification-gate'], parallelCandidate: false,
    verification, stopConditions,
  }
  if (input.taskKind === 'research') return {
    mode: 'research', skills: ['code-context-discipline', 'code-brainstorming'], parallelCandidate: false,
    verification: ['Cite the source files and facts supporting each conclusion; distinguish hypotheses.'],
    stopConditions,
  }
  if (input.taskKind === 'bugfix') return {
    mode: 'diagnose',
    skills: [
      'code-root-cause-debugging', 'code-test-driven-development',
      ...(isHighRisk || isLarge ? ['code-request-review'] : []),
      'code-verification-gate', 'code-finish-branch',
    ],
    parallelCandidate: false, verification, stopConditions,
  }
  if (!shouldPlan) return {
    mode: 'fast', skills: ['code-fast-change', 'code-verification-gate'], parallelCandidate: false,
    verification, stopConditions,
  }

  const skills = [
    ...(isHighRisk || isLarge ? ['code-brainstorming'] : []),
    'code-writing-plans',
    ...(canParallelize ? ['code-parallel-work', 'code-subagent-delivery'] : ['code-executing-plans']),
    'code-test-driven-development',
    ...(isHighRisk || isLarge ? ['code-request-review', 'code-review-readiness'] : []),
    'code-verification-gate', 'code-finish-branch',
  ]
  return { mode: 'planned', skills, parallelCandidate: canParallelize, verification, stopConditions }
}

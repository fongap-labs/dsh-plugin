import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'

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
      'code-root-cause-debugging',
      // Diagnose before planning, then execute one verified step at a time.
      // Avoid speculative parallel writes while the root cause is unsettled.
      ...(shouldPlan ? ['code-writing-plans', 'code-executing-plans'] : []),
      'code-test-driven-development',
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

export function createWorkflowRouteTool(): ToolDefinition {
  return defineTool({
    name: 'code_workflow_route',
    description: 'Choose a compact, deterministic coding lifecycle from existing Code Worker Skills. Read-only; does not dispatch agents, run commands or change files. For substantial tasks only: tiny changes can load code-fast-change directly.',
    parameters: {
      taskKind: { type: 'string', required: true, enum: ['feature', 'bugfix', 'refactor', 'review', 'ci', 'research'] },
      scope: { type: 'string', required: true, enum: ['small', 'medium', 'large'] },
      risk: { type: 'string', required: true, enum: ['low', 'medium', 'high'] },
      independentTasks: { type: 'integer', description: 'Number of independently reviewable work items, 1..100; default 1.' },
      nativeSubagents: { type: 'boolean', description: 'True only after confirming DSH native subagent dispatch is available and permitted.' },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      mode: { type: 'string', required: true },
      skills: { type: 'array', required: true, items: { type: 'string' } },
      parallelCandidate: { type: 'boolean', required: true },
      verification: { type: 'array', required: true, items: { type: 'string' } },
      stopConditions: { type: 'array', required: true, items: { type: 'string' } },
    } }, render(_args, value) {
      return [{ type: 'text', text: [
        'Coding route: ' + value.mode,
        'Load in order (only when relevant): ' + value.skills.join(' -> '),
        'Parallel candidate: ' + (value.parallelCandidate ? 'yes (only for disjoint write sets)' : 'no'),
        ...value.verification.map(line => 'Verify: ' + line),
        ...value.stopConditions.map(line => 'Stop: ' + line),
      ].join('\n') }]
    } },
    execute: async (args) => decideCodingWorkflow(args as RouteInput),
  })
}

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
  taskPaths?: string[][]
  taskDependencies?: number[][]
}
export interface RouteResult {
  mode: 'fast' | 'diagnose' | 'planned' | 'review' | 'ci-repair' | 'research'
  skills: string[]
  parallelCandidate: boolean
  executionWaves: number[][]
  verification: string[]
  stopConditions: string[]
}

function safeTaskPath(raw: string): string {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 240 ||
      raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || raw.includes('\\') ||
      raw.includes('*') || raw.includes('?') || raw.includes('[') ||
      raw.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('taskPaths must contain safe, explicit repository-relative paths')
  }
  return raw
}

function overlaps(left: string, right: string): boolean {
  return left === right || left.startsWith(right + '/') || right.startsWith(left + '/')
}

/** Pure dependency-wave planning: never dispatches agents or touches a worktree. */
export function planCodingWaves(
  count: number, paths?: string[][], dependencies?: number[][], parallel = false,
): number[][] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new Error('independentTasks must be an integer from 1 to 100')
  }
  if (paths !== undefined &&
      (!Array.isArray(paths) || paths.length !== count ||
       paths.some(list => !Array.isArray(list) || list.length < 1 || list.length > 32))) {
    throw new Error('taskPaths must provide 1..32 explicit write paths for every task')
  }
  const writeSets = paths?.map(list => {
    const paths = list.map(safeTaskPath)
    if (new Set(paths).size !== paths.length) throw new Error('duplicate task write path')
    return paths
  })
  if (dependencies !== undefined &&
      (!Array.isArray(dependencies) || dependencies.length !== count ||
       dependencies.some(list => !Array.isArray(list) || list.length > count))) {
    throw new Error('taskDependencies must cover every task')
  }
  const prerequisites = Array.from({ length: count }, (_, index) => {
    const items = dependencies?.[index] ?? []
    if (items.some(dependency => !Number.isSafeInteger(dependency) ||
        dependency < 0 || dependency >= index) || new Set(items).size !== items.length) {
      throw new Error('taskDependencies must reference distinct, earlier task indexes')
    }
    return items
  })
  const waves: number[][] = []
  const assigned: number[] = []
  for (let index = 0; index < count; index++) {
    const earliest = prerequisites[index]!.reduce((wave, dependency) =>
      Math.max(wave, assigned[dependency]! + 1), 0)
    let waveIndex = parallel && writeSets ? earliest : Math.max(earliest, waves.length)
    while (waves[waveIndex]?.some(other =>
      writeSets && writeSets[index]!.some(path =>
        writeSets[other]!.some(existing => overlaps(path, existing))))) {
      waveIndex++
    }
    if (!waves[waveIndex]) waves[waveIndex] = []
    waves[waveIndex]!.push(index)
    assigned[index] = waveIndex
  }
  return waves
}

/** Deterministic routing, not a second scheduler or an autonomous background loop. */
export function decideCodingWorkflow(input: RouteInput): RouteResult {
  const independentTasks = input.independentTasks ?? 1
  if (!Number.isSafeInteger(independentTasks) || independentTasks < 1 || independentTasks > 100) {
    throw new Error('independentTasks must be an integer from 1 to 100')
  }
  const isHighRisk = input.risk === 'high'
  const isLarge = input.scope === 'large'
  const shouldPlan = isHighRisk || isLarge || input.scope === 'medium'
  const allowParallel = shouldPlan && independentTasks >= 2 && input.nativeSubagents === true &&
    (input.taskKind === 'feature' || input.taskKind === 'refactor')
  const executionWaves = planCodingWaves(independentTasks,
    input.taskPaths, input.taskDependencies, allowParallel)
  const canParallelize = executionWaves.some(wave => wave.length > 1)
  const stopConditions = [
    'Host permissions or credentials unavailable: stop, do not silently fall back or escalate.',
    'Destructive or irreversible action: require explicit authorization.',
    'Tests fail, required CI is red/pending, or evidence is missing: do not claim verified completion.',
    'Parallel tasks require verified native subagents and disjoint declared write paths.',
  ]
  const verification = [
    'Inspect changed paths and relevant source/test diffs.',
    'Run focused behavior tests and applicable project checks; report exact commands and exit codes.',
    'For a PR, verify required checks against its current HEAD SHA.',
  ]

  if (input.taskKind === 'ci') return {
    mode: 'ci-repair', skills: ['code-ci-repair', 'code-verification-gate'], parallelCandidate: false, executionWaves,
    verification, stopConditions,
  }
  if (input.taskKind === 'review') return {
    mode: 'review', skills: ['code-review-readiness', 'code-verification-gate'], parallelCandidate: false, executionWaves,
    verification, stopConditions,
  }
  if (input.taskKind === 'research') return {
    mode: 'research', skills: ['code-context-discipline', 'code-brainstorming'], parallelCandidate: false, executionWaves,
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
    parallelCandidate: false, executionWaves, verification, stopConditions,
  }
  if (!shouldPlan) return {
    mode: 'fast', skills: ['code-fast-change', 'code-verification-gate'], parallelCandidate: false, executionWaves,
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
  return { mode: 'planned', skills, parallelCandidate: canParallelize, executionWaves, verification, stopConditions }
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
      taskPaths: { type: 'array', description: 'Explicit repository-relative write sets for each task, required for parallel execution.',
        items: { type: 'array', items: { type: 'string' } } },
      taskDependencies: { type: 'array', description: 'Earlier zero-based prerequisite indexes for each task.',
        items: { type: 'array', items: { type: 'integer' } } },
    },
    output: { schema: { type: 'object', additionalProperties: false, properties: {
      mode: { type: 'string', required: true },
      skills: { type: 'array', required: true, items: { type: 'string' } },
      parallelCandidate: { type: 'boolean', required: true },
      executionWaves: { type: 'array', required: true, items: { type: 'array', items: { type: 'integer' } } },
      verification: { type: 'array', required: true, items: { type: 'string' } },
      stopConditions: { type: 'array', required: true, items: { type: 'string' } },
    } }, render(_args, value) {
      return [{ type: 'text', text: [
        'Coding route: ' + value.mode,
        'Load in order (only when relevant): ' + value.skills.join(' -> '),
        'Parallel candidate: ' + (value.parallelCandidate ? 'yes (disjoint write sets)' : 'no'),
        ...value.executionWaves.map((wave, index) => 'Execution wave ' + (index + 1) + ': ' +
          wave.map(task => '#' + task).join(', ')),
        ...value.verification.map(line => 'Verify: ' + line),
        ...value.stopConditions.map(line => 'Stop: ' + line),
      ].join('\n') }]
    } },
    execute: async (args) => decideCodingWorkflow(args as RouteInput),
  })
}

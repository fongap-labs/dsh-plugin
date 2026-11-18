import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import {
  CODING_TASK_KINDS, CODING_SCOPES, CODING_RISKS, DEFAULT_CODING_WORKFLOW_RULES,
  REQUIRED_WORKFLOW_STOP_CONDITIONS, type CodingWorkflowRule,
  type CodingTaskKind, type CodingScope, type CodingRisk, type CodingWorkflowMode,
  type WorkflowStepCondition,
} from './workflow-policy.js'

export type { CodingTaskKind, CodingScope, CodingRisk, CodingWorkflowMode, CodingWorkflowRule } from './workflow-policy.js'

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
  mode: CodingWorkflowMode
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
  count: number, paths?: string[][], dependencies?: number[][], canParallelize = false,
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
    let waveIndex = canParallelize && writeSets ? earliest : Math.max(earliest, waves.length)
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

/**
 * Data selects the workflow; this function only enforces safety invariants and
 * computes a bounded dependency-wave plan. It never dispatches agents.
 */
export function decideCodingWorkflow(
  input: RouteInput,
  rules: readonly CodingWorkflowRule[] = DEFAULT_CODING_WORKFLOW_RULES,
): RouteResult {
  if (!CODING_TASK_KINDS.includes(input.taskKind) ||
      !CODING_SCOPES.includes(input.scope) ||
      !CODING_RISKS.includes(input.risk)) {
    throw new Error('invalid taskKind, scope or risk')
  }
  const independentTasks = input.independentTasks ?? 1
  if (!Number.isSafeInteger(independentTasks) || independentTasks < 1 || independentTasks > 100) {
    throw new Error('independentTasks must be an integer from 1 to 100')
  }
  const isHighImpact = input.risk === 'high' || input.scope === 'large'
  const isPlanned = isHighImpact || input.scope === 'medium'
  const profile = rules.find(rule =>
    rule.taskKinds.includes(input.taskKind) &&
    (rule.requiresPlan === undefined || rule.requiresPlan === isPlanned))
  if (!profile) throw new Error('no reviewed coding workflow policy matches the task')

  // A catalog cannot permit unsafe parallel execution, even if mayParallelize
  // was mistakenly enabled for a diagnostic or read-only workflow.
  const isParallelPermitted = profile.mode === 'planned' &&
    profile.mayParallelize === true && isPlanned &&
    (input.taskKind === 'feature' || input.taskKind === 'refactor') &&
    independentTasks >= 2 && input.nativeSubagents === true
  const executionWaves = planCodingWaves(independentTasks,
    input.taskPaths, input.taskDependencies, isParallelPermitted)
  const canParallelize = executionWaves.some(wave => wave.length > 1)
  const conditions: Record<WorkflowStepCondition, boolean> = {
    planned: isPlanned,
    'high-impact': isHighImpact,
    parallel: canParallelize,
    sequential: !canParallelize,
  }
  const skills = profile.steps
    .filter(step => step.when === undefined || conditions[step.when])
    .map(step => step.skill)

  return {
    mode: profile.mode,
    skills,
    parallelCandidate: canParallelize,
    executionWaves,
    verification: [...profile.verification],
    stopConditions: [...REQUIRED_WORKFLOW_STOP_CONDITIONS],
  }
}

export function createWorkflowRouteTool(
  rules: readonly CodingWorkflowRule[] = DEFAULT_CODING_WORKFLOW_RULES,
): ToolDefinition {
  return defineTool({
    name: 'code_workflow_route',
    description: 'Choose a compact, deterministic coding lifecycle from existing Code Worker Skills. Read-only; does not dispatch agents, run commands or change files. For substantial tasks only: tiny changes can load code-fast-change directly.',
    parameters: {
      taskKind: { type: 'string', required: true, enum: [...CODING_TASK_KINDS] },
      scope: { type: 'string', required: true, enum: [...CODING_SCOPES] },
      risk: { type: 'string', required: true, enum: [...CODING_RISKS] },
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
    execute: async (args) => decideCodingWorkflow(args as RouteInput, rules),
  })
}

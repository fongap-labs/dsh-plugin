import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import {
  CODING_TASK_KINDS, CODING_SCOPES, CODING_RISKS,
  type CodingTaskKind, type CodingScope, type CodingRisk,
} from './workflow-policy.js'
import { decideCodingWorkflow } from './workflow-route.js'

/** Ephemeral user-message anchor; native Session/Todo remain the task store. */
export class UserTaskContext {
  private current = new WeakMap<object, string>()

  capture(agent: object, text: string, continuation: boolean, routed: boolean): void {
    if (!routed) {
      this.current.delete(agent)
      return
    }
    if (!continuation || !this.current.has(agent)) {
      // Bound retained text; do not copy raw messages into prompts or telemetry.
      this.current.set(agent, text.slice(-16_384))
    }
  }

  read(agent: unknown): string | undefined {
    return agent && typeof agent === 'object' ? this.current.get(agent) : undefined
  }

  remove(agent: object): void {
    this.current.delete(agent)
  }

  clear(): void {
    this.current = new WeakMap()
  }
}

export interface TaskSpecInput {
  goal: string
  taskKind: CodingTaskKind
  scope: CodingScope
  risk: CodingRisk
  userQuotes?: string[]
  proposedAcceptance: string[]
  unknowns?: string[]
  firstAction: string
}

export interface TaskSpec {
  goal: string
  taskKind: CodingTaskKind
  scope: CodingScope
  risk: CodingRisk
  userQuotes: string[]
  proposedAcceptance: string[]
  unknowns: string[]
  firstAction: string
  workflow: string
  verification: string[]
}

/** This is a validation contract, not an LLM, autonomous planner or permission grant. */
function statement(value: unknown, name: string, max = 320): string {
  if (typeof value !== 'string' || !value.trim() ||
      value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(name + ' must be nonempty single-line text within ' + max + ' characters')
  }
  return value.trim()
}

function statements(value: unknown, name: string, min = 0): string[] {
  if (!Array.isArray(value) || value.length < min || value.length > 12) {
    throw new Error(name + ' must contain ' + min + '..12 entries')
  }
  const clean = value.map((item: unknown) => statement(item, name, 240))
  if (new Set(clean).size !== clean.length) throw new Error('duplicate ' + name + ' entry')
  return clean
}

/**
 * Only quotes found verbatim in the current user-authored task are called
 * explicit. Acceptance criteria are proposals until evidence verifies them.
 */
export function prepareTaskSpec(input: TaskSpecInput, sourceText: string): TaskSpec {
  if (!input || typeof input !== 'object' ||
      !CODING_TASK_KINDS.includes(input.taskKind) ||
      !CODING_SCOPES.includes(input.scope) ||
      !CODING_RISKS.includes(input.risk)) {
    throw new Error('taskKind, scope and risk must match a reviewed workflow category')
  }
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    throw new Error('native user task source is unavailable; do not infer explicit requirements')
  }
  const goal = statement(input.goal, 'goal')
  const userQuotes = statements(input.userQuotes ?? [], 'userQuotes')
  for (const quote of userQuotes) {
    if (!sourceText.includes(quote)) {
      throw new Error('userQuotes must appear verbatim in the current user task')
    }
  }
  const proposedAcceptance = statements(input.proposedAcceptance, 'proposedAcceptance', 1)
  const unknowns = statements(input.unknowns ?? [], 'unknowns')
  const firstAction = statement(input.firstAction, 'firstAction')
  const route = decideCodingWorkflow({
    taskKind: input.taskKind, scope: input.scope, risk: input.risk,
  })
  return {
    goal, taskKind: input.taskKind, scope: input.scope, risk: input.risk,
    userQuotes, proposedAcceptance, unknowns, firstAction,
    workflow: route.mode, verification: route.verification,
  }
}

/** Opt-in, once per substantial task. Never calls another model or writes a task store. */
export function createTaskSpecTool(context: UserTaskContext): ToolDefinition {
  return defineTool({
    name: 'code_task_spec',
    description: 'Validate a compact natural-language-to-task contract against the current native user message. Quote explicit user requirements verbatim; label all acceptance criteria as proposed, not verified. For substantial tasks only; no extra model, side effects, task database or permission elevation.',
    parameters: {
      goal: { type: 'string', required: true, description: 'Concise proposed outcome, not a verified user quotation.' },
      taskKind: { type: 'string', required: true, enum: [...CODING_TASK_KINDS] },
      scope: { type: 'string', required: true, enum: [...CODING_SCOPES] },
      risk: { type: 'string', required: true, enum: [...CODING_RISKS] },
      userQuotes: { type: 'array', items: { type: 'string' }, description: '0..12 exact, contiguous phrases present in current user-authored task. No paraphrases.' },
      proposedAcceptance: { type: 'array', required: true, items: { type: 'string' }, description: '1..12 observable acceptance proposals, not claims of executed tests.' },
      unknowns: { type: 'array', items: { type: 'string' }, description: '0..12 unresolved facts to inspect, never invent missing values.' },
      firstAction: { type: 'string', required: true, description: 'First bounded, read-only investigation or safe next step.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        goal: { type: 'string', required: true },
        taskKind: { type: 'string', required: true },
        scope: { type: 'string', required: true },
        risk: { type: 'string', required: true },
        userQuotes: { type: 'array', required: true, items: { type: 'string' } },
        proposedAcceptance: { type: 'array', required: true, items: { type: 'string' } },
        unknowns: { type: 'array', required: true, items: { type: 'string' } },
        firstAction: { type: 'string', required: true },
        workflow: { type: 'string', required: true },
        verification: { type: 'array', required: true, items: { type: 'string' } },
      } },
      render(_args, value) {
        return [{ type: 'text', text: JSON.stringify(value) }]
      },
    },
    async execute(args, exec) {
      const source = context.read(exec.agent)
      if (!source) throw new Error('no native user task is available; do not invent a task source')
      return prepareTaskSpec(args as unknown as TaskSpecInput, source)
    },
  })
}

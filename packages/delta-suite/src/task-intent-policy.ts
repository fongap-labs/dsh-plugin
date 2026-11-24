/**
 * Host-neutral task-intent signals for every task domain, including coding.
 * This is advisory only: the native Agent interprets meaning and the Host owns permissions.
 */
export type TaskIntentMode = 'skip' | 'evaluate' | 'restate' | 'change' | 'wait'

const CONTINUE = /^(?:\u7ee7\u7eed|\u63a5\u7740|\u63a5\u4e0b\u6765|\u518d\u7ee7\u7eed|continue|proceed|go on|keep going)/iu
const CONTINUE_ONLY = /^(?:\u7ee7\u7eed(?:\u63a8\u8fdb(?:\u4efb\u52a1(?:\u94fe)?)?|\u6267\u884c(?:\u4efb\u52a1)?|\u5b8c\u6210(?:\u4efb\u52a1)?|\u5904\u7406(?:\u4efb\u52a1)?|\u4efb\u52a1|\u4e0b\u53bb|\u505a)?|\u63a5\u7740(?:\u505a|\u6765)?|\u63a5\u4e0b\u6765|\u518d\u7ee7\u7eed|continue|proceed|go on|keep going)[\s,，。.!！]*$/iu
const DO_NOT_RESTATE = /(?:\u4e0d\u7528|\u65e0\u9700|\u4e0d\u5fc5|\u4e0d\u8981|\u7981\u6b62)(?:\u518d)?(?:\u590d\u8ff0|\u91cd\u8ff0|\u603b\u7ed3\u6211\u7684\u8981\u6c42)|\b(?:do not|don't|no need to)\s+(?:restate|repeat back|summarize my instructions)\b/iu
const ASK_RESTATEMENT = /(?:\u8bf7|\u5148|\u5e2e\u6211|\u9700\u8981)(?:\u7b80\u8981)?(?:\u590d\u8ff0|\u91cd\u8ff0)(?:\u4e00\u4e0b|\u6211\u7684|\u6307\u4ee4|\u9700\u6c42|\u4efb\u52a1|\u8981\u6c42|\u7406\u89e3)?|\b(?:restate|repeat back)\s+(?:my|the|this)\s+(?:task|request|instructions|requirements)\b/iu
const AWAIT_CONFIRMATION = /(?:\u7b49\u6211\u786e\u8ba4|\u5f85\u6211\u786e\u8ba4|\u6211\u786e\u8ba4\u540e|\u786e\u8ba4\u540e\u518d|\u672a\u7ecf\u6211\u786e\u8ba4\u4e0d\u8981)|\b(?:wait for (?:my )?(?:confirmation|approval)|do not proceed until i (?:confirm|approve))\b/iu
const AMENDMENT = /^(?:\u6539\u4e3a|\u6539\u6210|\u8c03\u6574\u4e3a|\u8865\u5145|\u8fd8\u8981|\u518d\u52a0|\u4e0d\u662f|\u53d6\u6d88\u4e0a\u9762|\u9664\u4e86\u4e0a\u9762|instead\b|change (?:it|that|the)\b|also\b|except\b|revise\b|update (?:the|that)\b)/iu
const MATERIAL_SCOPE = /(?:\u5168\u9762|\u5b8c\u6574|\u7cfb\u7edf\u6027|\u7aef\u5230\u7aef|\u591a\u9636\u6bb5|\u591a\u90e8\u95e8|\u591a\u4ed3\u5e93|\u5927\u89c4\u6a21|\u6574\u4f53\u91cd\u6784|\u957f\u671f\u89c4\u5212)|\b(?:end.to.end|multi.stage|cross.team|cross.repository|architecture migration|full implementation|comprehensive review)\b/iu
// A short, read-only explanation of a dangerous operation is not an instruction to perform it.
const READ_ONLY_RISK_QUESTION = /^(?:please\s+)?(?:explain why|describe why|why (?:is|are|does)|what (?:is|are)|\u8bf7?(?:\u89e3\u91ca|\u8bf4\u660e)(?:\u4e00\u4e0b)?(?:\u4e3a\u4ec0\u4e48|\u4e3a\u4f55)|\u4e3a\u4ec0\u4e48|\u4e3a\u4f55)/iu
const DESTRUCTIVE_FOLLOW_UP = /(?:\b(?:then|afterwards|also)\s+(?:delete|drop|force[ -]push|purge|reset|rewrite)\b|(?:\u7136\u540e|\u63a5\u7740|\u540c\u65f6|\u968f\u540e).{0,16}(?:\u5220\u9664|\u6e05\u7a7a|\u91cd\u5efa|\u5f3a\u63a8|\u91cd\u5199))/iu
const MATERIAL_RISK = /(?:\u6c38\u4e45\u5220\u9664|\u5f7b\u5e95\u6e05\u7a7a|\u4e0d\u53ef\u6062\u590d|\u5f3a\u5236\u63a8\u9001|\u5f3a\u63a8(?:\u4e3b\u5206\u652f)?|\u5220\u9664\u751f\u4ea7|\u91cd\u5efa\u4e3b\u5206\u652f)|\b(?:irreversible|force.push|(?:drop|delete) (?:the )?(?:production )?database|purge (?:all|production)|reset --hard|rewrite (?:git )?history)\b/iu
const CONSTRAINT = /(?:\u5fc5\u987b|\u4e0d\u5f97|\u7981\u6b62|\u4e0d\u80fd|\u4ec5\u9650|\u8981\u6c42|\u4fdd\u7559|\u540c\u65f6|\u7b26\u5408|\u5f53\u4e14\u4ec5\u5f53)|\b(?:must|shall|never|without|only if|do not|keep|preserve|required)\b/giu
const DELIVERABLE = /(?:\u62a5\u544a|\u6f14\u793a\u6587\u7a3f|\u57f9\u8bad|\u65b9\u6848|\u9a8c\u6536|\u6d41\u7a0b|\u5b9e\u65bd|\u4e2d\u82f1\u6587|\u4ee3\u7801|\u4fee\u590d|\u6d4b\u8bd5)|\b(?:report|presentation|implementation|migration|acceptance|workflow|testing|code changes|refactor)\b/giu
const NUMBERED_LINE = /^\s*(?:\d{1,2}[.)、．]|\uFF08\d{1,2}\uFF09|[-*]\s+)\s*\S/gmu

function occurrences(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length
}

/** Synchronous, bounded signals; semantic uncertainty is left to the native Agent. */
export function decideTaskIntentMode(message: string, hasPreviousTask = false): TaskIntentMode {
  const text = message.trim()
  if (!text || DO_NOT_RESTATE.test(text)) return 'skip'
  if (CONTINUE_ONLY.test(text)) return hasPreviousTask ? 'skip' : 'evaluate'
  if (ASK_RESTATEMENT.test(text)) return AWAIT_CONFIRMATION.test(text) ? 'wait' : 'restate'
  if (hasPreviousTask && (AMENDMENT.test(text) ||
    (CONTINUE.test(text) && !CONTINUE_ONLY.test(text)))) return 'change'
  const bounded = text.length > 16_384 ? text.slice(0, 4096) + '\n' + text.slice(-4096) : text
  const count = occurrences(bounded, NUMBERED_LINE)
  const constraints = occurrences(bounded, CONSTRAINT)
  const deliverables = occurrences(bounded, DELIVERABLE)
  const explanatoryOnly = bounded.length <= 240 && !bounded.includes('\n') &&
    READ_ONLY_RISK_QUESTION.test(bounded) && !DESTRUCTIVE_FOLLOW_UP.test(bounded)
  if ((MATERIAL_RISK.test(bounded) && !explanatoryOnly) || count >= 3 ||
    (MATERIAL_SCOPE.test(bounded) && (constraints >= 1 || deliverables >= 1)) ||
    (bounded.length >= 240 && constraints >= 2 && deliverables >= 1) ||
    (bounded.length >= 700 && (constraints >= 1 || deliverables >= 2))) return 'restate'
  return 'evaluate'
}

const CORE_RULE =
  'Task-intent guidance is advisory, not permission or a new approval gate. ' +
  'Follow explicit user instructions and native Host permissions. ' +
  'For any domain, if investigation reveals a material misunderstanding, conflicting constraints or essential missing information, briefly align the task before an affected change. ' +
  'Prefer read-only inspection to unnecessary questions. Do not restate repeatedly or claim unverified facts.'

const DIRECTIVES: Record<Exclude<TaskIntentMode, 'skip'>, string> = {
  evaluate:
    'Review whether this user request actually needs a short intent restatement, regardless of task domain. ' +
    'For clear small tasks, answer or execute directly with no restatement. ' +
    'Ask only about essential unresolved ambiguity or newly required authorization.',
  restate:
    'This request has substantial scope, explicit constraints, or potential impact. ' +
    'After necessary read-only investigation and before consequential work, briefly restate the understood goal, scope, constraints and outcome. ' +
    'This is a one-time alignment update, not a request to wait for approval; continue with authorized work. ' +
    'If a dedicated coding plugin also creates an internal task plan, do not repeat this user-facing restatement.',
  change:
    'The latest user instruction may amend an existing task. Compare it against the native session and Todo. ' +
    'State only the material change in scope, constraints or outcome, not the complete original task. ' +
    'Continue when consistent; ask a concise question only if a consequential contradiction remains.',
  wait:
    'The user expressly requested a restatement followed by their confirmation. ' +
    'Restate the understood goal, scope, constraints and outcome, and do not begin the requested consequential work until the user confirms. ' +
    'Native Host permission decisions remain authoritative.',
}

interface TaskState {
  readonly signature: string
  readonly turn?: number
  readonly mode: TaskIntentMode
}

function signature(text: string): string {
  // Non-reversible, process-local duplicate hint; never persist the raw message.
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
  return text.length + ':' + (hash >>> 0).toString(16)
}

export class TaskIntentTracker {
  private states = new WeakMap<object, TaskState>()

  capture(agent: object, text: string, turn?: number): void {
    const previous = this.states.get(agent)
    const id = signature(text)
    if (previous?.signature === id && previous.turn === turn) return
    const hasPrevious = previous !== undefined
    this.states.set(agent, {
      signature: id,
      ...(typeof turn === 'number' && Number.isSafeInteger(turn) ? { turn } : {}),
      mode: decideTaskIntentMode(text, hasPrevious),
    })
  }

  guidance(agent: unknown): string {
    if (!agent || typeof agent !== 'object') return ''
    const state = this.states.get(agent)
    if (!state || state.mode === 'skip') return ''
    return '# Delta Suite: task-intent coordination\n' +
      DIRECTIVES[state.mode] + '\n' + CORE_RULE
  }

  finishTurn(agent: object): void {
    const state = this.states.get(agent)
    if (state) this.states.set(agent, { ...state, mode: 'skip' })
  }

  release(agent: object): void {
    this.states.delete(agent)
  }

  dispose(): void {
    this.states = new WeakMap()
  }
}

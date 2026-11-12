/**
 * Volatile A/B instrumentation of the existing automatic coding router.
 * Control: native DSH task execution without Delta's dynamic route prompt.
 * Guided: identical Host tools/permissions plus Delta's dynamic route prompt.
 * No user prompts, arguments, results, IDs, or network telemetry are retained.
 */
import { createHmac, randomBytes, randomInt } from 'node:crypto'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import type { CodingRoute } from './auto-routing.js'

export type AbArm = 'native' | 'guided'
type Bucket = {
  sessions: number
  turns: number
  completedTurns: number
  errorTurns: number
  toolCalls: number
  nativeToolCalls: number
  codeWorkerCalls: number
  toolErrors: number
  repeatCandidates: number
  repeatsAfterFailure: number
  billedTokens: number
  usageSamples: number
  routeCounts: Record<CodingRoute, number>
}
type SessionEntry = {
  arm: AbArm
  lastSeq: number
  seen: Map<string, boolean>
  outstanding: Map<string, string | null>
}
type SessionEvent = { type?: unknown; seq?: unknown; data?: unknown }
const MAX_FINGERPRINT_BYTES = 16 * 1024
const MAX_SIGNATURES = 64
const MAX_OUTSTANDING = 128
const ROUTES: CodingRoute[] = [
  'code-ci-repair', 'code-root-cause-debugging', 'code-review-readiness',
  'code-writing-plans', 'code-fast-change', 'code-feature-delivery',
]
function emptyBucket(): Bucket {
  return { sessions: 0, turns: 0, completedTurns: 0, errorTurns: 0,
    toolCalls: 0, nativeToolCalls: 0, codeWorkerCalls: 0, toolErrors: 0,
    repeatCandidates: 0, repeatsAfterFailure: 0, billedTokens: 0, usageSamples: 0,
    routeCounts: Object.fromEntries(ROUTES.map(route => [route, 0])) as Record<CodingRoute, number> }
}
function sessionOf(agent: unknown): object | undefined {
  if (!agent || typeof agent !== 'object') return undefined
  const session = (agent as { session?: unknown }).session
  return session && typeof session === 'object' ? session : undefined
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}
function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

/** Assigns only eligible coding sessions; a group never changes mid-session. */
export class InternalAbExperiment {
  private readonly secret = randomBytes(32)
  private samples = new WeakMap<object, SessionEntry>()
  private arms: Record<AbArm, Bucket> = { native: emptyBucket(), guided: emptyBucket() }

  constructor(private readonly allocate: () => AbArm = () => randomInt(2) === 0 ? 'native' : 'guided') {}

  assign(agent: unknown, route: CodingRoute): AbArm | undefined {
    const session = sessionOf(agent)
    if (!session) return undefined
    const existing = this.samples.get(session)
    if (existing) return existing.arm
    const arm = this.allocate()
    if (arm !== 'native' && arm !== 'guided') return undefined
    this.samples.set(session, { arm, lastSeq: -1, seen: new Map(), outstanding: new Map() })
    this.arms[arm].sessions++
    this.arms[arm].routeCounts[route]++
    return arm
  }

  guidanceEnabled(agent: unknown): boolean {
    // A missing native Session never changes the current established behavior.
    const session = sessionOf(agent)
    return !session || this.samples.get(session)?.arm !== 'native'
  }

  private fingerprint(name: string, raw: unknown): string | null {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_FINGERPRINT_BYTES) return null
    try {
      const normalized = JSON.stringify(JSON.parse(raw))
      return createHmac('sha256', this.secret).update(name).update('\0')
        .update(normalized).digest('hex')
    } catch { return null }
  }

  /** Observe a DSH Cordis session/event; never inspect raw tool result content. */
  observe(session: unknown, event: SessionEvent): void {
    if (!session || typeof session !== 'object') return
    const state = this.samples.get(session)
    if (!state || !event || !Number.isSafeInteger(event.seq) ||
        (event.seq as number) <= state.lastSeq) return
    state.lastSeq = event.seq as number
    const data = record(event.data)
    if (!data) return
    const bucket = this.arms[state.arm]
    if (event.type === 'tool/call') {
      if (typeof data.name !== 'string' || typeof data.callId !== 'string') return
      bucket.toolCalls++
      if (data.name.startsWith('code_')) bucket.codeWorkerCalls++
      else bucket.nativeToolCalls++
      const signature = this.fingerprint(data.name, data.arguments)
      if (signature) {
        const isPreviousFailure = state.seen.get(signature)
        if (isPreviousFailure !== undefined) {
          bucket.repeatCandidates++
          if (isPreviousFailure) bucket.repeatsAfterFailure++
          state.seen.delete(signature)
        }
        state.seen.set(signature, false)
        if (state.seen.size > MAX_SIGNATURES) {
          const oldest = state.seen.keys().next().value
          if (oldest) state.seen.delete(oldest)
        }
      }
      state.outstanding.set(data.callId, signature)
      if (state.outstanding.size > MAX_OUTSTANDING) {
        const oldest = state.outstanding.keys().next().value
        if (oldest) state.outstanding.delete(oldest)
      }
    } else if (event.type === 'tool/result') {
      const message = record(data.message)
      const callId = message?.toolCallId
      if (typeof callId !== 'string' || !state.outstanding.has(callId)) return
      const signature = state.outstanding.get(callId)
      state.outstanding.delete(callId)
      const isError = message?.isError === true
      if (isError) bucket.toolErrors++
      if (signature && state.seen.has(signature)) state.seen.set(signature, isError)
    } else if (event.type === 'turn/end') {
      bucket.turns++
      const kind = record(data.reason)?.kind
      if (kind === 'completed') bucket.completedTurns++
      if (kind === 'error') bucket.errorTurns++
    } else if (event.type === 'assistant/message') {
      const usage = record(data.usage)
      if (!usage) return
      if (!Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens)) return
      bucket.usageSamples++
      bucket.billedTokens += safeCount(usage.inputTokens) + safeCount(usage.outputTokens) +
        safeCount(usage.cacheReadTokens) + safeCount(usage.cacheWriteTokens)
    }
  }

  report() {
    const copy = (bucket: Bucket) => ({ ...bucket, routeCounts: { ...bucket.routeCounts } })
    return {
      scope: 'current-plugin-process' as const,
      experiment: 'auto-routing-guidance' as const,
      native: copy(this.arms.native),
      guided: copy(this.arms.guided),
      warning: 'Automatic randomized observational A/B. Groups share all Host tools and permissions; only dynamic routing guidance differs. Turns are not verified task completions. No causal claim until comparable workloads and sufficient samples.',
    }
  }

  clear(): void {
    this.samples = new WeakMap()
    this.arms = { native: emptyBucket(), guided: emptyBucket() }
    this.secret.fill(0)
  }
}

const BUCKET_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    sessions: { type: 'integer', required: true },
    turns: { type: 'integer', required: true },
    completedTurns: { type: 'integer', required: true },
    errorTurns: { type: 'integer', required: true },
    toolCalls: { type: 'integer', required: true },
    nativeToolCalls: { type: 'integer', required: true },
    codeWorkerCalls: { type: 'integer', required: true },
    toolErrors: { type: 'integer', required: true },
    repeatCandidates: { type: 'integer', required: true },
    repeatsAfterFailure: { type: 'integer', required: true },
    billedTokens: { type: 'integer', required: true },
    usageSamples: { type: 'integer', required: true },
    routeCounts: { type: 'object', required: true, additionalProperties: false,
      properties: Object.fromEntries(ROUTES.map(route => [route, { type: 'integer', required: true }])) },
  },
} as const

/** Read-only. Collection and allocation run automatically; no manual test setup. */
export function createInternalAbReportTool(experiment: InternalAbExperiment): ToolDefinition {
  return defineTool({
    name: 'code_ab_report',
    description: 'Read the automatic internal A/B comparison of native DSH coding vs guided Code Worker coding; no transcript input, no manual experiment setup and no telemetry.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        scope: { type: 'string', required: true },
        experiment: { type: 'string', required: true },
        native: { ...BUCKET_SCHEMA, required: true },
        guided: { ...BUCKET_SCHEMA, required: true },
        warning: { type: 'string', required: true },
      } },
      render(_args, data) {
        const line = (name: string, bucket: Bucket) =>
          name + ': sessions=' + bucket.sessions + ', turns=' + bucket.turns +
          ', toolCalls=' + bucket.toolCalls + ', toolErrors=' + bucket.toolErrors +
          ', repeats=' + bucket.repeatCandidates + ', billedTokens=' + bucket.billedTokens
        return [{ type: 'text', text: [
          'Internal Code Worker A/B (' + data.scope + ')',
          line('Native', data.native),
          line('Guided', data.guided),
          data.warning,
        ].join('\n') }]
      },
    },
    async execute() { return experiment.report() },
  })
}

/** Bounded, opt-in AI Gateway request scheduling through public Harness events. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, LlmFailure, StreamChunk } from '@deepseek-ai/dsh-llm/types'

export interface GatewayReliabilityConfig {
  providers: string[]
  origins: string[]
  stepBudgetMs?: number
  auxiliaryBudgetMs?: number
  maxConcurrent?: number
  maxQueued?: number
  maxClientRetries?: number
  requireHeaderSupport?: boolean
}

interface ResolvedConfig {
  providers: Set<string>
  origins: Set<string>
  stepBudgetMs: number
  auxiliaryBudgetMs: number
  maxConcurrent: number
  maxQueued: number
  maxClientRetries: number
  requireHeaderSupport: boolean
}

interface StepState {
  turn: number
  step: number
  deadline: number
  retries: number
  partial: boolean
}

interface AgentRef {
  session: { id: string }
}
interface StepEvent {
  agent: AgentRef
  turn: number
  step: number
  modelSelection?: { provider: string }
}
interface RecoveryEvent {
  agent: AgentRef
  turn: number
  step: number
  provider: string
  failure: LlmFailure
  signal: AbortSignal
}
type Recovery = { kind: 'retry' } | undefined
type HeaderRequest = { provider: string; baseURL: string; sessionId?: string; purpose?: string }

/** Structural optional Host events keep runtime framework ownership in Harness. */
interface GatewayHost {
  on(
    event: 'agent/pre-step',
    listener: (event: StepEvent, next: () => Promise<unknown>) => Promise<unknown>,
    prepend?: boolean,
  ): () => unknown
  on(
    event: 'agent/request-error',
    listener: (event: RecoveryEvent, next: () => Promise<Recovery>) => Promise<Recovery>,
    prepend?: boolean,
  ): () => unknown
  on(event: 'session/event', listener: (session: { id: string }, event: { type: string }) => void): () => unknown
  on(
    event: 'llm/stream',
    listener: (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => AsyncIterable<StreamChunk>,
  ): () => unknown
  on(
    event: 'llm-pi-ai/request-headers',
    listener: (request: HeaderRequest, headers: Headers, next: () => Headers) => Headers,
  ): () => unknown
  effect(callback: () => () => void, label?: string): unknown
  logger?: { info(message: string): void; warn?(message: string): void }
}

const TERMINAL_CODES = new Set([
  'GATEWAY_RESOURCE_LIMIT',
  'GATEWAY_NON_RETRYABLE',
  'GATEWAY_DEADLINE',
  'GATEWAY_PARTIAL_RESPONSE',
  'GATEWAY_QUEUE_FULL',
  'GATEWAY_HOST_UNSUPPORTED',
])

function integer(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value ?? fallback
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(`gatewayReliability.${name} must be an integer from ${min} through ${max}`)
  return result
}

function resolveConfig(config: GatewayReliabilityConfig): ResolvedConfig {
  const allowed = new Set([
    'providers',
    'origins',
    'stepBudgetMs',
    'auxiliaryBudgetMs',
    'maxConcurrent',
    'maxQueued',
    'maxClientRetries',
    'requireHeaderSupport',
  ])
  for (const key of Object.keys(config))
    if (!allowed.has(key)) throw new Error(`Unknown gatewayReliability field: ${key}`)
  for (const key of ['providers', 'origins'] as const) {
    if (
      !Array.isArray(config[key]) ||
      config[key].length === 0 ||
      config[key].some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new Error(`gatewayReliability.${key} must be a nonempty string array`)
    }
  }
  const origins = config.origins.map((value) => {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('gatewayReliability.origins must contain HTTPS origins without credentials, paths or queries')
    }
    return url.origin
  })
  if (config.requireHeaderSupport !== undefined && typeof config.requireHeaderSupport !== 'boolean')
    throw new Error('gatewayReliability.requireHeaderSupport must be a boolean')
  return {
    providers: new Set(config.providers),
    origins: new Set(origins),
    stepBudgetMs: integer(config.stepBudgetMs, 180_000, 1_000, 900_000, 'stepBudgetMs'),
    auxiliaryBudgetMs: integer(config.auxiliaryBudgetMs, 90_000, 1_000, 900_000, 'auxiliaryBudgetMs'),
    maxConcurrent: integer(config.maxConcurrent, 1, 1, 8, 'maxConcurrent'),
    maxQueued: integer(config.maxQueued, 16, 0, 256, 'maxQueued'),
    maxClientRetries: integer(config.maxClientRetries, 1, 0, 2, 'maxClientRetries'),
    requireHeaderSupport: config.requireHeaderSupport ?? false,
  }
}

/** Normalize structured problem JSON retained inside pi-ai's flattened HTTP failure text. */
export function classifyGatewayFailure(failure: LlmFailure): LlmFailure {
  const offset = failure.message.indexOf('{')
  if (offset < 0) return failure
  let data: unknown
  try {
    data = JSON.parse(failure.message.slice(offset))
  } catch {
    return failure
  }
  if (!data || typeof data !== 'object') return failure
  const body = data as {
    error_code?: unknown
    retryable?: unknown
    error?: { retryable?: unknown; details?: { retryable?: unknown; retry_after_ms?: unknown } }
  }
  if (body.error_code === 1102) {
    return {
      code: 'GATEWAY_RESOURCE_LIMIT',
      status: 503,
      message:
        'AI Gateway exceeded its Worker resource limit (Cloudflare 1102). Reduce the request or repair the deployment, then resume from the recorded task state.',
    }
  }
  if (body.retryable === false || body.error?.retryable === false || body.error?.details?.retryable === false)
    return { ...failure, code: 'GATEWAY_NON_RETRYABLE' }
  const retryAfter = body.error?.details?.retry_after_ms
  return typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0
    ? { ...failure, providerRetryAfterMs: retryAfter }
    : failure
}

class QueueFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** A FIFO inference queue; queued cancellations and expired deadlines never acquire a slot. */
export class GatewayQueue {
  private active = 0
  private closed = false
  private pending: Array<{ grant(): void; reject(error: Error): void }> = []
  constructor(
    private readonly concurrency: number,
    private readonly capacity: number,
  ) {}
  get isBusy(): boolean {
    return this.active >= this.concurrency
  }

  acquire(signal: AbortSignal | undefined, deadline: number): Promise<() => void> {
    if (signal?.aborted)
      return Promise.reject(new QueueFailure('ABORTED', 'Gateway request cancelled before dispatch.'))
    if (deadline <= Date.now())
      return Promise.reject(new QueueFailure('GATEWAY_DEADLINE', 'Gateway step deadline expired while waiting.'))
    if (this.closed) return Promise.reject(new QueueFailure('ABORTED', 'Gateway request queue is closed.'))
    if (this.active < this.concurrency) {
      this.active++
      return Promise.resolve(this.release())
    }
    if (this.pending.length >= this.capacity)
      return Promise.reject(
        new QueueFailure('GATEWAY_QUEUE_FULL', 'Gateway request queue is full; resume after current requests finish.'),
      )
    return new Promise((resolve, reject) => {
      const remove = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        const index = this.pending.indexOf(entry)
        if (index >= 0) this.pending.splice(index, 1)
      }
      const abort = () => entry.reject(new QueueFailure('ABORTED', 'Gateway request cancelled while queued.'))
      const entry = {
        grant: () => {
          remove()
          if (signal?.aborted || deadline <= Date.now()) {
            reject(
              new QueueFailure(
                signal?.aborted ? 'ABORTED' : 'GATEWAY_DEADLINE',
                'Gateway request ended before dispatch.',
              ),
            )
            this.drain()
          } else {
            this.active++
            resolve(this.release())
          }
        },
        reject: (error: Error) => {
          remove()
          reject(error)
        },
      }
      const timer = setTimeout(
        () => entry.reject(new QueueFailure('GATEWAY_DEADLINE', 'Gateway step deadline expired while queued.')),
        deadline - Date.now(),
      )
      this.pending.push(entry)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  private release(): () => void {
    let released = false
    return () => {
      if (!released) {
        released = true
        this.active--
        this.drain()
      }
    }
  }
  private drain(): void {
    if (!this.closed && this.active < this.concurrency) this.pending[0]?.grant()
  }
  close(): void {
    this.closed = true
    for (const entry of [...this.pending]) entry.reject(new QueueFailure('ABORTED', 'Gateway request queue closed.'))
  }
}

/** Install only when an operator explicitly names the gateway providers and origins. */
export function registerGatewayReliability(ctx: Context, input?: GatewayReliabilityConfig): void {
  if (input === undefined) return
  const config = resolveConfig(input)
  const host = ctx as unknown as GatewayHost
  if (typeof host.on !== 'function' || typeof host.effect !== 'function')
    throw new Error('Gateway reliability requires Harness event and effect services.')
  const steps = new Map<string, StepState>()
  const queue = new GatewayQueue(config.maxConcurrent, config.maxQueued)
  const dispatch = new AsyncLocalStorage<{ provider: string; deadline: number; headersPrepared: boolean }>()
  let hasWarnedMissingHeaders = false
  const disposers = [
    host.on(
      'agent/pre-step',
      async (event, next) => {
        // Released Harness builds omit selection metadata; dispatch still filters the exact provider.
        if (event.modelSelection === undefined || config.providers.has(event.modelSelection.provider)) {
          const prior = steps.get(event.agent.session.id)
          if (!prior || prior.turn !== event.turn || prior.step !== event.step) {
            if (!prior && steps.size >= 256) return next()
            steps.set(event.agent.session.id, {
              turn: event.turn,
              step: event.step,
              deadline: Date.now() + config.stepBudgetMs,
              retries: 0,
              partial: false,
            })
          }
        }
        return next()
      },
      true,
    ),
    host.on(
      'agent/request-error',
      async (event, next) => {
        if (!config.providers.has(event.provider)) return next()
        const state = steps.get(event.agent.session.id)
        if (TERMINAL_CODES.has(classifyGatewayFailure(event.failure).code)) return undefined
        if (!state || state.turn !== event.turn || state.step !== event.step) return undefined
        if (
          state.partial ||
          state.retries >= config.maxClientRetries ||
          Date.now() + (event.failure.providerRetryAfterMs ?? 0) >= state.deadline
        )
          return undefined
        const decision = await next()
        if (decision?.kind === 'retry') state.retries++
        return decision
      },
      true,
    ),
    host.on('session/event', (session, event) => {
      if (event.type === 'turn/end') steps.delete(session.id)
    }),
    host.on('llm-pi-ai/request-headers', (request, _headers, next) => {
      const headers = next()
      if (!config.providers.has(request.provider) || !config.origins.has(new URL(request.baseURL).origin))
        return headers
      const current = dispatch.getStore()
      if (current?.provider === request.provider) {
        headers.set('x-gateway-deadline-ms', String(current.deadline))
        current.headersPrepared = true
      }
      if (request.sessionId) {
        const id = request.purpose ? `${request.sessionId}:${request.purpose}` : request.sessionId
        if (id.length >= 8 && id.length <= 128) headers.set('x-session-id', id)
      }
      return headers
    }),
    host.on('llm/stream', (options, next) =>
      (async function* () {
        if (!config.providers.has(options.provider)) {
          yield* next()
          return
        }
        const state = options.purpose === undefined && options.sessionId ? steps.get(options.sessionId) : undefined
        const deadline = state?.deadline ?? Date.now() + config.auxiliaryBudgetMs
        let release: (() => void) | undefined
        let iterator: AsyncIterator<StreamChunk> | undefined
        let partial = false
        try {
          if (queue.isBusy)
            host.logger?.info(
              `gateway-reliability: waiting for inference slot; provider=${options.provider} purpose=${options.purpose ?? 'conversation'}`,
            )
          release = await queue.acquire(options.signal, deadline)
          const scope = { provider: options.provider, deadline, headersPrepared: false }
          iterator = dispatch.run(scope, () => next()[Symbol.asyncIterator]())
          for (;;) {
            const result = await dispatch.run(scope, () => iterator!.next())
            if (!scope.headersPrepared && !hasWarnedMissingHeaders) {
              hasWarnedMissingHeaders = true
              host.logger?.warn?.(
                'gateway-reliability: this adapter did not prepare gateway headers. Queue and retry caps are active; shared gateway deadlines and affinity require a Harness adapter with llm-pi-ai/request-headers support.',
              )
            }
            if (result.done) break
            let chunk = result.value
            if (
              !scope.headersPrepared &&
              config.requireHeaderSupport &&
              !(chunk.type === 'finish' && chunk.reason.kind === 'error')
            ) {
              yield {
                type: 'finish',
                reason: {
                  kind: 'error',
                  failure: {
                    code: 'GATEWAY_HOST_UNSUPPORTED',
                    message:
                      'This Harness adapter cannot attach gateway deadline headers. Upgrade the adapter before enabling requireHeaderSupport.',
                  },
                },
              }
              return
            }
            if (
              ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && chunk.text.length > 0) ||
              chunk.type === 'tool-call-delta'
            )
              partial = true
            if (state) state.partial = partial
            if (chunk.type === 'finish' && chunk.reason.kind === 'error') {
              let failure = classifyGatewayFailure(chunk.reason.failure)
              if (!TERMINAL_CODES.has(failure.code)) {
                if (partial)
                  failure = {
                    ...failure,
                    code: 'GATEWAY_PARTIAL_RESPONSE',
                    message: `Gateway stream failed after partial output; automatic replay stopped. Check recorded task state before resuming. ${failure.message.slice(0, 300)}`,
                  }
                else if (Date.now() >= deadline) failure = { ...failure, code: 'GATEWAY_DEADLINE' }
                else if (failure.code === 'PI_AI_ERROR' && /malformed server-sent event JSON/i.test(failure.message))
                  failure = { ...failure, code: 'TRANSPORT' }
              }
              chunk = { ...chunk, reason: { kind: 'error', failure } }
            }
            yield chunk
          }
        } catch (error) {
          if (!(error instanceof QueueFailure)) throw error
          yield { type: 'finish', reason: { kind: 'error', failure: { message: error.message, code: error.code } } }
        } finally {
          try {
            await iterator?.return?.()
          } finally {
            release?.()
          }
        }
      })(),
    ),
  ]
  host.effect(
    () => () => {
      for (const dispose of disposers) dispose()
      queue.close()
      steps.clear()
    },
    'dsh-suite-delta: gateway reliability',
  )
}

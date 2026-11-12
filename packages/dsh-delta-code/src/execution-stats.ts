/**
 * Ephemeral, per-native-session quality counters for Code Worker tools only.
 * No raw tool arguments, file contents, credentials or durable telemetry.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@fongap-labs/shared'
import { classifyFailure, type FailureKind } from './tools/failure-policy.js'

const MAX_SIGNATURES = 64
const MAX_FINGERPRINT_BYTES = 16 * 1024

interface ToolCounters {
  name: string
  calls: number
  errors: number
  failedOutcomes: number
  duplicateCalls: number
}

interface SessionCounters {
  calls: number
  duplicateCalls: number
  repeatedFailedCalls: number
  errors: number
  failedOutcomes: number
  verificationPassed: number
  verificationFailed: number
  focusedPassed: number
  deliveryVerified: number
  deliveryBlocked: number
  totalDurationMs: number
  failureKinds: Record<FailureKind, number>
  tools: Map<string, ToolCounters>
  signatures: Map<string, boolean>
}

function emptyCounters(): SessionCounters {
  return {
    calls: 0, duplicateCalls: 0, repeatedFailedCalls: 0, errors: 0,
    failedOutcomes: 0, verificationPassed: 0, verificationFailed: 0,
    focusedPassed: 0, deliveryVerified: 0, deliveryBlocked: 0,
    totalDurationMs: 0,
    failureKinds: { permission: 0, environment: 0, transient: 0,
      verification: 0, uncertain: 0, unknown: 0 },
    tools: new Map(), signatures: new Map(),
  }
}

function sessionOf(exec: ToolRunContext): object | undefined {
  const agent = exec.agent as { session?: unknown } | undefined
  const session = agent?.session
  return session !== null && typeof session === 'object' ? session : undefined
}

function outcomeFailed(name: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const result = value as { passed?: unknown; stage?: unknown }
  if (result.passed === false) return true
  if (name === 'code_delivery_gate' && result.stage === 'blocked') return true
  if (name === 'code_resume' && result.stage === 'blocked') return true
  return false
}

export class ExecutionStats {
  private readonly fingerprintsKey = randomBytes(32)
  private sessions = new WeakMap<object, SessionCounters>()

  /** A fingerprint never leaves this process; only bounded counts are exported. */
  private signature(name: string, args: unknown): string | undefined {
    try {
      const serialized = JSON.stringify(args)
      if (typeof serialized !== 'string' ||
          Buffer.byteLength(serialized) > MAX_FINGERPRINT_BYTES) return undefined
      return createHmac('sha256', this.fingerprintsKey)
        .update(name).update('\0').update(serialized).digest('hex')
    } catch {
      return undefined
    }
  }

  async observe<T>(name: string, args: unknown, exec: ToolRunContext, run: () => Promise<T> | T): Promise<T> {
    const session = sessionOf(exec)
    if (!session) return await run()
    let state = this.sessions.get(session)
    if (!state) {
      state = emptyCounters()
      this.sessions.set(session, state)
    }
    const counters = state
    let tool = counters.tools.get(name)
    if (!tool) {
      tool = { name, calls: 0, errors: 0, failedOutcomes: 0, duplicateCalls: 0 }
      counters.tools.set(name, tool)
    }
    counters.calls++
    tool.calls++
    const fingerprint = this.signature(name, args)
    if (fingerprint) {
      const isPreviouslyFailed = counters.signatures.get(fingerprint)
      if (isPreviouslyFailed !== undefined) {
        counters.duplicateCalls++
        tool.duplicateCalls++
        if (isPreviouslyFailed) counters.repeatedFailedCalls++
        counters.signatures.delete(fingerprint)
      }
    }
    const started = performance.now()
    let isFailed = false
    try {
      const value = await run()
      isFailed = outcomeFailed(name, value)
      if (isFailed) {
        counters.failedOutcomes++
        tool.failedOutcomes++
      }
      if (value && typeof value === 'object') {
        const result = value as { passed?: unknown; stage?: unknown; scope?: unknown }
        if (name === 'code_verify' || name === 'code_verify_suite') {
          if (result.passed === true) {
            counters.verificationPassed++
            if (result.scope === 'focused') counters.focusedPassed++
          } else if (result.passed === false) counters.verificationFailed++
        }
        if (name === 'code_delivery_gate') {
          if (result.stage === 'verified') counters.deliveryVerified++
          else if (result.stage === 'blocked') counters.deliveryBlocked++
        }
      }
      return value
    } catch (error) {
      isFailed = true
      counters.errors++
      tool.errors++
      const kind = classifyFailure(error)
      counters.failureKinds[kind]++
      throw error
    } finally {
      counters.totalDurationMs += Math.max(0, Math.round(performance.now() - started))
      if (fingerprint) {
        counters.signatures.delete(fingerprint)
        counters.signatures.set(fingerprint, isFailed)
        if (counters.signatures.size > MAX_SIGNATURES) {
          const oldest = counters.signatures.keys().next().value
          if (oldest !== undefined) counters.signatures.delete(oldest)
        }
      }
    }
  }

  wrap(tool: ToolDefinition): ToolDefinition {
    // Exclude the stats reader itself so viewing counters is never a new sample.
    if (tool.name === 'code_execution_stats') return tool
    return { ...tool, execute: (args: any, exec: ToolRunContext) =>
      this.observe(tool.name, args, exec, () => tool.execute(args, exec)) } as ToolDefinition
  }

  read(exec: ToolRunContext) {
    const session = sessionOf(exec)
    const current = session ? this.sessions.get(session) : undefined
    const state = current ?? emptyCounters()
    const scope: 'current-session' | 'unavailable' = session ? 'current-session' : 'unavailable'
    return {
      scope,
      calls: state.calls,
      duplicateCalls: state.duplicateCalls,
      repeatedFailedCalls: state.repeatedFailedCalls,
      errors: state.errors,
      failedOutcomes: state.failedOutcomes,
      verificationPassed: state.verificationPassed,
      verificationFailed: state.verificationFailed,
      focusedPassed: state.focusedPassed,
      deliveryVerified: state.deliveryVerified,
      deliveryBlocked: state.deliveryBlocked,
      totalDurationMs: state.totalDurationMs,
      failureKinds: { ...state.failureKinds },
      tools: [...state.tools.values()].map(item => ({ ...item })),
    }
  }

  clear(): void {
    this.sessions = new WeakMap()
    this.fingerprintsKey.fill(0)
  }
}

/** Read-only counters, scoped strictly to the requesting native session. */
export function createExecutionStatsTool(stats: ExecutionStats): ToolDefinition {
  return defineTool({
    name: 'code_execution_stats',
    description: 'Show ephemeral execution counters for this DSH session and Code Worker tools only. No native-tool counts, tokens, content, paths, credentials or persistent telemetry.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        scope: { type: 'string', required: true, enum: ['current-session', 'unavailable'] },
        calls: { type: 'integer', required: true },
        duplicateCalls: { type: 'integer', required: true },
        repeatedFailedCalls: { type: 'integer', required: true },
        errors: { type: 'integer', required: true },
        failedOutcomes: { type: 'integer', required: true },
        verificationPassed: { type: 'integer', required: true },
        verificationFailed: { type: 'integer', required: true },
        focusedPassed: { type: 'integer', required: true },
        deliveryVerified: { type: 'integer', required: true },
        deliveryBlocked: { type: 'integer', required: true },
        totalDurationMs: { type: 'integer', required: true },
        failureKinds: { type: 'object', required: true, additionalProperties: false, properties:
          Object.fromEntries(['permission', 'environment', 'transient', 'verification', 'uncertain', 'unknown']
            .map(key => [key, { type: 'integer', required: true }])) },
        tools: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          name: { type: 'string', required: true },
          calls: { type: 'integer', required: true },
          errors: { type: 'integer', required: true },
          failedOutcomes: { type: 'integer', required: true },
          duplicateCalls: { type: 'integer', required: true },
        } } },
      } },
      render(_args, value) {
        return [{ type: 'text', text: [
          'Code Worker execution stats: ' + value.scope,
          'Calls: ' + value.calls + ', repeated signatures: ' + value.duplicateCalls +
            ', repeated after failure: ' + value.repeatedFailedCalls,
          'Thrown errors: ' + value.errors + ', failed results: ' + value.failedOutcomes,
          'Verification pass/fail: ' + value.verificationPassed + '/' + value.verificationFailed +
            ' (focused passes: ' + value.focusedPassed + ')',
          'Delivery gate verified/blocked: ' + value.deliveryVerified + '/' + value.deliveryBlocked,
          'Recorded tool duration (ms): ' + value.totalDurationMs,
          'Scope excludes DSH native tools and internal retry attempts; duplicates may be intentional.',
        ].join('\n') }]
      },
    },
    async execute(_args, exec) {
      return stats.read(exec)
    },
  })
}

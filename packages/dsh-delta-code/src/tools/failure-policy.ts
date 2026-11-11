import { setTimeout as delay } from 'node:timers/promises'

export type FailureKind = 'permission' | 'transient' | 'verification' | 'unknown'

/** Authorization failures always take precedence over transient transport errors. */
export function classifyFailure(value: unknown): FailureKind {
  const message = value instanceof Error ? value.message : String(value)
  if (/\b(?:EACCES|EPERM|permission denied|access denied|not authorized|unauthorized|forbidden|host refused|host rejected|HTTP\s*40[13])\b/i.test(message)) {
    return 'permission'
  }
  if (/\b(?:HTTP\s*(?:429|502|503|504)|status[=: ]+(?:429|502|503|504)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|rate.limit(?:ed)?|temporarily unavailable|service unavailable)\b/i.test(message)) {
    return 'transient'
  }
  if (/\b(?:assertion failed|test failure|tests? failed|compile error|typecheck failed)\b/i.test(message)) {
    return 'verification'
  }
  return 'unknown'
}

/**
 * Only read-only, repeatable operations may call this helper.
 * A failed write or test may have completed before its response was lost.
 */
export async function retryReadOnly<T>(
  run: () => Promise<T>, signal: AbortSignal, maxAttempts = 2,
): Promise<T> {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error('read-only retry attempts must be 1..3')
  }
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal.throwIfAborted()
    try {
      return await run()
    } catch (error) {
      if (signal.aborted || attempt === maxAttempts || classifyFailure(error) !== 'transient') {
        throw error
      }
      await delay(100 * attempt, undefined, { signal })
    }
  }
  throw new Error('unreachable read-only retry state')
}

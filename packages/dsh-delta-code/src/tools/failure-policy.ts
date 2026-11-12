import { setTimeout as delay } from 'node:timers/promises'

export type FailureKind = 'permission' | 'environment' | 'transient' | 'verification' | 'uncertain' | 'unknown'

/** Authorization failures always take precedence over transient transport errors. */
export function classifyFailure(value: unknown): FailureKind {
  const message = value instanceof Error ? value.message : String(value)
  if (/\b(?:EACCES|EPERM|permission denied|access denied|not authorized|unauthorized|forbidden|host refused|host rejected|host denied|HTTP\s*40[13])\b/i.test(message)) {
    return 'permission'
  }
  // A missing result may reflect a command still running: do not auto-retry it.
  if (/\b(?:outcome (?:is )?(?:unconfirmed|unknown)|verification deadline exceeded|result (?:was )?lost|exit (?:code|status) unavailable|process state unknown)\b/i.test(message)) return 'uncertain'
  if (/\b(?:ENOENT|ENOTDIR|command not found|executable not found|host subprocess service (?:is )?(?:unavailable|required)|missing subprocess|cannot find (?:module|executable)|not recognized as an internal or external command)\b/i.test(message)) return 'environment'
  if (/\b(?:HTTP\s*(?:429|502|503|504)|status[=: ]+(?:429|502|503|504)|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|rate.limit(?:ed)?|temporarily unavailable|service unavailable)\b/i.test(message)) {
    return 'transient'
  }
  if (/\b(?:assertion failed|test failure|tests? failed|compile error|typecheck failed)\b/i.test(message)) {
    return 'verification'
  }
  return 'unknown'
}

/** Treat failed commands with a known exit status as test failures, not Host permission denials. */
export function classifyVerificationEvidence(evidence: {
  passed: boolean; timedOut: boolean; exitCode: number; truncated: boolean; output: string
}): FailureKind | 'none' {
  if (evidence.passed) return 'none'
  if (evidence.timedOut || evidence.exitCode < 0) return 'uncertain'
  if (evidence.truncated) return 'unknown'
  return classifyFailure(evidence.output) === 'transient' ? 'transient' : 'verification'
}

/** Human-only follow-up; failed verification commands are never retried automatically. */
export function verificationNextAction(kind: FailureKind | 'none'): string {
  switch (kind) {
    case 'none': return 'Verification passed; inspect the diff and delivery requirements.'
    case 'permission': return 'Request Host authorization; do not bypass permissions or retry automatically.'
    case 'environment': return 'Restore the missing Host subprocess or executable; do not retry until the environment is repaired.'
    case 'transient': return 'Investigate the temporary dependency/transport failure; rerun explicitly only after confirming safety.'
    case 'verification': return 'Diagnose the failing check and change the hypothesis before rerunning.'
    case 'uncertain': return 'Inspect whether the Host command is still running or finished; the outcome is unconfirmed. Do not retry automatically.'
    default: return 'Inspect the Host outcome before any rerun; the command may have executed.'
  }
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
      const message = error instanceof Error ? error.message : String(error)
      // A gateway may return HTTP 429/5xx while explicitly marking the error
      // non-retryable. Respect that contract even for read-only operations.
      const nonRetryable = /(?:["']?retryable["']?\s*[:=]\s*false\b|\bnon[- ]retryable\b)/i.test(message)
      if (signal.aborted || attempt === maxAttempts || nonRetryable || classifyFailure(error) !== 'transient') {
        throw error
      }
      await delay(100 * attempt, undefined, { signal })
    }
  }
  throw new Error('unreachable read-only retry state')
}

/**
 * Git execution evidence checks shared by status, diff, worktree operations,
 * delivery verification and GitHub remote discovery.
 *
 * This module interprets a completed result only. It NEVER decides whether
 * a Host subprocess is authorized, chooses the executable, or supplies a
 * Node fallback; callers retain their existing Host-only decisions.
 */
export interface GitExecutionResult {
  exitCode: number | null
  timedOut: boolean
  signal: string | null
  lossy?: boolean
}

/** The command completed successfully; stdout may still be truncated. */
export function hasSuccessfulGitExit(result: GitExecutionResult): boolean {
  return result.exitCode === 0 && !result.timedOut && !result.signal
}

/** Suitable for operations that require COMPLETE, non-truncated Git evidence. */
export function hasCompleteGitEvidence(result: GitExecutionResult): boolean {
  return hasSuccessfulGitExit(result) && !result.lossy
}

/** Preserve operation-specific errors and allow partial output for git diff. */
export function assertGitExit(result: GitExecutionResult, operation: string): void {
  if (result.timedOut) throw new Error(operation + ': git command timed out')
  if (result.signal) throw new Error(operation + ': git command terminated by signal')
  if (result.exitCode !== 0) {
    throw new Error(operation + ': git command failed with exit code ' + String(result.exitCode))
  }
}

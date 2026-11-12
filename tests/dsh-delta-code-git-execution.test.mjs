import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertGitExit, hasCompleteGitEvidence, hasSuccessfulGitExit,
} from '../packages/dsh-delta-code/lib/tools/git-execution.js'

const good = { exitCode: 0, timedOut: false, signal: null, lossy: false }

describe('Git execution result evidence contract', () => {
  it('accepts a complete zero-exit result', () => {
    assert.equal(hasSuccessfulGitExit(good), true)
    assert.equal(hasCompleteGitEvidence(good), true)
    assert.doesNotThrow(() => assertGitExit(good, 'code_git_status'))
  })

  it('distinguishes truncated diffs from complete status/Host evidence', () => {
    const truncated = { ...good, lossy: true }
    assert.equal(hasSuccessfulGitExit(truncated), true)
    assert.equal(hasCompleteGitEvidence(truncated), false)
    // git_diff can return partial text with truncated=true, but worktree,
    // origin and delivery checks must reject incomplete evidence.
    assert.doesNotThrow(() => assertGitExit(truncated, 'code_git_diff'))
  })

  it('rejects every failure class, including unknown/null exit status', () => {
    const invalid = [
      [{ ...good, exitCode: 128 }, /exit code 128/],
      [{ ...good, exitCode: null }, /exit code null/],
      [{ ...good, timedOut: true }, /timed out/],
      [{ ...good, signal: 'SIGKILL' }, /terminated by signal/],
    ]
    for (const [result, pattern] of invalid) {
      assert.equal(hasSuccessfulGitExit(result), false)
      assert.equal(hasCompleteGitEvidence(result), false)
      assert.throws(() => assertGitExit(result, 'code_git_status'), pattern)
    }
  })

  it('does not classify incomplete output as complete when exit is successful', () => {
    assert.equal(hasCompleteGitEvidence({ ...good, lossy: true }), false)
    assert.equal(hasCompleteGitEvidence({ ...good, timedOut: true, lossy: false }), false)
  })
})

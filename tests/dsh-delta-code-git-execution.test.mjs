import { describe, it } from 'node:test'
import { assessProcessOutcome } from '../packages/dsh-delta-code/lib/delta-code-adapter/contracts/process-outcome.js'
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

describe('Delta Code completed subprocess evidence', () => {
  it('requires complete zero-exit evidence before calling a process successful', () => {
    assert.deepEqual(assessProcessOutcome(good), {
      status: 'succeeded', complete: true, reason: 'clean-exit',
    })
  })

  it('does not accept signaled, timed-out or malformed Host outcomes', () => {
    for (const result of [
      null, undefined, {},
      { ...good, exitCode: null },
      { ...good, exitCode: -1 },
      { ...good, exitCode: undefined },
      { ...good, signal: undefined },
      { ...good, signal: 'SIGTERM' },
      { ...good, timedOut: undefined },
      { ...good, timedOut: true },
      { ...good, exitCode: NaN },
    ]) {
      assert.equal(assessProcessOutcome(result).status, 'uncertain')
      assert.equal(assessProcessOutcome(result).complete, false)
    }
  })

  it('distinguishes nonzero exit from success with incomplete output', () => {
    assert.deepEqual(assessProcessOutcome({ ...good, exitCode: 1 }), {
      status: 'failed', complete: false, reason: 'nonzero-exit',
    })
    assert.deepEqual(assessProcessOutcome({ ...good, lossy: true }), {
      status: 'succeeded', complete: false, reason: 'incomplete-output',
    })
    assert.equal(assessProcessOutcome({ ...good, lossy: undefined }).complete, false)
  })
})

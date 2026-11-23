import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGitSyncTool } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/git-sync.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'
import { describe, it } from 'node:test'
import { assessProcessOutcome } from '../packages/delta-code/lib/delta-code-adapter/contracts/process-outcome.js'
import assert from 'node:assert/strict'
import {
  assertGitExit, hasCompleteGitEvidence, hasSuccessfulGitExit,
} from '../packages/delta-code/lib/tools/git-execution.js'

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

const BASE = '1'.repeat(40)
const TARGET = '2'.repeat(40)
const BACKUP = '3'.repeat(40)
const exec = () => ({ signal: new AbortController().signal })

function hostResponse(stdout, exitCode = 0) {
  return {
    done: Promise.resolve({ exitCode, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'delta-code-guarded-sync-'))
  const state = {
    head: BASE, branch: options.branch ?? 'main',
    dirty: options.dirty === true, stash: '', calls: [],
  }
  const ctx = {
    get: () => undefined,
    subprocess: {
      spawn(spec) {
        const args = spec.argv.slice(1)
        const cmd = args[0]
        state.calls.push(args)
        if (options.denyHost) throw new Error('Host denied Git subprocess')
        if (cmd === 'symbolic-ref') return hostResponse(state.branch + '\n')
        if (cmd === 'remote') return hostResponse('https://github.com/example/repo.git\n')
        if (cmd === 'status') return hostResponse(state.dirty
          ? '## main\0?? local.txt\0' : '## main\0')
        if (cmd === 'fetch') return hostResponse('', options.failFetch ? 128 : 0)
        if (cmd === 'rev-parse' && args.includes('HEAD')) return hostResponse(state.head + '\n')
        if (cmd === 'rev-parse' && args.includes('FETCH_HEAD^{commit}')) return hostResponse(TARGET + '\n')
        if (cmd === 'rev-parse' && args.includes('refs/stash')) {
          return hostResponse(state.stash ? state.stash + '\n' : '', state.stash ? 0 : 1)
        }
        if (cmd === 'stash') {
          state.stash = BACKUP
          state.dirty = false
          return hostResponse('saved\n')
        }
        if (cmd === 'reset') {
          state.head = args[2]
          return hostResponse('reset\n')
        }
        throw new Error('Unexpected Git command: ' + spec.argv.join(' '))
      },
    },
  }
  const settings = normalizeConfig({
    workspaceRoot: root, execution: { allowCommands: true },
  })
  return {
    tool: createGitSyncTool(ctx, settings), state, root,
    async dispose() { await rm(root, { recursive: true, force: true }) },
  }
}

describe('Delta Code guarded Git sync', () => {
  it('never resets or cleans after a failed fetch', async () => {
    const f = await fixture({ failFetch: true, dirty: true })
    try {
      const plan = await f.tool.execute({ action: 'preview', branch: 'main' }, exec())
      await assert.rejects(f.tool.execute({
        action: 'sync', branch: 'main', planId: plan.planId, preserveChanges: true,
      }, exec()), /fetch failed/)
      assert.equal(f.state.head, BASE)
      assert.equal(f.state.dirty, true)
      assert.ok(f.state.calls.some(args => args[0] === 'fetch'))
      assert.ok(!f.state.calls.some(args => ['stash', 'reset', 'clean'].includes(args[0])))
    } finally { await f.dispose() }
  })

  it('refuses wrong branch and missing or reused preview plans', async () => {
    const f = await fixture()
    try {
      await assert.rejects(f.tool.execute({ action: 'preview', branch: 'feature' }, exec()),
        /refusing to reset a different branch/)
      await assert.rejects(f.tool.execute({ action: 'sync', branch: 'main' }, exec()), /plan missing/)
      const plan = await f.tool.execute({ action: 'preview', branch: 'main' }, exec())
      await f.tool.execute({ action: 'sync', branch: 'main', planId: plan.planId }, exec())
      await assert.rejects(f.tool.execute({
        action: 'sync', branch: 'main', planId: plan.planId,
      }, exec()), /plan missing/)
    } finally { await f.dispose() }
  })

  it('preserves dirty changes before reset and reports the exact backup commit', async () => {
    const f = await fixture({ dirty: true })
    try {
      const plan = await f.tool.execute({ action: 'preview', branch: 'main' }, exec())
      await assert.rejects(f.tool.execute({
        action: 'sync', branch: 'main', planId: plan.planId,
      }, exec()), /dirty/)
      const second = await f.tool.execute({ action: 'preview', branch: 'main' }, exec())
      const result = await f.tool.execute({
        action: 'sync', branch: 'main', planId: second.planId, preserveChanges: true,
      }, exec())
      assert.equal(result.head, TARGET)
      assert.equal(result.backupSha, BACKUP)
      assert.equal(result.clean, true)
      assert.ok(f.state.calls.findIndex(args => args[0] === 'fetch') <
        f.state.calls.findIndex(args => args[0] === 'stash'))
      assert.ok(f.state.calls.findIndex(args => args[0] === 'stash') <
        f.state.calls.findIndex(args => args[0] === 'reset'))
      assert.ok(!f.state.calls.some(args => args[0] === 'clean'))
    } finally { await f.dispose() }
  })

  it('never falls back to local Node execution after Host denial', async () => {
    const f = await fixture({ denyHost: true })
    try {
      await assert.rejects(f.tool.execute({ action: 'preview', branch: 'main' }, exec()),
        /Host denied Git subprocess/)
      assert.equal(f.state.head, BASE)
      assert.equal(f.state.calls.length, 1)
    } finally { await f.dispose() }
  })

  it('rejects option injection in remote and branch parameters', async () => {
    const f = await fixture()
    try {
      await assert.rejects(f.tool.execute({ action: 'preview', branch: '--exec' }, exec()), /unsafe Git branch/)
      await assert.rejects(f.tool.execute({
        action: 'preview', branch: 'main', remote: '--upload-pack=malicious',
      }, exec()), /unsafe Git remote/)
      assert.equal(f.state.calls.length, 0)
    } finally { await f.dispose() }
  })
})

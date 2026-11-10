import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { lstat, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorktreeTool } from '../packages/dsh-delta-code/lib/tools/worktree.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const exec = { signal: new AbortController().signal }

function host(root, spawn) {
  const ctx = { get: () => undefined, subprocess: { spawn } }
  const settings = normalizeConfig({
    workspaceRoot: root,
    execution: { allowWorktreeWrites: true },
  })
  return createWorktreeTool(ctx, settings)
}

describe('Code Worker worktree Host write authority', () => {
  it('leaves the workspace unchanged when the Host refuses worktree creation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-denied-'))
    let calls = 0
    try {
      const tool = host(root, () => {
        calls += 1
        throw new Error('host denied worktree creation')
      })
      await assert.rejects(
        tool.execute({ action: 'create', task: 'denied' }, exec),
        /host denied worktree creation/,
      )
      assert.equal(calls, 1)
      await assert.rejects(lstat(join(root, '.dsh-delta-code')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a symlinked worktree parent outside the workspace before invoking the Host', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-worktree-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-worktree-outside-'))
    let calls = 0
    try {
      await symlink(outside, join(root, '.dsh-delta-code'), 'dir')
      const tool = host(root, () => { calls += 1; throw new Error('unexpected Host invocation') })
      await assert.rejects(
        tool.execute({ action: 'create', task: 'escape' }, exec),
        /worktree storage escapes workspace/,
      )
      assert.equal(calls, 0)
      await assert.rejects(lstat(join(outside, 'worktrees')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

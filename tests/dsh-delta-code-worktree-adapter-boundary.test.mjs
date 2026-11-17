import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createWorktreeTool as legacyTool, validateWorktreeName as legacyValidate,
} from '../packages/dsh-delta-code/lib/tools/worktree.js'
import {
  createWorktreeTool as repositoryTool, validateWorktreeName as repositoryValidate,
} from '../packages/dsh-delta-code/lib/delta-code-repository/worktree.js'
import { createWorktreeTool as adapterTool } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/worktree.js'
import { validateWorktreeName as pureValidate } from '../packages/dsh-delta-code/lib/delta-code-repository/worktree-policy.js'

describe('Delta Code worktree Host adapter boundary', () => {
  it('preserves legacy tool identity and pure task/ref validation exports', () => {
    assert.strictEqual(legacyTool, adapterTool)
    assert.strictEqual(repositoryTool, adapterTool)
    assert.strictEqual(legacyValidate, pureValidate)
    assert.strictEqual(repositoryValidate, pureValidate)
  })

  it('isolates DSH subprocess and Host FS target checks inside the adapter', () => {
    const root = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-repository/worktree.ts', root), 'utf8')
    const policy = readFileSync(new URL('delta-code-repository/worktree-policy.ts', root), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/worktree.ts', root), 'utf8')
    const registry = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', root), 'utf8')
    for (const src of [facade, policy]) {
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'requireHostFs(', 'defineTool(', 'node:fs', 'Context']) {
        assert.equal(src.includes(forbidden), false, forbidden)
      }
    }
    assert.ok(adapter.includes("requireHostFs(ctx, ['resolve', 'contains', 'stat', 'lstat', 'processPath']"))
    assert.ok(adapter.includes("hostOnly: true"))
    assert.ok(adapter.includes('managed worktree has uncommitted changes'))
    assert.ok(adapter.includes('worktree storage escapes Host workspace'))
    assert.ok(registry.includes("from './worktree.js'"))
  })

  it('still rejects unsafe task IDs and base refs', () => {
    assert.doesNotThrow(() => pureValidate('task-123', 'feature/ok'))
    for (const task of ['../escape', '', 'BadUppercase', 'a'.repeat(65)]) {
      assert.throws(() => pureValidate(task, 'HEAD'), /invalid worktree task slug/)
    }
    for (const ref of ['--force', '../escape', 'refs//broken', 'feature.lock', '@']) {
      assert.throws(() => pureValidate('test', ref), /invalid base branch or commit/)
    }
  })
})

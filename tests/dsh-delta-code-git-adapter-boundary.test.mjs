import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createGitStatusTool as legacyStatus, createGitDiffTool as legacyDiff, parseGitStatus as legacyParse,
} from '../packages/dsh-delta-code/lib/tools/git.js'
import {
  createGitStatusTool as repositoryStatus, createGitDiffTool as repositoryDiff, parseGitStatus as repositoryParse,
} from '../packages/dsh-delta-code/lib/delta-code-repository/git.js'
import {
  createGitStatusTool as adapterStatus, createGitDiffTool as adapterDiff,
} from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/git.js'
import { parseGitStatus as pureParse } from '../packages/dsh-delta-code/lib/delta-code-repository/git-status-policy.js'

describe('Delta Code Git Host execution Adapter boundary', () => {
  it('preserves old tool exports and pure status parser identity', () => {
    assert.strictEqual(legacyStatus, adapterStatus)
    assert.strictEqual(repositoryStatus, adapterStatus)
    assert.strictEqual(legacyDiff, adapterDiff)
    assert.strictEqual(repositoryDiff, adapterDiff)
    assert.strictEqual(legacyParse, pureParse)
    assert.strictEqual(repositoryParse, pureParse)
  })

  it('keeps subprocess and DSH Context isolated from Repository tool facade', () => {
    const root = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-repository/git.ts', root), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/git.ts', root), 'utf8')
    const registry = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', root), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'runCommand(', 'requireHostFs(', 'defineTool(', 'lookupDshHostFs(', 'Context']) {
      assert.equal(facade.includes(forbidden), false, forbidden)
    }
    assert.ok(adapter.includes('resolveAuthorizedGitCwd(ctx, root, args.cwd, exec)'))
    assert.ok(adapter.includes('assertGitExit(result'))
    assert.ok(adapter.includes("if (result.lossy) throw new Error('code_git_status"))
    assert.ok(adapter.includes('git diff path escapes selected repository'))
    assert.ok(adapter.includes('isSubprocessMounted(ctx)'))
    assert.ok(registry.includes("from './git.js'"))
  })
})

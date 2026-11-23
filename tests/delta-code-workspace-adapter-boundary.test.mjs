import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createWorkspaceMapTool as legacyTool, rankTrackedFiles as legacyRank,
} from '../packages/delta-code/lib/tools/workspace.js'
import {
  createWorkspaceMapTool as repositoryTool, rankTrackedFiles as repositoryRank,
} from '../packages/delta-code/lib/delta-code-repository/workspace.js'
import { createWorkspaceMapTool as adapterTool } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/workspace.js'
import {
  rankTrackedFiles as policyRank, parseBatchQueries, workspaceMapResult,
} from '../packages/delta-code/lib/delta-code-repository/workspace-policy.js'

describe('Delta Code Workspace discovery Host adapter boundary', () => {
  it('preserves public tool and ranked-file function identity', () => {
    assert.strictEqual(legacyTool, adapterTool)
    assert.strictEqual(repositoryTool, adapterTool)
    assert.strictEqual(legacyRank, policyRank)
    assert.strictEqual(repositoryRank, policyRank)
  })

  it('holds Git Host FS and subprocess only inside the DSH Adapter', () => {
    const root = new URL('../packages/delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-repository/workspace.ts', root), 'utf8')
    const policy = readFileSync(new URL('delta-code-repository/workspace-policy.ts', root), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/workspace.ts', root), 'utf8')
    const factory = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', root), 'utf8')
    for (const source of [facade, policy]) {
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'requireHostFs(', 'defineTool(', 'node:fs', 'Context']) {
        assert.equal(source.includes(forbidden), false, forbidden)
      }
    }
    assert.ok(adapter.includes("requireHostFs(ctx, ['resolve', 'contains', 'listDir', 'lstat', 'processPath']"))
    assert.ok(adapter.includes("args: ['ls-files', '-z', '--cached']"))
    assert.ok(adapter.includes('unsafe Git tracked-file path'))
    assert.ok(factory.includes("from './workspace.js'"))
  })

  it('enforces bounded, deterministic batch selection without Host access', () => {
    assert.deepEqual(parseBatchQueries([' TypeScript ', 'rust'], undefined), ['TypeScript', 'rust'])
    assert.throws(() => parseBatchQueries(['TEST', 'test'], undefined), /duplicates/)
    assert.throws(() => parseBatchQueries(['a'], 'old'), /mutually exclusive/)
    assert.throws(() => parseBatchQueries(['a\\b'], undefined), /safe nonempty/)
    assert.equal(parseBatchQueries(undefined, 'single'), undefined)
    const paths = ['src/main.ts', 'Cargo.toml', 'README.md']
    assert.deepEqual(policyRank(paths, 'main', 5), ['src/main.ts'])
    const result = workspaceMapResult(paths, ['.'], '', 2, ['main', 'readme'])
    assert.equal(result.total, 3)
    assert.equal(result.selected.length, 0)
    assert.deepEqual(result.queryResults.map(x => x.selected), [['src/main.ts'], ['README.md']])
    assert.equal(result.truncated, false)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveAuthorizedGitCwd as legacy } from '../packages/dsh-delta-code/lib/tools/host-git-cwd.js'
import { resolveAuthorizedGitCwd as repository } from '../packages/dsh-delta-code/lib/delta-code-repository/host-git-cwd.js'
import { resolveAuthorizedGitCwd as dsh } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/host-git-cwd.js'

describe('Delta Code Host Git cwd adapter boundary', () => {
  it('retains the exact same authoritative implementation through old entrypoints', () => {
    assert.equal(legacy, dsh)
    assert.equal(repository, dsh)
    const facade = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-repository/host-git-cwd.ts', import.meta.url), 'utf8')
    const adapter = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-adapter/providers/dsh/host-git-cwd.ts', import.meta.url), 'utf8')
    assert.equal(facade.includes('export { resolveAuthorizedGitCwd }'), true)
    for (const forbidden of ['@deepseek-ai', 'requireHostFs(', 'realpath(', 'processPath(']) {
      assert.equal(facade.includes(forbidden), false, forbidden)
    }
    assert.equal(adapter.includes("from './host-fs.js'"), true)
    assert.equal(adapter.includes("['resolve', 'contains', 'stat', 'processPath']"), true)
  })
})

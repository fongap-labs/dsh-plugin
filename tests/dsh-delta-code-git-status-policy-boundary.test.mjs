import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGitStatus as legacy } from '../packages/dsh-delta-code/lib/tools/git.js'
import { parseGitStatus as repository } from '../packages/dsh-delta-code/lib/delta-code-repository/git.js'
import { parseGitStatus as policy } from '../packages/dsh-delta-code/lib/delta-code-repository/git-status-policy.js'

describe('Delta Code pure Git status policy boundary', () => {
  it('keeps old import paths referencing the same parser implementation', () => {
    assert.equal(legacy, policy)
    assert.equal(repository, policy)
    const src = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-repository/git-status-policy.ts', import.meta.url), 'utf8')
    const executor = readFileSync(new URL('../packages/dsh-delta-code/src/delta-code-repository/git.ts', import.meta.url), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'runCommand(', 'Context', 'node:fs', 'process.env']) {
      assert.equal(src.includes(forbidden), false, forbidden)
    }
    assert.equal(executor.includes("from './git-status-policy.js'"), true)
    assert.equal(executor.includes('export function parseGitStatus('), false)
  })

  it('preserves strict parsing and explicit dirty-state evidence', () => {
    assert.deepEqual(policy('## feature...origin/feature [ahead 2, behind 1]\0 M edited.ts\0?? new.ts\0'), {
      branch: 'feature', ahead: 2, behind: 1, staged: [],
      unstaged: ['M edited.ts'], untracked: ['new.ts'], clean: false,
    })
    assert.equal(policy('## main\0').clean, true)
    for (const raw of ['', '## main', '## main\0\0', '## main\0R  moved.ts\0', '## main\0Z  invalid.ts\0']) {
      assert.throws(() => policy(raw), /invalid|incomplete|missing/)
    }
  })
})

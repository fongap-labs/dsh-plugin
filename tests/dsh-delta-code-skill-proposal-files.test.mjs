import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile, lstat } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import {
  pendingSkillProposalPath, validatePendingSkillProposal,
} from '../packages/dsh-delta-code/lib/delta-code-strategy/skill-proposal-policy.js'

const dir = resolve('packages/dsh-delta-code/skill-proposals')

describe('Delta Code inert Skill proposal CI admission', () => {
  it('verifies every staged Skill manifest without enabling or loading it', async () => {
    let names
    try { names = await readdir(dir) } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      names = []
    }
    assert.ok(names.length <= 100, 'bounded staged proposal inventory')
    for (const name of names) {
      assert.match(name, /^[a-z0-9.-]+\.json$/, 'No script or unexpected file type')
      const file = resolve(dir, name)
      const stat = await lstat(file)
      assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Proposal files must be regular data')
      assert.ok(stat.size <= 4096, 'Proposal file must remain bounded')
      const document = JSON.parse(await readFile(file, 'utf8'))
      const proposal = validatePendingSkillProposal(document)
      assert.equal(basename(pendingSkillProposalPath(proposal)), name)
      assert.equal(proposal.autoEnabled, false)
      assert.equal(proposal.executable, false)
      assert.equal(proposal.approvalRequired, true)
    }
  })
})

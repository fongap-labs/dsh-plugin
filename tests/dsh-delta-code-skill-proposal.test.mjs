import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  makePendingSkillProposal, validatePendingSkillProposal, pendingSkillProposalPath,
} from '../packages/dsh-delta-code/lib/delta-code-strategy/skill-proposal-policy.js'
import { createSkillAdmissionProposalSpecs } from '../packages/dsh-delta-code/lib/delta-code-repository/github-skill-admission-proposal.js'

const COMMIT = 'a'.repeat(40)
const TREE = 'b'.repeat(40)
const BRANCH_HEAD = 'c'.repeat(40)
const FIRST_COMMIT = 'd'.repeat(40)
const FINAL_COMMIT = 'e'.repeat(40)
const blob = text => {
  const bytes = Buffer.from(text)
  return {
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
    content: bytes.toString('base64'), encoding: 'base64', size: bytes.length,
  }
}
const LICENSE = blob('MIT License\nPermission is hereby granted, free of charge.\n')
const source = content => blob('---\nname: react-guide\ndescription: Coding guide\n---\n\n' + content)
const CLEAN = source('# React guide\nUse built-in functions.')
const auditArgs = sourceBlob => ({
  repository: 'alpha/skills', path: 'skills/react-guide/SKILL.md', commit: COMMIT,
  sourceBlobSha: sourceBlob.sha, licenseBlobSha: LICENSE.sha,
  targetRepository: 'maintainer/dsh-plugin', submit: true,
})
function fixture(sourceBlob = CLEAN, enabled = true) {
  const calls = []
  let ownerRequests = 0
  let publicRequests = 0
  const transport = {
    async request() { ownerRequests++; throw Error('source owner credential MUST NOT be used') },
    async publicRead(path, signal) {
      signal.throwIfAborted()
      publicRequests++
      if (path.endsWith('/commits/' + COMMIT)) {
        return { sha: COMMIT, commit: { tree: { sha: TREE } } }
      }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', sha: LICENSE.sha, mode: '100644', type: 'blob' },
        { path: 'skills/react-guide/SKILL.md', sha: sourceBlob.sha, mode: '100644', type: 'blob' },
      ] }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + sourceBlob.sha)) return sourceBlob
      throw Error('Unexpected public endpoint ' + path)
    },
  }
  const envelope = (result) => ({ repository: 'maintainer/dsh-plugin', account: 'maintainer',
    result: JSON.stringify(result) })
  const actions = {
    file: { async execute(args) {
      calls.push(['file', args])
      assert.equal(args.repository, 'maintainer/dsh-plugin')
      return envelope({ path: 'CHANGELOG.md', content: '# Changelog\n\n## [Unreleased]\n\n- Existing change\n' })
    } },
    branch: { async execute(args) {
      calls.push(['branch', args])
      assert.match(args.branch, /^chore\/skill-proposal-[a-f0-9-]+$/)
      return envelope({ branch: args.branch, sha: BRANCH_HEAD })
    } },
    commitFile: { async execute(args) {
      calls.push(['commit', args])
      if (args.path === 'CHANGELOG.md') {
        assert.equal(args.expectedHead, FIRST_COMMIT)
        assert.match(args.content, /stage pinned free Skill proposal/)
        return envelope({ path: args.path, commit: FINAL_COMMIT })
      }
      assert.equal(args.expectedHead, BRANCH_HEAD)
      const proposal = validatePendingSkillProposal(JSON.parse(args.content))
      assert.equal(proposal.source.repository, 'alpha/skills')
      assert.equal(proposal.autoEnabled, false)
      assert.equal(proposal.executable, false)
      assert.equal(args.path, pendingSkillProposalPath(proposal))
      return envelope({ path: args.path, commit: FIRST_COMMIT })
    } },
    createPr: { async execute(args) {
      calls.push(['pr', args])
      assert.match(args.body, /Static review is not a security approval/)
      assert.equal(args.repository, 'maintainer/dsh-plugin')
      return envelope({ number: 42, url: 'https://github.com/maintainer/dsh-plugin/pull/42', reused: false })
    } },
  }
  return {
    calls, tool: createSkillAdmissionProposalSpecs(transport, actions, () => enabled)[0],
    exec: { signal: new AbortController().signal },
    get ownerRequests() { return ownerRequests },
    get publicRequests() { return publicRequests },
  }
}

describe('Delta Code CI-only public Skill proposal admission', () => {
  it('re-audits immutable public evidence and prepares an inert manifest and PR', async () => {
    const h = fixture()
    const response = JSON.parse((await h.tool.execute(auditArgs(CLEAN), h.exec)).result)
    assert.deepEqual(h.calls.map(x => x[0]), ['branch', 'file', 'commit', 'commit', 'pr'])
    assert.equal(h.publicRequests, 4)
    assert.equal(h.ownerRequests, 0)
    assert.equal(response.pr.number, 42)
    assert.equal(response.state, 'pending-ci-review')
    assert.equal(response.approvalRequired, true)
    assert.equal(response.autoEnabled, false)
    assert.equal(response.executable, false)
    assert.equal(response.head, FINAL_COMMIT)
  })

  it('fails closed before network writes without submit or configured GitHub writes', async () => {
    const h = fixture()
    await assert.rejects(h.tool.execute({ ...auditArgs(CLEAN), submit: false }, h.exec), /submit=true/)
    assert.deepEqual(h.calls, [])
    assert.equal(h.publicRequests, 0)
    const disabled = fixture(CLEAN, false)
    await assert.rejects(disabled.tool.execute(auditArgs(CLEAN), disabled.exec), /writes are disabled/)
    assert.deepEqual(disabled.calls, [])
    assert.equal(disabled.publicRequests, 0)
    await assert.rejects(h.tool.execute({ ...auditArgs(CLEAN), targetRepository: '../other' }, h.exec), /Invalid Skill proposal target/)
  })

  it('blocks paid or risky source without creating a branch or borrowing a source Token', async () => {
    for (const [text, expected] of [
      ['Requires a paid API subscription.', /additional security\/free-use review/],
      ['Run bash with GITHUB_TOKEN.', /additional security\/free-use review/],
    ]) {
      const candidate = source('# Guide\n' + text)
      const h = fixture(candidate)
      await assert.rejects(h.tool.execute(auditArgs(candidate), h.exec), expected)
      assert.deepEqual(h.calls, [])
      assert.equal(h.ownerRequests, 0)
      assert.equal(h.publicRequests, 4)
    }
  })

  it('rejects malformed or forged persisted proposals, and never promotes them to an active provider', () => {
    const good = makePendingSkillProposal({
      candidate: auditArgs(CLEAN), license: 'MIT',
      freeEligibility: { eligible: true, status: 'free-evidence' },
      riskIndicators: [], reviewStatus: 'static-review-ready',
      approvalRequired: true, autoEnabled: false, executable: false,
    })
    assert.deepEqual(validatePendingSkillProposal(JSON.parse(JSON.stringify(good))), good)
    for (const invalid of [
      { ...good, autoEnabled: true },
      { ...good, executable: true },
      { ...good, state: 'approved' },
      { ...good, extra: 'prompt injection' },
      { ...good, source: { ...good.source, commit: 'main' } },
      { ...good, source: { ...good.source, repository: '../other' } },
      { ...good, source: { ...good.source, license: 'Proprietary' } },
    ]) assert.throws(() => validatePendingSkillProposal(invalid))
    assert.match(pendingSkillProposalPath(good), /^packages\/dsh-delta-code\/skill-proposals\//)
  })
})

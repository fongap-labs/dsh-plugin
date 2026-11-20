import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPublicSkillAuditSpecs } from '../packages/dsh-delta-code/lib/delta-code-repository/github-skill-public-audit.js'
import { createPublicSkillDiscoverySpecs } from '../packages/dsh-delta-code/lib/delta-code-repository/github-skill-public-discovery.js'

const COMMIT = 'a'.repeat(40)
const TREE = 'b'.repeat(40)
function blob(text) {
  const bytes = Buffer.from(text)
  return {
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
    content: bytes.toString('base64'), encoding: 'base64', size: bytes.length,
  }
}
const LICENSE = blob('MIT License\nPermission is hereby granted, free of charge.\n')
const skill = text => blob('---\nname: react-guide\ndescription: Static developer reference\n---\n\n' + text)
const CLEAN = skill('# React guide\nUse built-in functions.')
const PAID = skill('# React guide\nRequires a paid API subscription.')
const RISKY = skill('# React guide\nRun bash script with GITHUB_TOKEN.')
const input = (source = CLEAN) => ({
  repository: 'alpha/skills', path: 'skills/react-guide/SKILL.md', commit: COMMIT,
  sourceBlobSha: source.sha, licenseBlobSha: LICENSE.sha,
})

function setup(source = CLEAN, options = {}) {
  const calls = []
  let authenticated = 0
  const transport = {
    async request() { authenticated++; throw Error('Owner-bound GitHub access forbidden') },
    async publicRead(path, signal) {
      signal.throwIfAborted()
      calls.push(path)
      if (options.override) return options.override(path)
      if (path.startsWith('/search/repositories?')) return {
        total_count: 1, items: [{
          full_name: 'alpha/skills', private: false, archived: false, disabled: false,
          default_branch: 'main', license: { spdx_id: 'MIT' },
          stargazers_count: 5, forks_count: 1, description: 'React Skills',
        }],
      }
      if (path.endsWith('/commits/main') || path.endsWith('/commits/' + COMMIT)) {
        return { sha: COMMIT, commit: { tree: { sha: TREE } } }
      }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', type: 'blob', mode: '100644', sha: LICENSE.sha },
        { path: 'skills/react-guide/SKILL.md', type: 'blob', mode: options.mode ?? '100644', sha: source.sha },
      ] }
      if (path.endsWith('/git/blobs/' + source.sha)) return source
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path === '/users/alpha') return { login: 'alpha', created_at: '2020-01-01T00:00:00Z' }
      throw Error('Unexpected anonymous endpoint: ' + path)
    },
  }
  return {
    calls, transport, get authenticated() { return authenticated },
    audit: createPublicSkillAuditSpecs(transport)[0],
    discover: createPublicSkillDiscoverySpecs(transport)[0],
    exec: { signal: new AbortController().signal },
  }
}
const parse = value => JSON.parse(value.result)

describe('Delta Code anonymous public Skill static audit', () => {
  it('reviews a discovered pinned free Skill without granting execution authority', async () => {
    const h = setup()
    const discovered = parse(await h.discover.execute({ query: 'react' }, h.exec))
    assert.equal(discovered.candidates.length, 1)
    const candidate = discovered.candidates[0]
    const reviewed = await h.audit.execute({
      repository: candidate.repository, path: candidate.path, commit: candidate.suggestedCommit,
      sourceBlobSha: candidate.sourceBlobSha, licenseBlobSha: candidate.freeEvidence.licenseBlobSha,
    }, h.exec)
    const report = parse(reviewed)
    assert.equal(reviewed.account, 'anonymous')
    assert.equal(report.reviewStatus, 'static-review-ready')
    assert.equal(report.freeEligibility.eligible, true)
    assert.equal(report.license, 'MIT')
    assert.deepEqual(report.riskIndicators, [])
    assert.equal(report.apiCalls, 4)
    assert.equal(report.approvalRequired, true)
    assert.equal(report.autoEnabled, false)
    assert.equal(report.executable, false)
    assert.equal(Object.hasOwn(report, 'sourceContent'), false)
    assert.equal(h.authenticated, 0)
    assert.ok(h.calls.every(x => x.startsWith('/repos/alpha/') ||
      x.startsWith('/search/repositories?') || x === '/users/alpha'))
  })

  it('accepts a verified free local license but rejects root-license substitution', async () => {
    const h = setup(CLEAN, { override(path) {
      if (path.endsWith('/commits/' + COMMIT)) return {
        sha: COMMIT, commit: { tree: { sha: TREE } },
      }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', type: 'blob', mode: '100644', sha: LICENSE.sha },
        { path: 'react-guide/LICENSE.txt', type: 'blob', mode: '100644', sha: LICENSE.sha },
        { path: 'react-guide/SKILL.md', type: 'blob', mode: '100644', sha: CLEAN.sha },
      ] }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + CLEAN.sha)) return CLEAN
      throw Error('Unexpected pinned lookup ' + path)
    } })
    const report = parse(await h.audit.execute({
      ...input(), path: 'react-guide/SKILL.md',
    }, h.exec))
    assert.equal(report.reviewStatus, 'static-review-ready')
    assert.equal(report.license, 'MIT')
    assert.equal(h.authenticated, 0)

    const restrictive = blob('All rights reserved. Permission denied.')
    const other = setup(CLEAN, { override(path) {
      if (path.endsWith('/commits/' + COMMIT)) return {
        sha: COMMIT, commit: { tree: { sha: TREE } },
      }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', type: 'blob', mode: '100644', sha: LICENSE.sha },
        { path: 'react-guide/LICENSE.txt', type: 'blob', mode: '100644', sha: restrictive.sha },
        { path: 'react-guide/SKILL.md', type: 'blob', mode: '100644', sha: CLEAN.sha },
      ] }
      throw Error('Unexpected pinned lookup ' + path)
    } })
    await assert.rejects(other.audit.execute({
      ...input(), path: 'react-guide/SKILL.md',
    }, other.exec), /immutable blob SHA mismatch/)
  })

  it('rejects paid dependencies and reports risky instructions as indicators, not approval', async () => {
    for (const [source, expected] of [
      [PAID, 'excluded-paid-or-unknown'],
      [RISKY, 'manual-security-review-required'],
    ]) {
      const h = setup(source)
      const r = parse(await h.audit.execute(input(source), h.exec))
      assert.equal(r.reviewStatus, expected)
      assert.equal(r.approvalRequired, true)
      assert.equal(r.autoEnabled, false)
      assert.equal(h.authenticated, 0)
      if (source === RISKY) {
        assert.ok(r.riskIndicators.includes('external-command-or-installation'))
        assert.ok(r.riskIndicators.includes('credential-or-secret-access'))
      }
    }
  })

  it('audits pinned secondary Markdown without granting bundle approval', async () => {
    const parent = skill('# React guide\\nRead [guide](references/guide.md#intro).')
    const guide = blob('# Read-only guide\\nSee [nested](next.md) before use.')
    const transport = setup(parent, { override(path) {
      if (path.endsWith('/commits/' + COMMIT)) return {
        sha: COMMIT, commit: { tree: { sha: TREE } },
      }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', type: 'blob', mode: '100644', sha: LICENSE.sha },
        { path: 'skills/react-guide/SKILL.md', type: 'blob', mode: '100644', sha: parent.sha },
        { path: 'skills/react-guide/references/guide.md', type: 'blob', mode: '100644', sha: guide.sha },
      ] }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + parent.sha)) return parent
      if (path.endsWith('/git/blobs/' + guide.sha)) return guide
      throw Error('Unexpected pinned reference endpoint: ' + path)
    } })
    const report = parse(await transport.audit.execute(input(parent), transport.exec))
    assert.equal(report.reviewStatus, 'pending-reference-bundle-review')
    assert.equal(report.bundleApprovalRequired, true)
    assert.equal(report.approvalRequired, true)
    assert.equal(report.autoEnabled, false)
    assert.equal(report.executable, false)
    assert.equal(report.referenceEvidence.length, 1)
    assert.deepEqual(report.referenceEvidence[0], {
      path: 'skills/react-guide/references/guide.md',
      blobSha: guide.sha,
      byteLength: Buffer.byteLength('# Read-only guide\\nSee [nested](next.md) before use.'),
      riskIndicators: [],
      hasUnreviewedDependencies: true,
      hasPaidRequirement: false,
    })
    assert.equal(report.apiCalls, 5)
    assert.equal(transport.authenticated, 0)
    assert.equal(JSON.stringify(report).includes('Read-only guide'), false,
      'untrusted secondary instructions must not leak into tool output')
  })

  it('rejects executable, traversing, absent, symlinked and conflicting-license references', async () => {
    for (const link of ['../secrets.md', 'scripts/run.sh', '/tmp/secret.md',
      'guide.md?raw=1', 'https:%2f%2fexample.com/a.md', 'SKILL.md']) {
      const candidate = skill('# React guide\\nSee [reference](' + link + ')')
      const h = setup(candidate)
      await assert.rejects(h.audit.execute(input(candidate), h.exec),
        /secondary Skill reference|reference lacks immutable/)
      assert.equal(h.authenticated, 0)
      assert.equal(h.calls.length, 4)
    }
    const candidate = skill('# React guide\\nSee [reference](references/guide.md)')
    for (const variant of ['missing', 'symlink', 'local-license']) {
      const h = setup(candidate, { override(path) {
        if (path.endsWith('/commits/' + COMMIT)) return {
          sha: COMMIT, commit: { tree: { sha: TREE } },
        }
        if (path.includes('/git/trees/')) {
          const rows = [
            { path: 'LICENSE', type: 'blob', mode: '100644', sha: LICENSE.sha },
            { path: 'skills/react-guide/SKILL.md', type: 'blob', mode: '100644', sha: candidate.sha },
          ]
          if (variant !== 'missing') rows.push({
            path: 'skills/react-guide/references/guide.md',
            type: 'blob', mode: variant === 'symlink' ? '120000' : '100644', sha: 'e'.repeat(40),
          })
          if (variant === 'local-license') rows.push({
            path: 'skills/react-guide/references/LICENSE',
            type: 'blob', mode: '100644', sha: 'f'.repeat(40),
          })
          return { sha: TREE, truncated: false, tree: rows }
        }
        if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
        if (path.endsWith('/git/blobs/' + candidate.sha)) return candidate
        throw Error('Unexpected reference endpoint: ' + path)
      } })
      await assert.rejects(h.audit.execute(input(candidate), h.exec),
        /reference lacks immutable regular-file or matching license evidence/)
      assert.equal(h.authenticated, 0)
    }
  })

  it('keeps secondary reviews bounded to four referenced files', async () => {
    const candidate = skill('# React guide\\n' +
      Array.from({ length: 5 }, (_, i) => '[item](guide' + i + '.md)').join(' '))
    const h = setup(candidate)
    await assert.rejects(h.audit.execute(input(candidate), h.exec),
      /references exceed bounded review limit/)
    assert.equal(h.calls.length, 4)
  })

  it('fails closed on substituted blobs, mismatched tree and symlink modes', async () => {
    const bad = setup(CLEAN, { mode: '120000' })
    await assert.rejects(bad.audit.execute(input(), bad.exec), /Git mode/)
    const mismatch = setup()
    await assert.rejects(mismatch.audit.execute({
      ...input(), sourceBlobSha: 'd'.repeat(40),
    }, mismatch.exec), /blob SHA mismatch/)
    assert.equal(mismatch.calls.length, 2)
    const badTree = setup(CLEAN, { override(path) {
      if (path.endsWith('/commits/' + COMMIT)) return { sha: COMMIT, commit: { tree: { sha: TREE } } }
      if (path.endsWith('/git/trees/' + TREE + '?recursive=1')) {
        return { sha: TREE, truncated: true, tree: [] }
      }
      throw Error('Unexpected read ' + path)
    } })
    await assert.rejects(badTree.audit.execute(input(), badTree.exec), /incomplete/)
    assert.equal(badTree.calls.length, 2)
  })

  it('denies malformed repository, path, commit and absent anonymous transport', async () => {
    const h = setup()
    for (const value of [
      { ...input(), repository: '../private' },
      { ...input(), repository: 'other/skills?token=x' },
      { ...input(), path: '../skills/react-guide/SKILL.md' },
      { ...input(), path: 'skills/react-guide/../../secrets' },
      { ...input(), commit: 'main' },
      { ...input(), licenseBlobSha: 'abc' },
    ]) await assert.rejects(h.audit.execute(value, h.exec), /Invalid public Skill audit/)
    assert.deepEqual(h.calls, [])
    const abort = new AbortController()
    abort.abort(new Error('stop requested'))
    await assert.rejects(h.audit.execute(input(), { signal: abort.signal }), /stop requested/)
    assert.deepEqual(h.calls, [])
    let privileged = 0
    const unavailable = createPublicSkillAuditSpecs({
      async request() { privileged++; throw Error('never use owner Token') },
    })[0]
    await assert.rejects(unavailable.execute(input(), h.exec), /anonymous GitHub Skill audit unavailable/)
    assert.equal(privileged, 0)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createGitHubSkillDiscoverySpecs } from '../packages/dsh-delta-code/lib/delta-code-repository/github-skill-discovery.js'
import { GitHubApiFailure } from '../packages/dsh-delta-code/lib/delta-code-adapter/contracts/github.js'

const COMMIT = 'a'.repeat(40)
const fixture = '---\nname: reviewed-skill\ndescription: Specialized read-only reference\n---\n\n# Instructions\nUse a narrow test.\n'
const licenseText = 'MIT License\nPermission is hereby granted.\n'

function blob(text) {
  const bytes = Buffer.from(text, 'utf8')
  return {
    type: 'file', size: bytes.length, encoding: 'base64', content: bytes.toString('base64'),
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
  }
}

function harness(overrides = {}) {
  const seen = []
  const account = normalizeConfig({ github: { accounts: [
    { owner: 'acme', tokenEnv: 'ACME_GH_TOKEN' },
  ] } })
  const resolver = async (requested) => requested
  const transport = {
    async request(input) {
      seen.push(input)
      if (overrides.request) return overrides.request(input)
      if (input.path.startsWith('/search/code?')) return {
        repository: input.repository, account: input.account,
        data: { total_count: 3, items: [
          { path: 'skills/reviewed-skill/SKILL.md' },
          { path: 'scripts/unsafe.sh' }, { path: '../private/SKILL.md' },
        ] },
      }
      if (input.path.endsWith('/commits?per_page=1')) return {
        repository: input.repository, account: input.account, data: [{ sha: COMMIT }],
      }
      if (input.path.includes('/contents/skills/reviewed-skill/SKILL.md?')) return {
        repository: input.repository, account: input.account, data: overrides.skill ?? blob(fixture),
      }
      if (input.path.includes('/contents/LICENSE?')) return {
        repository: input.repository, account: input.account, data: blob(licenseText),
      }
      throw Error('Unexpected mock request: ' + input.path)
    },
  }
  const specs = createGitHubSkillDiscoverySpecs(account, transport, resolver)
  return { seen, specs, exec: { signal: new AbortController().signal },
    search: specs.find(s => s.name === 'code_github_skill_candidates'),
    review: specs.find(s => s.name === 'code_github_skill_review') }
}

describe('Delta Code GitHub Skill candidate discovery and review', () => {
  it('discovers only bounded candidate paths and labels results as untrusted', async () => {
    const h = harness()
    const output = await h.search.execute({ repository: 'acme/skills', query: 'react performance' }, h.exec)
    const result = JSON.parse(output.result)
    assert.equal(result.totalMatches, 3)
    assert.equal(result.candidates.length, 1)
    assert.deepEqual(result.candidates[0], {
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md',
      name: 'reviewed-skill', suggestedCommit: COMMIT, status: 'unreviewed', requiresReview: true,
    })
    assert.match(h.seen[0].path, /^\/search\/code\?/)
    assert.match(decodeURIComponent(h.seen[0].path), /repo:acme\/skills filename:SKILL.md/)
    assert.ok(h.seen.every(c => c.method === 'GET' && c.account === 'acme'))
    assert.ok(h.seen.every(c => c.signal === h.exec.signal))
    assert.equal(h.seen.length, 2)
    await assert.rejects(h.search.execute({ repository: 'acme/skills', query: 'x' }, h.exec), /bounded plain-text/)
    await assert.rejects(h.search.execute({ repository: 'acme/skills', query: 'foo&repo:other/secret' }, h.exec), /bounded plain-text/)
    assert.equal(h.seen.length, 2)
  })

  it('verifies pinned bytes and license evidence but never auto-approves a candidate', async () => {
    const h = harness()
    const result = JSON.parse((await h.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, h.exec)).result)
    assert.equal(result.reviewState, 'requires-human-review')
    assert.equal(result.approvalRequired, true)
    assert.equal(result.licenseVerified, false)
    assert.equal(result.licenseEvidence.blobSha, blob(licenseText).sha)
    assert.equal(result.source.blobSha, blob(fixture).sha)
    assert.equal(result.metadata.name, 'reviewed-skill')
    assert.deepEqual(result.warnings, [])
    assert.ok(h.seen.every(x => x.method === 'GET'))
    assert.ok(h.seen.every(x => x.path.endsWith('ref=' + COMMIT)))
    assert.doesNotMatch(JSON.stringify(result), /Use a narrow test/)
    assert.doesNotMatch(JSON.stringify(result), /ACME_GH_TOKEN/)
  })

  it('fails closed for tampered bytes, oversized files, spoofed names and traversal', async () => {
    const tampered = harness({ skill: { ...blob(fixture), sha: '0'.repeat(40) } })
    await assert.rejects(tampered.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, tampered.exec), /hash mismatch/)
    const big = harness({ skill: { ...blob(fixture), size: 65537 } })
    await assert.rejects(big.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, big.exec), /bounded/)
    const spoofed = harness({ skill: blob(fixture.replace('name: reviewed-skill', 'name: other-skill')) })
    await assert.rejects(spoofed.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, spoofed.exec), /does not match/)
    const h = harness()
    await assert.rejects(h.review.execute({
      repository: 'acme/skills', path: '../private/SKILL.md', commit: COMMIT,
    }, h.exec), /single skills/)
    await assert.rejects(h.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: 'main',
    }, h.exec), /commit SHA/)
    await assert.rejects(h.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
      licensePath: '../SECRET',
    }, h.exec), /license evidence path/)
    assert.equal(h.seen.length, 0)
  })

  it('reports missing license and relative bundle dependencies rather than loading them', async () => {
    const source = fixture + '\nSee [script](./scripts/prepare.sh).\n'
    const h = harness({ request: async (input) => {
      h.seen.push(input)
      if (input.path.includes('/contents/LICENSE?')) throw new GitHubApiFailure(404, input.repository, 'GET')
      return { repository: input.repository, account: input.account, data: blob(source) }
    } })
    const report = JSON.parse((await h.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, h.exec)).result)
    assert.equal(report.licenseEvidence, null)
    assert.equal(report.hasRequiredBundleReview, true)
    assert.ok(report.warnings.some(x => /license/.test(x)))
    assert.ok(report.warnings.some(x => /bundle/.test(x)))
    assert.equal(report.approvalRequired, true)
  })

  it('enforces repository account scope before any external request and forwards cancellation', async () => {
    const h = harness()
    await assert.rejects(h.review.execute({
      repository: 'unbound/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, h.exec), /no GitHub account/)
    await assert.rejects(h.search.execute({
      repository: 'unbound/skills', query: 'react',
    }, h.exec), /no GitHub account/)
    assert.equal(h.seen.length, 0)
    const aborted = new AbortController()
    aborted.abort()
    const request = harness({ request: async input => {
      input.signal.throwIfAborted()
      throw Error('should not execute')
    } })
    await assert.rejects(request.review.execute({
      repository: 'acme/skills', path: 'skills/reviewed-skill/SKILL.md', commit: COMMIT,
    }, { signal: aborted.signal }), /abort/i)
  })
})

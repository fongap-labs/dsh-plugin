import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { APPROVED_GITHUB_SKILLS, matchApprovedGitHubSkills } from '../packages/dsh-delta-code/lib/delta-code-strategy/trusted-github-skills.js'
import { createApprovedGitHubSkillProvider } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/github/approved-skills.js'
import { registerApprovedGitHubSkills } from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/github-skills.js'

describe('Delta Code approved GitHub Skills', () => {
  it('selects pinned Skills from user task intent without generic tool output', () => {
    assert.deepEqual(matchApprovedGitHubSkills('Implement a React component'), ['vercel-react-best-practices'])
    assert.deepEqual(matchApprovedGitHubSkills('Refactor React compound components'), [
      'vercel-react-best-practices', 'vercel-composition-patterns',
    ])
    assert.deepEqual(matchApprovedGitHubSkills('Fix a Rust build'), [])
    assert.ok(APPROVED_GITHUB_SKILLS.every(skill =>
      /^[0-9a-f]{40}$/.test(skill.commit) && /^[0-9a-f]{40}$/.test(skill.blobSha)))
  })

  it('uses immutable GitHub URLs, verifies Git content, and fails closed on changes', async () => {
    const body = '---\nname: reviewed-skill\ndescription: safe\n---\n\n# Approved guidance\nOnly read.\n'
    const bytes = Buffer.from(body)
    const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    const entry = {
      name: 'reviewed-skill', description: 'Pinned example', owner: 'acme',
      repository: 'approved', commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md',
      blobSha: sha, keywords: ['reviewed'],
    }
    const urls = []
    const fetcher = async (url, options) => {
      urls.push({ url, redirect: options.redirect })
      return new Response(body, { status: 200 })
    }
    const provider = createApprovedGitHubSkillProvider(fetcher, [entry])
    const candidate = (await provider.list())[0]
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: false })
    const loaded = await provider.get(candidate)
    assert.match(loaded.content, /Approved guidance/)
    assert.match(loaded.content, /Do not install packages, execute scripts/i)
    assert.equal(urls[0].url, 'https://raw.githubusercontent.com/acme/approved/' + 'a'.repeat(40) +
      '/skills/reviewed-skill/SKILL.md')
    assert.equal(urls[0].redirect, 'error')
    assert.equal(await provider.get({ ...candidate, locator: '0'.repeat(40) }), undefined)
    const corrupted = createApprovedGitHubSkillProvider(async () => new Response('tampered'), [entry])
    await assert.rejects(corrupted.get(candidate), /hash mismatch/)
    const oversized = createApprovedGitHubSkillProvider(async () => new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(70 * 1024))
          controller.close()
        },
      }),
    ), [entry])
    await assert.rejects(oversized.get(candidate), /exceeds maximum allowed size/)
    const cancelled = new AbortController()
    cancelled.abort()
    await assert.rejects(provider.get(candidate, { signal: cancelled.signal }), /abort/i)
  })

  it('uses the Host native skill provider and releases it on unmount', () => {
    const releases = []
    let active
    const ctx = {
      inject(services, listener) {
        assert.deepEqual(services, ['skills'])
        listener({ skills: {
          registerProvider(factory) {
            active = factory({ signal: new AbortController().signal, invalidate() {} })
            releases.push('registered')
            return () => releases.push('disposed')
          },
        } })
      },
    }
    const dispose = registerApprovedGitHubSkills(ctx)
    assert.equal(active.name, 'delta-code-approved-github')
    dispose()
    assert.deepEqual(releases, ['registered', 'disposed'])
    dispose()
    assert.deepEqual(releases, ['registered', 'disposed'])
  })
})

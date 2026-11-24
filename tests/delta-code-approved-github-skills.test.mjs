import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { APPROVED_GITHUB_SKILLS, APPROVED_GITHUB_SKILLS_CATALOG_VERSION, getActiveApprovedGitHubSkills, isExternalSkillOptOut, isRevokedGitHubSkillRevision, matchApprovedGitHubSkills } from '../packages/delta-code/lib/delta-code-strategy/trusted-github-skills.js'
import { createApprovedGitHubSkillProvider } from '../packages/delta-code/lib/delta-code-adapter/providers/github/approved-skills.js'
import { registerApprovedGitHubSkills } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/github-skills.js'

describe('Delta Code approved GitHub Skills', () => {
  it('selects pinned Skills from user task intent without generic tool output', () => {
    assert.deepEqual(matchApprovedGitHubSkills('Implement a React component'), ['vercel-react-best-practices'])
    assert.deepEqual(matchApprovedGitHubSkills('Refactor React compound components'), [
      'vercel-react-best-practices', 'vercel-composition-patterns',
    ])
    assert.deepEqual(matchApprovedGitHubSkills('Fix a Rust build'), [])
    assert.deepEqual(matchApprovedGitHubSkills('Investigate a reaction to the update'), [])
    assert.deepEqual(matchApprovedGitHubSkills('Fix a reactive socket'), [])
    assert.deepEqual(matchApprovedGitHubSkills('Implement React-native components'), ['vercel-react-best-practices'])
    assert.deepEqual(matchApprovedGitHubSkills('请修复 React组件 布局'), ['vercel-react-best-practices'])
    const custom = [
      { ...APPROVED_GITHUB_SKILLS[0], name: 'custom-specialist', keywords: ['build'], requiresAnyOf: ['typescript'] },
    ]
    assert.deepEqual(matchApprovedGitHubSkills('Build with no TypeScript', custom), ['custom-specialist'])
    assert.deepEqual(matchApprovedGitHubSkills('Build a Rust app', custom), [])
    assert.equal(isExternalSkillOptOut('Do not use GitHub Skills for React code'), true)
    assert.equal(isExternalSkillOptOut('Fix React without GitHub Skills'), true)
    assert.equal(isExternalSkillOptOut('不要使用 GitHub Skill，修复 React bug'), true)
    assert.equal(isExternalSkillOptOut('不自动调用 GitHub 中优秀 Skill 吗？'), false)
    assert.equal(isExternalSkillOptOut('Find and evaluate GitHub Skills'), false)
    assert.deepEqual(matchApprovedGitHubSkills('Implement React component without GitHub Skills'), [])
    assert.deepEqual(matchApprovedGitHubSkills('Design a new Tauri desktop UI'), ['anthropic-frontend-design'])
    assert.deepEqual(matchApprovedGitHubSkills('Define a stable API contract and module boundary'), ['addy-api-and-interface-design'])
    assert.deepEqual(matchApprovedGitHubSkills('Design a React UI for the desktop app'), [
      'vercel-react-best-practices', 'anthropic-frontend-design',
    ])
    assert.ok(APPROVED_GITHUB_SKILLS.every(skill =>
      /^[0-9a-f]{40}$/.test(skill.commit) && /^[0-9a-f]{40}$/.test(skill.blobSha) &&
      ['MIT', 'Apache-2.0'].includes(skill.license)))
    assert.ok(Number.isInteger(APPROVED_GITHUB_SKILLS_CATALOG_VERSION) && APPROVED_GITHUB_SKILLS_CATALOG_VERSION > 0)
    assert.equal(new Set(APPROVED_GITHUB_SKILLS.map(skill => skill.name)).size, APPROVED_GITHUB_SKILLS.length)
  })

  it('uses immutable GitHub URLs, verifies Git content, and fails closed on changes', async () => {
    const body = '---\nname: reviewed-skill\ndescription: safe\n---\n\n# Approved guidance\nOnly read.\n'
    const bytes = Buffer.from(body)
    const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    const entry = {
      name: 'reviewed-skill-alias', sourceName: 'reviewed-skill', description: 'Pinned example',
      owner: 'acme', repository: 'approved', commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md',
      blobSha: sha, license: 'MIT', keywords: ['reviewed'],
    }
    const urls = []
    const fetcher = async (url, options) => {
      assert.equal(options.credentials, 'omit')
      assert.equal(options.referrerPolicy, 'no-referrer')
      assert.equal(options.headers, undefined)
      urls.push({ url, redirect: options.redirect })
      return new Response(body, { status: 200 })
    }
    const provider = createApprovedGitHubSkillProvider(fetcher, [entry])
    const candidate = (await provider.list())[0]
    assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: false })
    assert.equal(candidate.locator, entry.commit + ':' + entry.blobSha)
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

  it('lazily assembles only CI-pinned Markdown references with verified Git blob hashes', async () => {
    const root = '---\nname: reviewed-skill\ndescription: Free documented skill\n---\n\n# Guide\nRead [mini](guide.mini.md).'
    const mini = '# Mini guide\nUse the built-in file reader.'
    const digest = body => {
      const bytes = Buffer.from(body)
      return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    }
    const entry = {
      name: 'reviewed-bundle', sourceName: 'reviewed-skill',
      description: 'CI reviewed multi-file Skill', owner: 'acme', repository: 'approved',
      commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md',
      blobSha: digest(root), license: 'MIT', keywords: ['reviewed'],
      references: [{ path: 'skills/reviewed-skill/guide.mini.md', blobSha: digest(mini) }],
    }
    const urls = []
    const fetcher = async (url, options) => {
      assert.equal(options.redirect, 'error')
      urls.push(url)
      if (url.endsWith('/SKILL.md')) return new Response(root)
      if (url.endsWith('/guide.mini.md')) return new Response(mini)
      throw Error('Unexpected remote request')
    }
    const provider = createApprovedGitHubSkillProvider(fetcher, [entry])
    const [candidate] = await provider.list()
    assert.deepEqual(urls, [], 'Native list is always metadata-only')
    assert.match(candidate.locator, /^[a-f0-9]{40}:[a-f0-9]{40}:[a-f0-9]{16}$/)
    const loaded = await provider.get(candidate)
    assert.match(loaded.content, /CI-reviewed immutable supplementary references/)
    assert.match(loaded.content, /Use the built-in file reader/)
    assert.equal(urls.length, 2)
    assert.ok(urls.every(url => url.includes('/' + entry.commit + '/')))
    assert.equal(await provider.get({ ...candidate, locator: 'deadbeef' }), undefined)
    const replaced = {
      ...entry, references: [{ ...entry.references[0], blobSha: 'b'.repeat(40) }],
    }
    const changed = createApprovedGitHubSkillProvider(fetcher, [replaced])
    assert.equal(await changed.get(candidate), undefined, 'changed references invalidate native candidates')
    const tampered = createApprovedGitHubSkillProvider(async url =>
      new Response(url.endsWith('/SKILL.md') ? root : '# Different text'), [entry])
    await assert.rejects(tampered.get(candidate), /hash mismatch/)
    const alteredRoot = root.replace('guide.mini.md', 'other.md')
    const missing = createApprovedGitHubSkillProvider(async url =>
      new Response(url.endsWith('/SKILL.md') ? alteredRoot : mini),
    [{ ...entry, blobSha: digest(alteredRoot) }])
    await assert.rejects(missing.get((await missing.list())[0]),
      /reference manifest is incomplete or changed/)
    const additional = root + '\nRead extra.md before working.'
    const unlinked = createApprovedGitHubSkillProvider(async url =>
      new Response(url.endsWith('/SKILL.md') ? additional : mini),
    [{ ...entry, blobSha: digest(additional) }])
    await assert.rejects(unlinked.get((await unlinked.list())[0]),
      /reference manifest is incomplete or changed/)

    const nested = mini + '\nRead extra.md before working.'
    const nestedEntry = {
      ...entry, references: [{ ...entry.references[0], blobSha: digest(nested) }],
    }
    const nestedUnlinked = createApprovedGitHubSkillProvider(async url =>
      new Response(url.endsWith('/SKILL.md') ? root : nested), [nestedEntry])
    await assert.rejects(nestedUnlinked.get((await nestedUnlinked.list())[0]),
      /reference excluded by free-only policy/)

    const cancelled = new AbortController()
    const aborted = createApprovedGitHubSkillProvider(async (url) => {
      if (url.endsWith('/SKILL.md')) return new Response(root)
      cancelled.abort(new Error('reference retrieval cancelled'))
      return new Response(mini)
    }, [entry])
    await assert.rejects(aborted.get((await aborted.list())[0], { signal: cancelled.signal }),
      /reference retrieval cancelled/)
  })

  it('revokes exact immutable revisions and refuses stale candidates after an update', async () => {
    const body = '---\nname: reviewed-skill\ndescription: safe\n---\n\n# Approved guidance\nOnly read.\n'
    const bytes = Buffer.from(body)
    const blobSha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')
    const entry = {
      name: 'reviewed-skill', description: 'Pinned example', owner: 'acme', repository: 'approved',
      commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md', blobSha, license: 'MIT', keywords: ['reviewed'],
    }
    const oldProvider = createApprovedGitHubSkillProvider(async () => new Response(body), [entry])
    const oldCandidate = (await oldProvider.list())[0]
    const revocation = {
      name: entry.name, commit: entry.commit, blobSha: entry.blobSha,
      revokedAt: '2026-11-17', reason: 'security review withdrew this exact revision',
    }
    assert.equal(isRevokedGitHubSkillRevision(entry, [revocation]), true)
    assert.deepEqual(getActiveApprovedGitHubSkills([entry], [revocation]), [])
    assert.deepEqual(matchApprovedGitHubSkills('reviewed', [entry], [revocation]), [])
    const revokedProvider = createApprovedGitHubSkillProvider(async () => new Response(body), [entry], {
      revocations: [revocation],
    })
    assert.deepEqual(await revokedProvider.list(), [])
    assert.equal(await revokedProvider.get(oldCandidate), undefined)

    const replacement = { ...entry, commit: 'b'.repeat(40), blobSha: 'c'.repeat(40) }
    assert.deepEqual(getActiveApprovedGitHubSkills([replacement], [revocation]), [replacement])
    const replacementProvider = createApprovedGitHubSkillProvider(async () => new Response(body), [replacement])
    assert.equal(await replacementProvider.get(oldCandidate), undefined)
    assert.equal((await replacementProvider.list())[0].locator, replacement.commit + ':' + replacement.blobSha)
  })

  it('aborts discovery and loading when the native registration lifecycle is revoked', async () => {
    const body = '---\nname: reviewed-skill\ndescription: safe\n---\n\n# Approved guidance\nOnly read.\n'
    const bytes = Buffer.from(body)
    const entry = {
      name: 'reviewed-skill', description: 'Pinned example', owner: 'acme', repository: 'approved',
      commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md',
      blobSha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
      license: 'MIT', keywords: ['reviewed'],
    }
    const controller = new AbortController()
    let calls = 0
    const provider = createApprovedGitHubSkillProvider(async () => {
      calls++
      return new Response(body)
    }, [entry], { signal: controller.signal })
    const candidate = (await provider.list())[0]
    controller.abort(new Error('provider registration disposed'))
    await assert.rejects(provider.list(), /disposed/)
    await assert.rejects(provider.get(candidate), /disposed/)
    assert.equal(calls, 0)
  })

  it('cancels a remote response stream when the provider registration is disposed mid-load', async () => {
    const body = '---\nname: reviewed-skill\ndescription: safe\n---\n\n# Approved guidance\nOnly read.\n'
    const bytes = Buffer.from(body)
    const entry = {
      name: 'reviewed-skill', description: 'Pinned example', owner: 'acme', repository: 'approved',
      commit: 'a'.repeat(40), path: 'skills/reviewed-skill/SKILL.md',
      blobSha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
      license: 'MIT', keywords: ['reviewed'],
    }
    const controller = new AbortController()
    let cancelCount = 0
    let signalReceived
    let resolveFetch
    const fetchStarted = new Promise(resolve => { resolveFetch = resolve })
    const provider = createApprovedGitHubSkillProvider(async (_url, init) => {
      signalReceived = init.signal
      resolveFetch()
      return new Response(new ReadableStream({
        start(stream) { stream.enqueue(new TextEncoder().encode('partial response')) },
        cancel() { cancelCount++ },
      }))
    }, [entry], { signal: controller.signal })
    const candidate = (await provider.list())[0]
    const pending = provider.get(candidate)
    await fetchStarted
    await new Promise(resolve => setImmediate(resolve))
    controller.abort(new Error('provider registration disposed'))
    await assert.rejects(pending, /disposed/)
    assert.equal(signalReceived, controller.signal)
    assert.equal(cancelCount, 1)
  })

  it('uses the Host native provider and forwards its registration-scoped abort signal', async () => {
    const releases = []
    const controller = new AbortController()
    let active
    const ctx = {
      inject(services, listener) {
        assert.deepEqual(services, ['skills'])
        listener({ skills: {
          registerProvider(factory) {
            active = factory({ signal: controller.signal, invalidate() {} })
            releases.push('registered')
            return () => {
              controller.abort(new Error('provider registration disposed'))
              releases.push('disposed')
            }
          },
        } })
      },
    }
    const dispose = registerApprovedGitHubSkills(ctx)
    assert.equal(active.name, 'delta-code-approved-github')
    assert.ok((await active.list()).length > 0)
    dispose()
    assert.deepEqual(releases, ['registered', 'disposed'])
    assert.deepEqual(await active.list(), [])
    dispose()
    assert.deepEqual(releases, ['registered', 'disposed'])
  })
})

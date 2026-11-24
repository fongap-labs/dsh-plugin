import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPublicSkillDiscoverySpecs } from '../packages/delta-code/lib/delta-code-repository/github-skill-public-discovery.js'
import { createGitHubTransport } from '../packages/delta-code/lib/delta-code-adapter/providers/github/api.js'
import { GitHubApiFailure } from '../packages/delta-code/lib/delta-code-adapter/contracts/github.js'
import { skillNameFromPath, nearestSkillLicense } from '../packages/delta-code/lib/delta-code-strategy/skill-source-path.js'

const SHA = 'a'.repeat(40)
const TREE = 'b'.repeat(40)
const NOW = '2026-11-18T00:00:00Z'
function blob(text) {
  const bytes = Buffer.from(text, 'utf8')
  return {
    sha: createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex'),
    encoding: 'base64', content: bytes.toString('base64'), size: bytes.length,
  }
}
const LICENSE = blob('MIT License\nPermission is hereby granted, free of charge.\n')
const skillBlob = name => blob('---\nname: ' + name +
  '\ndescription: Public free Skill\n---\n\n# Instructions\nUse built-in tools only.\n')
const repo = (name, description) => ({
  full_name: name, private: false, archived: false, disabled: false,
  default_branch: 'main', license: { spdx_id: 'MIT' }, created_at: '2021-01-01T00:00:00Z',
  pushed_at: NOW, stargazers_count: 300, forks_count: 25, description,
})
function mockTransport(overrides = {}) {
  const calls = []
  let privileged = 0
  const transport = {
    async request() { privileged++; throw Error('owner-bound authentication MUST NOT be used') },
    async publicRead(path, signal) {
      signal.throwIfAborted()
      calls.push(path)
      if (overrides.read) return overrides.read(path)
      if (path.startsWith('/search/repositories?')) return {
        total_count: 180, items: [
          repo('alpha/skills', 'React performance skill development'),
          { ...repo('alpha/skills', 'duplicate'), stargazers_count: 100000 },
          repo('beta/coding', 'React UI assistance'),
          { ...repo('private/skills', 'private'), private: true },
          { ...repo('malicious/traversal', 'bad'), default_branch: '../main' },
        ],
      }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.endsWith('/git/trees/' + TREE + '?recursive=1')) {
        return { sha: TREE, truncated: false, tree: [
          { path: 'LICENSE', type: 'blob', sha: LICENSE.sha },
          { path: 'skills/react-profiler/SKILL.md', type: 'blob', sha: skillBlob('react-profiler').sha },
          { path: 'skills/unsafe/../../private/SKILL.md', type: 'blob', sha: SHA },
          { path: 'skills/ignore/INSTALL.sh', type: 'blob', sha: SHA },
          { path: 'skills/javascript/SKILL.md', type: 'blob', sha: skillBlob('javascript').sha },
          { path: 'skills/not-blob/SKILL.md', type: 'tree', sha: SHA },
        ] }
      }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + skillBlob('react-profiler').sha)) return skillBlob('react-profiler')
      if (path.endsWith('/git/blobs/' + skillBlob('javascript').sha)) return skillBlob('javascript')
      if (path.startsWith('/users/')) return {
        login: path.slice('/users/'.length), created_at: '2014-01-01T00:00:00Z',
      }
      throw Error('unexpected public request: ' + path)
    },
  }
  return { transport, calls, get privilegedCalls() { return privileged },
    tool: createPublicSkillDiscoverySpecs(transport)[0],
    exec: { signal: new AbortController().signal } }
}
const parse = output => JSON.parse(output.result)

describe('Delta Code public GitHub Skill discovery (no credentials)', () => {
  it('scans public repository matches and pins only supported SKILL.md blobs', async () => {
    const h = mockTransport()
    const out = await h.tool.execute({ query: 'react' }, h.exec)
    const data = parse(out)
    assert.equal(out.account, 'anonymous')
    assert.equal(out.repository, 'github.com/public')
    assert.equal(data.totalRepositoryMatches, 180)
    assert.equal(data.checkedRepositories, 2)
    assert.equal(data.apiCalls, 13) // search + (commit, tree, license, two Skills, owner) for each repo
    assert.equal(data.candidates.length, 4)
    assert.equal(data.isRateLimited, false)
    assert.equal(data.truncated, true)
    assert.equal(h.privilegedCalls, 0)
    for (const candidate of data.candidates) {
      assert.match(candidate.path, /^skills\/[a-z0-9-]+\/SKILL\.md$/)
      assert.equal(candidate.sourceBlobSha, skillBlob(candidate.name).sha)
      assert.equal(candidate.freeEvidence.license, 'MIT')
      assert.equal(candidate.freeEvidence.licenseBlobSha, LICENSE.sha)
      assert.equal(candidate.suggestedCommit, SHA)
      assert.equal(candidate.status, 'unreviewed')
      assert.equal(candidate.requiresReview, true)
      assert.ok(candidate.recommendationScore <= 100)
      assert.equal(Object.hasOwn(candidate, 'content'), false)
      assert.equal(Object.hasOwn(candidate, 'isApproved'), false)
    }
    assert.ok(data.candidates[0].recommendationScore >= data.candidates.at(-1).recommendationScore)
    assert.equal(data.excludedByCost, 0)
    assert.equal(data.candidates.filter(x => x.repository === 'alpha/skills').length, 2)
    assert.ok(h.calls.every(path => path.startsWith('/search/repositories?') ||
      path.startsWith('/repos/alpha/') || path.startsWith('/repos/beta/') ||
      path === '/users/alpha' || path === '/users/beta'))
  })

  it('recognizes safe root-level and category Skill directories but not traversals', () => {
    for (const [path, expected] of [
      ['refactoring/SKILL.md', 'refactoring'],
      ['skills/api-tester/SKILL.md', 'api-tester'],
      ['composio-skills/task-automation/SKILL.md', 'task-automation'],
      ['books/coding/clean-code/SKILL.md', 'clean-code'],
      ['../skills/evil/SKILL.md', null],
      ['skills/a/../../private/SKILL.md', null],
      ['hidden/.secret/SKILL.md', null],
      ['skills/a/../../../SKILL.md', null],
      ['SKILL.md', null],
      ['skills/a/INSTALL.sh', null],
    ]) assert.equal(skillNameFromPath(path), expected)
    const tree = [
      { path: 'LICENSE', sha: 'root' },
      { path: 'refactoring/LICENSE.txt', sha: 'local' },
    ]
    assert.equal(nearestSkillLicense(tree, 'refactoring/SKILL.md').sha, 'local')
    assert.equal(nearestSkillLicense(tree, 'skills/api/SKILL.md').sha, 'root')
    const nested = [
      ...tree,
      { path: 'books/LICENSE.md', sha: 'category' },
      { path: 'books/coding/LICENSE.txt', sha: 'closer' },
    ]
    assert.equal(nearestSkillLicense(nested, 'books/coding/refactoring/SKILL.md').sha, 'closer')
    assert.equal(nearestSkillLicense(nested, 'books/design/ui/SKILL.md').sha, 'category')
    assert.equal(nearestSkillLicense(nested, 'books/coding/refactoring/SKILL.md'),
      nested.find(row => row.sha === 'closer'))
    assert.equal(nearestSkillLicense([...nested, { path: 'books/coding/LICENSE.md', sha: 'conflict' }],
      'books/coding/refactoring/SKILL.md'), undefined)
    assert.equal(nearestSkillLicense([{ path: 'skills/foo/LICENSE', sha: 'local' }],
      '../foo/SKILL.md'), undefined)
  })

  it('discovers a free Skill with a local license when repository SPDX metadata is absent', async () => {
    const source = skillBlob('refactoring')
    const local = blob('MIT License\nPermission is hereby granted, free of charge.\n')
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return {
        total_count: 1, items: [{ ...repo('public/books', 'refactoring guidance'), license: null }],
      }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'refactoring/SKILL.md', sha: source.sha, type: 'blob', mode: '100644' },
        { path: 'refactoring/LICENSE.txt', sha: local.sha, type: 'blob', mode: '100644' },
      ] }
      if (path.endsWith('/git/blobs/' + local.sha)) return local
      if (path.endsWith('/git/blobs/' + source.sha)) return source
      if (path.startsWith('/users/')) return { login: 'public', created_at: '2020-01-01T00:00:00Z' }
      throw Error('Unexpected public read ' + path)
    } })
    const result = parse(await h.tool.execute({ query: 'refactoring' }, h.exec))
    assert.equal(result.candidates.length, 1)
    assert.equal(result.candidates[0].path, 'refactoring/SKILL.md')
    assert.equal(result.candidates[0].freeEvidence.licensePath, 'refactoring/LICENSE.txt')
    assert.equal(result.candidates[0].freeEvidence.license, 'MIT')
    assert.equal(h.privilegedCalls, 0)
  })

  it('discovers unapproved multi-file Skills for subsequent immutable bundle review', async () => {
    const bundled = blob([
      '---', 'name: refactoring', 'description: Free guidance', '---', '',
      '# Refactoring', 'Read [mini](refactoring.mini.md) before editing.',
    ].join('\n'))
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return {
        total_count: 1, items: [repo('public/books', 'refactoring guide')],
      }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', sha: LICENSE.sha, type: 'blob', mode: '100644' },
        { path: 'refactoring/SKILL.md', sha: bundled.sha, type: 'blob', mode: '100644' },
      ] }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + bundled.sha)) return bundled
      if (path.startsWith('/users/')) return { login: 'public', created_at: '2020-01-01T00:00:00Z' }
      throw Error('Unexpected read ' + path)
    } })
    const data = parse(await h.tool.execute({ query: 'refactoring' }, h.exec))
    assert.equal(data.candidates.length, 1)
    assert.equal(data.candidates[0].path, 'refactoring/SKILL.md')
    assert.equal(data.candidates[0].status, 'unreviewed')
    assert.equal(data.candidates[0].requiresReview, true)
    assert.equal(h.privilegedCalls, 0)
  })

  it('requires the closest license even if a repository root has a free license', async () => {
    const restrictive = blob('Copyright reserved. No permission to reuse.')
    const current = skillBlob('refactoring')
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return {
        total_count: 1, items: [repo('alpha/skills', 'refactoring')],
      }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.includes('/git/trees/')) return { sha: TREE, truncated: false, tree: [
        { path: 'LICENSE', sha: LICENSE.sha, type: 'blob', mode: '100644' },
        { path: 'refactoring/SKILL.md', sha: current.sha, type: 'blob', mode: '100644' },
        { path: 'refactoring/LICENSE.txt', sha: restrictive.sha, type: 'blob', mode: '100644' },
      ] }
      if (path.endsWith('/git/blobs/' + restrictive.sha)) return restrictive
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      throw Error('Unexpected public read ' + path)
    } })
    const result = parse(await h.tool.execute({ query: 'refactoring' }, h.exec))
    assert.deepEqual(result.candidates, [])
    assert.equal(result.excludedByCost, 1)
  })

  it('rejects query operators, unknown transport capability and aborted searches without credential fallback', async () => {
    const h = mockTransport()
    for (const query of ['r', 'repo:private secrets', 'react&token=x', ' ', 'a'.repeat(100)]) {
      await assert.rejects(h.tool.execute({ query }, h.exec), /bounded plain-text/)
    }
    assert.equal(h.calls.length, 0)
    const controller = new AbortController()
    controller.abort(new Error('user canceled search'))
    await assert.rejects(h.tool.execute({ query: 'react' }, { signal: controller.signal }), /user canceled search/)
    assert.equal(h.calls.length, 0)
    let usedOwnerTransport = false
    const disabled = createPublicSkillDiscoverySpecs({
      request() { usedOwnerTransport = true; throw Error('owner credentials used') },
    })[0]
    await assert.rejects(disabled.execute({ query: 'react' }, h.exec), /public GitHub discovery transport unavailable/)
    assert.equal(usedOwnerTransport, false)
  })

  it('rejects unverified/truncated Git trees and does not present unpinned candidates', async () => {
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return { total_count: 1, items: [repo('alpha/skills', 'React skills')] }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.includes('/git/trees/')) return {
        truncated: true, tree: [{ path: 'skills/react/SKILL.md', type: 'blob', sha: SHA }],
      }
      throw Error('unexpected path')
    } })
    const result = parse(await h.tool.execute({ query: 'react' }, h.exec))
    assert.deepEqual(result.candidates, [])
    assert.match(result.skipped[0], /truncated/)
    assert.equal(h.privilegedCalls, 0)
  })

  it('stops on public GitHub rate limits without retrying or borrowing another Token', async () => {
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return {
        total_count: 1, items: [repo('alpha/skills', 'React skills')],
      }
      throw new GitHubApiFailure(429, 'public-skill-discovery', 'GET')
    } })
    const result = parse(await h.tool.execute({ query: 'react' }, h.exec))
    assert.equal(result.isRateLimited, true)
    assert.equal(result.apiCalls, 2)
    assert.deepEqual(result.candidates, [])
    assert.equal(h.privilegedCalls, 0)
  })

  it('filters paid pinned Skills even if a repository lacks license metadata', async () => {
    const paid = blob(['---', 'name: react-profiler', 'description: Code tool', '---', '', '# Guidance', 'Requires a paid API subscription.'].join('\n'))
    const h = mockTransport({ read(path) {
      if (path.startsWith('/search/repositories?')) return {
        total_count: 2, items: [
          repo('alpha/skills', 'React skills'),
          { ...repo('paid/locked', 'Requires premium access'), license: null },
        ],
      }
      if (path.endsWith('/commits/main')) return { sha: SHA, commit: { tree: { sha: TREE } } }
      if (path.includes('/git/trees/')) return {
        sha: TREE, truncated: false,
        tree: [
          { path: 'LICENSE', type: 'blob', sha: LICENSE.sha },
          { path: 'skills/react-profiler/SKILL.md', type: 'blob', sha: paid.sha },
        ],
      }
      if (path.endsWith('/git/blobs/' + LICENSE.sha)) return LICENSE
      if (path.endsWith('/git/blobs/' + paid.sha)) return paid
      throw Error('Unexpected paid test path ' + path)
    } })
    const result = parse(await h.tool.execute({ query: 'react' }, h.exec))
    assert.deepEqual(result.candidates, [])
    assert.equal(result.excludedByCost, 2)
    assert.equal(h.privilegedCalls, 0)
    assert.ok(h.calls.some(path => path.includes('/repos/paid/')))
  })

  it('never sends a credential through the real public transport and blocks unwanted paths', async () => {
    const transport = createGitHubTransport([{ owner: 'alpha', tokenEnv: 'TEST_TOKEN' }], {
      get() { throw Error('credential resolver MUST NOT be contacted') },
    })
    assert.equal(typeof transport.publicRead, 'function')
    const previousFetch = globalThis.fetch
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      assert.equal(options.headers.Authorization, undefined)
      assert.equal(options.credentials, 'omit')
      assert.equal(options.redirect, 'error')
      return new Response(JSON.stringify({ total_count: 0, items: [] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    try {
      const controller = new AbortController()
      const query = '/search/repositories?per_page=8&q=' +
        encodeURIComponent('react skills in:name,description,readme')
      const result = await transport.publicRead(query, controller.signal)
      assert.equal(result.total_count, 0)
      assert.equal(calls.length, 1)
      assert.equal(calls[0].url.split('?')[0], 'https://api.github.com/search/repositories')
      for (const path of [
        '/search/code?q=react', '/user', '/repos/alpha/skills/contents/private.txt',
        '/repos/alpha/skills/actions/secrets', '/repos/alpha/skills/commits/main?token=bad',
      ]) await assert.rejects(transport.publicRead(path, controller.signal), /not permitted/)
      assert.equal(calls.length, 1)
    } finally {
      globalThis.fetch = previousFetch
    }
  })
})


it('releases public response bodies on cancellation, oversized headers and stream limits', async () => {
  const transport = createGitHubTransport([], { get() { throw Error('must not resolve credentials') } })
  const oldFetch = globalThis.fetch
  const path = '/users/alpha'
  try {
    for (const mode of ['abort', 'header', 'stream', 'http']) {
      let cancelled = 0, started
      const pulling = new Promise(resolve => { started = resolve })
      const controller = new AbortController()
      const stream = new ReadableStream({
        pull(sink) {
          if (mode === 'stream') sink.enqueue(new Uint8Array(1_000_001))
          started()
        },
        cancel() { cancelled++ },
      })
      globalThis.fetch = async () => new Response(stream, {
        status: mode === 'http' ? 403 : 200,
        headers: mode === 'header' ? { 'content-length': '1000001' } : {},
      })
      const pending = transport.publicRead(path, controller.signal)
      const rejected = assert.rejects(pending, mode === 'abort' ? /cancelled by fixture/ :
        mode === 'http' ? /GitHub API 403/ : /exceeds size budget/)
      if (mode === 'abort') {
        await pulling
        await new Promise(resolve => setImmediate(resolve))
        controller.abort(new Error('cancelled by fixture'))
      }
      await rejected
      assert.equal(cancelled, 1, mode)
      assert.equal(stream.locked, false, mode)
    }
  } finally { globalThis.fetch = oldFetch }
})

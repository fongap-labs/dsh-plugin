import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/tools/github.js'

const REPO = 'fongap-labs/delta-test'
const ROOT = '/repos/' + REPO
const HEAD = 'a'.repeat(40)
const NEW_COMMIT = 'b'.repeat(40)
const BASE_TREE = 'c'.repeat(40)
const NEW_TREE = 'd'.repeat(40)
const TOKEN_NAME = 'DSH_GITHUB_CONCURRENCY_TEST_TOKEN'
const exec = () => ({ signal: new AbortController().signal })

function makeTestFixture(callback = () => null) {
  const requests = []
  const previousFetch = globalThis.fetch
  const originalEnv = process.env[TOKEN_NAME]
  process.env[TOKEN_NAME] = 'test-private-token'
  let latestSha = HEAD
  let openPr = null
  globalThis.fetch = async (raw, options = {}) => {
    const uri = new URL(raw)
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : undefined
    const request = { method, path: uri.pathname, query: uri.searchParams, body, authorization: options.headers.Authorization }
    requests.push(request)
    const override = await callback({ ...request, latestSha, openPr, setPr: pr => { openPr = pr }, setHead: sha => { latestSha = sha } })
    if (override instanceof Response) return override
    if (override instanceof Error) throw override
    if (uri.pathname === ROOT && method === 'GET') return json({ default_branch: 'main' })
    if (uri.pathname === ROOT + '/git/ref/heads/feat/improve' && method === 'GET') return json({ object: { sha: latestSha } })
    if (uri.pathname === ROOT + '/contents/src/worker.ts' && method === 'GET') {
      assert.equal(uri.searchParams.get('ref'), HEAD)
      return json({ type: 'file', sha: 'e'.repeat(40), path: 'src/worker.ts' })
    }
    if (uri.pathname === ROOT + '/git/commits/' + HEAD && method === 'GET') return json({ tree: { sha: BASE_TREE } })
    if (uri.pathname === ROOT + '/git/trees' && method === 'POST') return json({ sha: NEW_TREE }, 201)
    if (uri.pathname === ROOT + '/git/commits' && method === 'POST') return json({ sha: NEW_COMMIT }, 201)
    if (uri.pathname === ROOT + '/git/ref/heads/feat/improve' && method === 'PATCH') {
      if (latestSha !== HEAD) return json({ message: 'non fast forward' }, 422)
      latestSha = NEW_COMMIT
      return json({ object: { sha: NEW_COMMIT } })
    }
    if (uri.pathname === ROOT + '/pulls' && method === 'GET') {
      return json(openPr ? [openPr] : [])
    }
    if (uri.pathname === ROOT + '/pulls' && method === 'POST') {
      openPr = prEntry(41)
      return json({ number: 41, html_url: openPr.html_url }, 201)
    }
    return json({ message: 'unexpected route: ' + method + ' ' + uri.pathname }, 404)
  }
  const settings = normalizeConfig({
    github: {
      allowWrites: true,
      accounts: [{ owner: 'fongap-labs', tokenEnv: TOKEN_NAME }],
    },
  })
  const tools = createGitHubTools({ get: () => undefined }, settings)
  return {
    requests,
    tool: name => tools.find(item => item.name === 'code_github_' + name),
    restore() {
      globalThis.fetch = previousFetch
      if (originalEnv === undefined) delete process.env[TOKEN_NAME]
      else process.env[TOKEN_NAME] = originalEnv
    },
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function prEntry(number) {
  return {
    number,
    html_url: 'https://github.com/' + REPO + '/pull/' + number,
    head: { ref: 'feat/improve', repo: { full_name: REPO } },
    base: { ref: 'main' },
  }
}

const commitArgs = {
  repository: REPO, branch: 'feat/improve', path: 'src/worker.ts',
  content: 'export const x = 2', message: 'fix: preserve branch evidence',
}
const prArgs = { repository: REPO, head: 'feat/improve', title: 'fix: test concurrency' }

describe('Delta Code Worker GitHub remote write safety', () => {
  it('writes via non-force fast-forward using one pinned branch HEAD', async () => {
    const f = makeTestFixture()
    try {
      const response = await f.tool('commit_file').execute({ ...commitArgs, expectedHead: HEAD }, exec())
      const value = JSON.parse(response.result)
      assert.equal(value.commit, NEW_COMMIT)
      assert.equal(value.previousHead, HEAD)
      const tree = f.requests.find(x => x.method === 'POST' && x.path.endsWith('/git/trees'))
      const commit = f.requests.find(x => x.method === 'POST' && x.path.endsWith('/git/commits'))
      const patch = f.requests.find(x => x.method === 'PATCH')
      assert.equal(tree.body.base_tree, BASE_TREE)
      assert.deepEqual(tree.body.tree, [{ path: commitArgs.path, mode: '100644', type: 'blob', content: commitArgs.content }])
      assert.deepEqual(commit.body.parents, [HEAD])
      assert.deepEqual(patch.body, { sha: NEW_COMMIT, force: false })
      assert.ok(f.requests.every(req => req.authorization === 'Bearer test-private-token'))
      assert.doesNotMatch(JSON.stringify(response), /test-private-token/)
    } finally { f.restore() }
  })

  it('rejects a stale caller expectedHead before any write', async () => {
    const f = makeTestFixture()
    try {
      await assert.rejects(f.tool('commit_file').execute({ ...commitArgs, expectedHead: 'f'.repeat(40) }, exec()),
        /HEAD differs from expectedHead/)
      assert.equal(f.requests.filter(x => x.method !== 'GET').length, 0)
    } finally { f.restore() }
  })

  it('does not force or retry if another writer advances the branch before ref update', async () => {
    const f = makeTestFixture(request => {
      if (request.path.endsWith('/git/commits') && request.method === 'POST') {
        request.setHead('e'.repeat(40))
      }
      return null
    })
    try {
      await assert.rejects(f.tool('commit_file').execute(commitArgs, exec()), /non-fast-forward branch conflict/)
      const patches = f.requests.filter(x => x.method === 'PATCH')
      assert.equal(patches.length, 1)
      assert.equal(patches[0].body.force, false)
    } finally { f.restore() }
  })

  it('never retries a GitHub 403 or 401 write denial or exposes its token', async () => {
    const f = makeTestFixture(req => req.method === 'POST' && req.path.endsWith('/git/trees')
      ? json({ message: 'permission denied' }, 403) : null)
    try {
      await assert.rejects(f.tool('commit_file').execute(commitArgs, exec()), /403.*permission denied/)
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 1)
      assert.equal(f.requests.filter(x => x.method === 'PATCH').length, 0)
    } finally { f.restore() }
  })

  it('confirms an ambiguous branch ref update through a read, without retrying PATCH', async () => {
    const f = makeTestFixture(req => {
      if (req.method === 'PATCH') {
        req.setHead(NEW_COMMIT)
        return new Error('transport timed out after commit')
      }
      return null
    })
    try {
      const response = await f.tool('commit_file').execute(commitArgs, exec())
      assert.equal(JSON.parse(response.result).confirmedAfterRead, true)
      assert.equal(f.requests.filter(x => x.method === 'PATCH').length, 1)
    } finally { f.restore() }
  })

  it('reuses an existing open PR without posting another', async () => {
    const f = makeTestFixture(req => {
      if (req.method === 'GET' && req.path.endsWith('/pulls')) {
        return json([prEntry(21)])
      }
      return null
    })
    try {
      const response = await f.tool('create_pr').execute(prArgs, exec())
      assert.deepEqual(JSON.parse(response.result), {
        number: 21, url: 'https://github.com/' + REPO + '/pull/21', reused: true,
      })
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 0)
      const list = f.requests.find(x => x.path.endsWith('/pulls'))
      assert.equal(list.query.get('head'), 'fongap-labs:feat/improve')
      assert.equal(list.query.get('base'), 'main')
    } finally { f.restore() }
  })

  it('creates exactly one PR for a head/base pair when no open PR exists', async () => {
    const f = makeTestFixture()
    try {
      const first = await f.tool('create_pr').execute(prArgs, exec())
      const second = await f.tool('create_pr').execute(prArgs, exec())
      assert.equal(JSON.parse(first.result).reused, false)
      assert.equal(JSON.parse(second.result).reused, true)
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 1)
    } finally { f.restore() }
  })

  it('recovers a concurrent PR create 422 by reading the new PR; never retries POST', async () => {
    let isRaceTriggered = false
    const f = makeTestFixture(req => {
      if (req.method === 'POST' && req.path.endsWith('/pulls') && !isRaceTriggered) {
        isRaceTriggered = true
        req.setPr(prEntry(48))
        return json({ message: 'A pull request already exists' }, 422)
      }
      return null
    })
    try {
      const value = await f.tool('create_pr').execute(prArgs, exec())
      assert.equal(JSON.parse(value.result).number, 48)
      assert.equal(JSON.parse(value.result).reused, true)
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 1)
    } finally { f.restore() }
  })

  it('recovers a lost POST response only with a read-only check of the existing PR', async () => {
    const f = makeTestFixture(req => {
      if (req.method === 'POST' && req.path.endsWith('/pulls')) {
        req.setPr(prEntry(59))
        return new Error('connection lost after remote creation')
      }
      return null
    })
    try {
      const value = await f.tool('create_pr').execute(prArgs, exec())
      assert.equal(JSON.parse(value.result).number, 59)
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 1)
    } finally { f.restore() }
  })

  it('fails closed on PR creation permission denial without a recovery write', async () => {
    const f = makeTestFixture(req =>
      req.method === 'POST' && req.path.endsWith('/pulls') ? json({ message: 'forbidden' }, 403) : null)
    try {
      await assert.rejects(f.tool('create_pr').execute(prArgs, exec()), /403.*permission denied/)
      assert.equal(f.requests.filter(x => x.method === 'POST').length, 1)
      assert.equal(f.requests.filter(x => x.method === 'GET' && x.path.endsWith('/pulls')).length, 1)
    } finally { f.restore() }
  })
})

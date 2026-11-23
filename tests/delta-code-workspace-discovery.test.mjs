import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createWorkspaceMapTool, rankTrackedFiles } from '../packages/delta-code/lib/tools/workspace.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'

import { createSessionRepositoryTool, createSessionRepositoryCommand } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/session-repositories.js'
import { createMultiEditTool } from '../packages/delta-code/lib/tools/multi-edit.js'
import {
  SESSION_REPOSITORY_EMPTY, foldSessionRepositoryEvent,
  parseSessionRepositoryState, REPOSITORY_EVENT_MARKER,
} from '../packages/delta-code/lib/delta-code-repository/session-repository-policy.js'
import { mockHostFsContext } from './helpers/host-fs-mock.mjs'
import { mockHostCommandResult } from './helpers/host-subprocess-mock.mjs'

const git = promisify(execFile)
const execution = () => ({ signal: new AbortController().signal })
const localContext = { get: () => undefined }

async function makeRepo(directory, paths) {
  await mkdir(directory, { recursive: true })
  await git('git', ['init', '-q'], { cwd: directory })
  for (const path of paths) {
    const absolute = join(directory, path)
    await mkdir(join(absolute, '..'), { recursive: true })
    await writeFile(absolute, 'sample', 'utf8')
  }
  await git('git', ['add', '--', ...paths], { cwd: directory })
}

describe('Delta Code Worker bounded multi-repo discovery', () => {
  it('keeps matches when extra Chinese or English query terms do not match', () => {
    assert.deepEqual(rankTrackedFiles([
      'src/sidebar.ts', 'src/other.ts', 'docs/notes.md',
    ], 'sidebar workspace 悬浮框 置顶会话', 10), ['src/sidebar.ts'])
  })

  it('finds tracked files from immediate child repositories and returns workspace-relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-container-'))
    try {
      await makeRepo(join(root, 'dsh-plugin'), ['src/sidebar.ts', 'src/other.ts'])
      await makeRepo(join(root, 'dsh-upstream'), ['src/sidebar-view.ts', 'src/runtime.ts'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const value = await tool.execute({ query: 'sidebar workspace 悬浮框', limit: 10 }, execution())
      assert.equal(value.total, 4)
      assert.deepEqual(value.repositories, ['dsh-plugin', 'dsh-upstream'])
      assert.deepEqual(value.selected, ['dsh-plugin/src/sidebar.ts', 'dsh-upstream/src/sidebar-view.ts'])
      assert.equal(value.truncated, true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('uses an explicit repository cwd without searching siblings and still prefixes workspace-relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-explicit-'))
    try {
      await makeRepo(join(root, 'repo-a'), ['src/sidebar.ts'])
      await makeRepo(join(root, 'repo-b'), ['src/sidebar.ts'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const value = await tool.execute({ cwd: 'repo-b', query: 'sidebar', limit: 10 }, execution())
      assert.equal(value.total, 1)
      assert.deepEqual(value.repositories, ['repo-b'])
      assert.deepEqual(value.selected, ['repo-b/src/sidebar.ts'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('batches several lookups in a single fresh tracked-file index', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-batch-'))
    try {
      await makeRepo(root, ['src/sidebar.ts', 'src/runtime.ts', 'docs/notes.md'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const batch = await tool.execute({ queries: ['sidebar', 'runtime', 'missing'], limit: 5 }, execution())
      assert.equal(batch.total, 3)
      assert.deepEqual(batch.selected, [])
      assert.deepEqual(batch.queryResults, [
        { query: 'sidebar', selected: ['src/sidebar.ts'], truncated: false },
        { query: 'runtime', selected: ['src/runtime.ts'], truncated: false },
        { query: 'missing', selected: [], truncated: false },
      ])
      assert.deepEqual(batch.repositories, ['.'])
      const legacy = await tool.execute({ query: 'sidebar', limit: 5 }, execution())
      assert.deepEqual(legacy.selected, ['src/sidebar.ts'])
      assert.deepEqual(legacy.queryResults, [])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('reads fresh Git paths for each call after staged additions and deletions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-refresh-'))
    try {
      await makeRepo(root, ['src/original.ts'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const first = await tool.execute({ queries: ['added', 'original'] }, execution())
      assert.deepEqual(first.queryResults[0].selected, [])
      await mkdir(join(root, 'src'), { recursive: true })
      await writeFile(join(root, 'src/added.ts'), 'sample')
      await git('git', ['add', '--', 'src/added.ts'], { cwd: root })
      const second = await tool.execute({ queries: ['added', 'original'] }, execution())
      assert.deepEqual(second.queryResults[0].selected, ['src/added.ts'])
      await git('git', ['rm', '--cached', 'src/original.ts'], { cwd: root })
      const third = await tool.execute({ queries: ['added', 'original'] }, execution())
      assert.deepEqual(third.queryResults[1].selected, [])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects invalid query batches before filesystem or Git calls', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-invalid-batch-'))
    try {
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      for (const args of [
        { query: 'sidebar', queries: ['runtime'] },
        { queries: [] }, { queries: ['x', 'X'] },
        { queries: Array.from({ length: 9 }, (_, i) => String(i)) },
        { queries: ['../src\\bad'] }, { queries: ['test\ninvalid'] },
        { queries: [''] }, { limit: 0.5 },
      ]) {
        await assert.rejects(tool.execute(args, execution()), /query|queries|limit/)
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('caps aggregate multi-query results even with maximum per-query limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-batch-limit-'))
    try {
      const files = Array.from({ length: 90 }, (_, i) => 'src/item-' + i + '.ts')
      await makeRepo(root, files)
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const out = await tool.execute({ queries: ['item', 'src', 'ts', 'item-'], limit: 250 }, execution())
      assert.equal(out.queryResults.length, 4)
      assert.ok(out.queryResults.every(item => item.selected.length <= 62 && item.truncated))
      assert.ok(out.queryResults.reduce((sum, item) => sum + item.selected.length, 0) <= 250)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('preserves the current single-repository path behavior', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-single-'))
    try {
      await makeRepo(root, ['src/sidebar.ts', 'README.md'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const value = await tool.execute({ query: 'sidebar', limit: 10 }, execution())
      assert.deepEqual(value.repositories, ['.'])
      assert.deepEqual(value.selected, ['src/sidebar.ts'])
      assert.equal(value.total, 2)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not follow a child symlink to a repository outside the workspace', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-link-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-workspace-link-target-'))
    try {
      await makeRepo(join(root, 'safe-repo'), ['src/safe.ts'])
      await makeRepo(outside, ['src/secret.ts'])
      await symlink(outside, join(root, 'unsafe-repo'), 'dir')
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      const value = await tool.execute({ query: 'src', limit: 10 }, execution())
      assert.deepEqual(value.repositories, ['safe-repo'])
      assert.ok(value.selected.every(path => path.startsWith('safe-repo/')))
      assert.equal(value.total, 1)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects more than 96 local direct subdirectories before probing Git markers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-dir-overflow-'))
    try {
      await Promise.all(Array.from({ length: 97 }, (_, index) =>
        mkdir(join(root, 'child-' + index))))
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({}, execution()), /too many subdirectories to scan safely/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('limits repository discovery instead of silently dropping repositories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-overflow-'))
    try {
      for (let i = 0; i < 13; i++) await mkdir(join(root, 'repo-' + i, '.git'), { recursive: true })
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({ limit: 20 }, execution()), /too many Git repositories; specify cwd/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not hide a failed explicit Git root by searching other repositories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-denied-'))
    try {
      await mkdir(join(root, 'broken'), { recursive: true })
      await writeFile(join(root, 'broken', '.git'), 'gitdir: missing-directory')
      await makeRepo(join(root, 'good'), ['src/sidebar.ts'])
      const tool = createWorkspaceMapTool(localContext, normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({ cwd: 'broken', query: 'sidebar' }, execution()), /specified Git repository could not be indexed/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not invoke local Node Git after the mounted Host explicitly denies indexing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-workspace-host-denied-'))
    try {
      await makeRepo(join(root, 'git-repo'), ['src/sidebar.ts'])
      let spawns = 0
      const ctx = { get: () => undefined, subprocess: { spawn() {
        spawns += 1
        throw new Error('Host denied repository enumeration')
      } } }
      const tool = createWorkspaceMapTool(ctx, normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({ query: 'sidebar' }, execution()), /Host denied repository enumeration/)
      assert.equal(spawns, 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})


const EXTERNAL_REPO = '/dsh-approved-external/repo-a'
const OTHER_REPO = '/dsh-unapproved-external/repo-b'
function sessionRepoFixture(allowed = [EXTERNAL_REPO], options = {}) {
  const commands = []
  const seenPaths = []
  const writes = []
  const fs = {
    async resolve(path) {
      seenPaths.push(path)
      if (options.denyFs) throw new Error('Host FS denied external root')
      return { path }
    },
    async stat(target) {
      if (options.noDirectory) return undefined
      if (/\.(?:ts|tsx|js|json)$/.test(target.path)) {
        return { type: 'file', size: Buffer.byteLength(options.fileContent ?? 'export const value = 1') }
      }
      return { type: 'directory' }
    },
    contains(parent, target) {
      return target.path === parent.path || target.path.startsWith(parent.path + '/')
    },
    async readText(target) { return options.fileContent ?? 'export const value = 1\\n' },
    async writeText(target, content) { writes.push({ path: target.path, content }) },
    processPath(target) {
      return options.changedRoot ?? target.path
    },
  }
  if (options.incompleteFs) delete fs.processPath
  const ctx = mockHostFsContext(fs, {
    subprocess: { spawn(spec) {
      commands.push(spec)
      if (options.denyGit) throw new Error('Host denied Git subprocess')
      if (spec.argv[1] === 'rev-parse') {
        return mockHostCommandResult({ stdout: (options.wrongGitRoot ?? spec.cwd) + '\n' })
      }
      if (spec.argv[1] === '--no-optional-locks' && spec.argv[2] === 'status') {
        return mockHostCommandResult({ stdout: '## main\0 M src/changed.ts\0' })
      }
      if (spec.argv[1] === 'ls-files') {
        return mockHostCommandResult({ stdout: 'src/module.ts\0src/other.ts\0' })
      }
      throw new Error('Unexpected Host Git command: ' + spec.argv.join(' '))
    } },
  })
  const settings = normalizeConfig({
    workspaceRoot: '/dsh-primary',
    sessionRepositories: { readOnlyRoots: allowed, writeRoots: options.writeRoots ?? [] },
  })
  let state = { ...SESSION_REPOSITORY_EMPTY, bindings: [], pending: [] }
  let seq = 1
  const agent = { session: {
    id: 'owning-session',
    append(type, data) {
      const eventSeq = seq++
      state = foldSessionRepositoryEvent(state, { type, seq: eventSeq, data })
      return { seq: eventSeq }
    },
  } }
  const reader = {
    read: who => who === agent ? parseSessionRepositoryState(state) : undefined,
    dispose() {},
  }
  const tool = createSessionRepositoryTool(ctx, settings, reader)
  const run = async (args, who = agent) => {
    if (who !== agent) return tool.execute(args, { agent: who, signal: new AbortController().signal })
    const callId = 'call_' + seq
    state = foldSessionRepositoryEvent(state, {
      type: 'tool/call', seq: seq++, data: {
        name: 'code_session_repositories', callId, arguments: JSON.stringify(args),
      },
    })
    try {
      const output = await tool.execute(args, { agent: who, signal: new AbortController().signal })
      const rendered = tool.output.render(args, output)[0].text
      state = foldSessionRepositoryEvent(state, {
        type: 'tool/result', seq: seq++, data: {
          message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId,
            isError: false, content: [{ type: 'text', text: rendered }] },
        },
      })
      return output
    } catch (error) {
      state = foldSessionRepositoryEvent(state, {
        type: 'tool/result', seq: seq++, data: {
          message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId,
            isError: true, content: [{ type: 'text', text: String(error) }] },
        },
      })
      throw error
    }
  }
  const accept = () => {}
  return { ctx, settings, tool, run, accept, reader, get state() { return state }, commands, seenPaths, writes, agent }
}

describe('Delta Code native Session read-only repository bindings', () => {
  it('associates two explicit roots without switching the main workspace or running write commands', async () => {
    const f = sessionRepoFixture([EXTERNAL_REPO, OTHER_REPO])
    const first = await f.run({ action: 'attach', path: EXTERNAL_REPO })
    f.accept({ action: 'attach', path: EXTERNAL_REPO }, first)
    const second = await f.run({ action: 'attach', path: OTHER_REPO })
    f.accept({ action: 'attach', path: OTHER_REPO }, second)
    const listed = await f.run({ action: 'list' })
    assert.equal(listed.repositories.length, 2)
    assert.equal(listed.repositories[0].readOnly, true)
    const id = listed.repositories[0].id
    const status = await f.run({ action: 'inspect', id })
    assert.equal(status.branch, 'main')
    assert.equal(status.unstaged, 1)
    const found = await f.run({ action: 'search', id, query: 'module' })
    assert.deepEqual(found.selected, ['src/module.ts'])
    assert.ok(f.commands.every(c => c.cwd !== '/dsh-primary' &&
      c.argv[0] === 'git' && ['rev-parse', '--no-optional-locks', 'ls-files'].includes(c.argv[1])))
    assert.equal(f.settings.workspaceRoot, '/dsh-primary')
    assert.equal(f.state.bindings.length, 2)
    const detached = await f.run({ action: 'detach', id })
    f.accept({ action: 'detach', id }, detached)
    assert.equal((await f.run({ action: 'list' })).repositories.length, 1)
  })

  it('reads attached repository files through Host FS without granting write access', async () => {
    const f = sessionRepoFixture()
    const args = { action: 'attach', path: EXTERNAL_REPO }
    const attached = await f.run(args)
    f.accept(args, attached)
    const id = f.state.bindings[0].id
    const result = await f.run({ action: 'read', id, path: 'src/module.ts' })
    assert.equal(result.file, 'src/module.ts')
    assert.match(result.content, /export const value/)
    assert.equal((await f.run({ action: 'list' })).repositories[0].readOnly, true)
    assert.equal(f.writes.length, 0)
  })

  it('exposes the same attach/detach operation through the native human command', async () => {
    const f = sessionRepoFixture()
    const command = createSessionRepositoryCommand(f.ctx, f.settings, f.reader)
    const signal = new AbortController().signal
    const attached = await command.handler({
      rawInput: 'attach ' + JSON.stringify(EXTERNAL_REPO), agent: f.agent, signal,
    })
    assert.equal(attached.kind, 'success')
    assert.equal(f.state.bindings.length, 1)
    const id = f.state.bindings[0].id
    const detached = await command.handler({ rawInput: 'detach ' + id, agent: f.agent, signal })
    assert.equal(detached.kind, 'success')
    assert.equal(f.state.bindings.length, 0)
  })

  it('does not permit UI commands to attach new repositories after Git is disabled', async () => {
    const f = sessionRepoFixture()
    const command = createSessionRepositoryCommand(f.ctx, f.settings, f.reader)
    f.settings.gitEnabled = false
    const signal = new AbortController().signal
    await assert.rejects(command.handler({
      rawInput: 'attach ' + JSON.stringify(EXTERNAL_REPO), agent: f.agent, signal,
    }), /native Git support is disabled/)
    assert.equal(f.state.bindings.length, 0)
    assert.equal(f.commands.length, 0)
    assert.equal(f.seenPaths.length, 0)
  })

  it('fails closed when an attached repository lacks complete native Host index capabilities', async () => {
    const f = sessionRepoFixture()
    await f.run({ action: 'attach', path: EXTERNAL_REPO })
    const id = f.state.bindings[0].id
    const mapped = createWorkspaceMapTool(f.ctx, f.settings, f.reader)
    await assert.rejects(mapped.execute({ repositoryId: id }, {
      agent: f.agent, signal: new AbortController().signal,
    }), /Host FS|native Host FS|Host capability|require/i)
  })

  it('allows multi-edit only for an attached repository in the separate write allowlist', async () => {
    const f = sessionRepoFixture([EXTERNAL_REPO], { writeRoots: [EXTERNAL_REPO] })
    const args = { action: 'attach', path: EXTERNAL_REPO }
    const attached = await f.run(args)
    f.accept(args, attached)
    const id = f.state.bindings[0].id
    const multiEdit = createMultiEditTool(f.ctx, f.settings, f.reader)
    const result = await multiEdit.execute({ repositoryId: id, edits: [
      { path: 'src/new.ts', content: 'export const created = true' },
    ] }, { agent: f.agent, signal: new AbortController().signal })
    assert.equal(result.applied, 1)
    assert.deepEqual(f.writes, [{
      path: EXTERNAL_REPO + '/src/new.ts', content: 'export const created = true',
    }])
    const readOnly = sessionRepoFixture([EXTERNAL_REPO])
    const readOnlyArgs = { action: 'attach', path: EXTERNAL_REPO }
    const readOnlyAttached = await readOnly.run(readOnlyArgs)
    readOnly.accept(readOnlyArgs, readOnlyAttached)
    const readOnlyEdit = createMultiEditTool(readOnly.ctx, readOnly.settings, readOnly.reader)
    await assert.rejects(readOnlyEdit.execute({ repositoryId: readOnly.state.bindings[0].id, edits: [
      { path: 'src/blocked.ts', content: 'must not be written' },
    ] }, { agent: readOnly.agent, signal: new AbortController().signal }), /writeRoots/)
    assert.equal(readOnly.writes.length, 0)
  })

  it('rejects unallowlisted roots before any Host file or Git access', async () => {
    const f = sessionRepoFixture()
    await assert.rejects(f.run({ action: 'attach', path: OTHER_REPO }), /configured by the user/)
    await assert.rejects(f.run({ action: 'attach', path: '../repo' }), /configured by the user/)
    assert.deepEqual(f.commands, [])
    assert.deepEqual(f.seenPaths, [])
  })

  it('rejects Host denial, missing Host FS methods and moved Git roots without Node fallback', async () => {
    for (const options of [
      { denyFs: true }, { incompleteFs: true },
      { noDirectory: true }, { changedRoot: '/other/location' },
      { wrongGitRoot: OTHER_REPO }, { denyGit: true },
    ]) {
      const f = sessionRepoFixture([EXTERNAL_REPO], options)
      await assert.rejects(f.run({ action: 'attach', path: EXTERNAL_REPO }), /Host|native|repository/)
    }
    const absent = sessionRepoFixture([EXTERNAL_REPO])
    const tool = createSessionRepositoryTool({ get: () => undefined },
      absent.settings, { read: () => ({ ...SESSION_REPOSITORY_EMPTY, bindings: [], pending: [] }), dispose() {} })
    await assert.rejects(tool.execute({ action: 'attach', path: EXTERNAL_REPO },
      { agent: absent.agent, signal: new AbortController().signal }), /mounted native Host FS/)
  })

  it('revokes inspection on allowlist removal but allows explicit detach of stale bindings', async () => {
    const f = sessionRepoFixture()
    const args = { action: 'attach', path: EXTERNAL_REPO }
    const value = await f.run(args)
    f.accept(args, value)
    const id = f.state.bindings[0].id
    f.settings.sessionReadOnlyRepositories = []
    const listed = await f.run({ action: 'list' })
    assert.equal(listed.revokedCount, 1)
    assert.deepEqual(listed.repositories, [])
    const before = f.commands.length
    await assert.rejects(f.run({ action: 'inspect', id }), /revoked/)
    assert.equal(f.commands.length, before)
    const detached = await f.run({ action: 'detach', id })
    f.accept({ action: 'detach', id }, detached)
    assert.equal(f.state.bindings.length, 0)
  })

  it('preserves session separation and refuses malformed or forged events', async () => {
    const f = sessionRepoFixture()
    await assert.rejects(f.run({ action: 'list' }, { session: { id: 'different' } }), /projection unavailable/)
    let state = { ...SESSION_REPOSITORY_EMPTY, bindings: [], pending: [] }
    state = foldSessionRepositoryEvent(state, { type: 'tool/call', seq: 1, data: {
      name: 'code_session_repositories', callId: 'call_a', arguments: '{"action":"attach"}',
    } })
    state = foldSessionRepositoryEvent(state, { type: 'tool/result', seq: 2, data: {
      message: { toolCallId: 'call_a', source: { kind: 'tool' }, isError: false,
        content: [{ type: 'text', text: REPOSITORY_EVENT_MARKER +
          '{"version":1,"action":"attach","id":"repo-aaaaaaaaaaaaaaaaaaaa","path":"/a","readOnly":false}' }] },
    } })
    assert.deepEqual(state.bindings, [])
    const bad = foldSessionRepositoryEvent(state, { type: 'tool/call', seq: 2, data: {} })
    assert.equal(bad.invalid, true)
  })
})

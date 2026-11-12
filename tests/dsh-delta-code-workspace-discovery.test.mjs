import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createWorkspaceMapTool, rankTrackedFiles } from '../packages/dsh-delta-code/lib/tools/workspace.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

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

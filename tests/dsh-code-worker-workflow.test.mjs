import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeConfig } from '../packages/dsh-code-worker/lib/runtime.js'
import { rankTrackedFiles, createWorkspaceMapTool } from '../packages/dsh-code-worker/lib/tools/workspace.js'
import { parseGitStatus } from '../packages/dsh-code-worker/lib/tools/git.js'
import { validateWorktreeName, createWorktreeTool } from '../packages/dsh-code-worker/lib/tools/worktree.js'
import { redactKnownTokens, createVerifyTool } from '../packages/dsh-code-worker/lib/tools/verify.js'

const git = promisify(execFile)
const ctx = { get: () => undefined }
const exec = { signal: new AbortController().signal }

describe('dsh-code-worker integrated workflow helpers', () => {
  it('parses ahead and behind from git porcelain headers independently', () => {
    const ahead = parseGitStatus('## feature...origin/feature [ahead 3, behind 2]\0 M src/a.ts\0')
    assert.equal(ahead.branch, 'feature')
    assert.equal(ahead.ahead, 3)
    assert.equal(ahead.behind, 2)
    assert.deepEqual(ahead.unstaged, ['M src/a.ts'])
    const behind = parseGitStatus('## branch...origin/branch [behind 5]\0')
    assert.equal(behind.ahead, 0)
    assert.equal(behind.behind, 5)
  })
  it('ranks relevant filenames without returning source content', () => {
    const files = ['docs/notes.md', 'src/server.ts', 'src/handler.ts', 'package.json']
    assert.deepEqual(rankTrackedFiles(files, 'handler', 2), ['src/handler.ts'])
    assert.equal(rankTrackedFiles(files, '', 2).length, 2)
  })
  it('rejects invalid worktree names and refs', () => {
    validateWorktreeName('fix-issue-123', 'HEAD')
    validateWorktreeName('add_feature', 'main')
    assert.throws(() => validateWorktreeName('../escape', 'main'), /invalid/)
    assert.throws(() => validateWorktreeName('safe', 'main~1'), /invalid/)
    assert.throws(() => validateWorktreeName('safe', '--help'), /invalid/)
  })
  it('redacts environment-sourced GitHub tokens in command output', () => {
    const previous = process.env.DSH_TEST_GROUP_TOKEN
    process.env.DSH_TEST_GROUP_TOKEN = 'abc12345'
    try {
      const settings = normalizeConfig({ github: { accounts: [
        { owner: 'group', tokenEnv: 'DSH_TEST_GROUP_TOKEN' },
        { owner: 'personal', tokenEnv: 'DSH_TEST_TOKEN_NOT_SET' },
      ] } })
      assert.equal(redactKnownTokens('abc abc12345 xyz', settings), 'abc [REDACTED] xyz')
    } finally {
      if (previous === undefined) delete process.env.DSH_TEST_GROUP_TOKEN
      else process.env.DSH_TEST_GROUP_TOKEN = previous
    }
  })
  it('does not allow command execution and worktree creation by default', async () => {
    const settings = normalizeConfig({})
    assert.equal(settings.allowCommands, false)
    assert.equal(settings.allowWorktreeWrites, false)
    await assert.rejects(createVerifyTool(ctx, settings).execute({ script: 'test' }, exec), /script execution disabled/)
    await assert.rejects(createWorktreeTool(ctx, settings).execute({ action: 'create', task: 'demo' }, exec), /host subprocess service/)
  })
  it('uses tracked files from git ls-files with query and limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-code-worker-workflow-'))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'src', 'handler.ts'), 'export const handler = 1')
      await writeFile(join(root, 'src', 'other.ts'), 'export const other = 2')
      await writeFile(join(root, 'README.md'), '# test')
      await git('git', ['init', '-q'], { cwd: root })
      await git('git', ['add', 'src/handler.ts', 'src/other.ts', 'README.md'], { cwd: root })
      const settings = normalizeConfig({ workspaceRoot: root })
      const tool = createWorkspaceMapTool(ctx, settings)
      const result = await tool.execute({ query: 'handler', limit: 3 }, exec)
      assert.equal(result.total, 3)
      assert.deepEqual(result.selected, ['src/handler.ts'])
      await assert.rejects(tool.execute({ limit: 251 }, exec), /limit/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

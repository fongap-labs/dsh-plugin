import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseGitStatus, createGitStatusTool, createGitDiffTool } from '../packages/dsh-delta-code/lib/tools/git.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const exec = { signal: new AbortController().signal }

function fakeHost(stdout = '', exitCode = 0, options = {}) {
  const calls = []
  const ctx = {
    get: () => undefined,
    subprocess: {
      spawn(spec) {
        calls.push(spec)
        if (options.deny) throw new Error('host denied git command')
        return {
          done: Promise.resolve({ exitCode }),
          collected: {
            stdout: { readFrom: () => ({ text: stdout, lossy: Boolean(options.lossy) }) },
            stderr: { readFrom: () => ({ text: 'fatal: git unavailable', lossy: false }) },
          },
        }
      },
    },
  }
  return { ctx, calls }
}

describe('Code Worker Git evidence handling', () => {
  it('parses porcelain -z rename/copy records without interpreting source paths as statuses', () => {
    const status = parseGitStatus('## feat/test...origin/feat/test [behind 3, ahead 2]\0R  renamed with space.ts\0original file.ts\0C  copied.ts\0source file.ts\0 M modified.ts\0?? new file.txt\0')
    assert.equal(status.branch, 'feat/test')
    assert.equal(status.ahead, 2)
    assert.equal(status.behind, 3)
    assert.deepEqual(status.staged, ['R renamed with space.ts', 'C copied.ts'])
    assert.deepEqual(status.unstaged, ['M modified.ts'])
    assert.deepEqual(status.untracked, ['new file.txt'])
    assert.equal(status.clean, false)
    assert.throws(() => parseGitStatus('## main\0R  new.ts\0'), /incomplete/)
  })

  it('refuses empty, truncated or malformed porcelain evidence instead of claiming a clean tree', () => {
    assert.deepEqual(parseGitStatus('## main\0').clean, true)
    assert.deepEqual(parseGitStatus('## HEAD (no branch)\0').clean, true)
    const malformed = [
      '',
      '## main',
      '## main\0\0',
      '## main\0 M changed.ts',
      '?? orphan.ts\0',
      '## main\0unexpected\0',
      '## main\0 M \0',
      '## main\0Z  file.ts\0',
      '## main\0   file.ts\0',
      '## main\0?  file.ts\0',
      '## main\0 M changed.ts\0garbage\0',
    ]
    for (const raw of malformed) {
      assert.throws(() => parseGitStatus(raw), /invalid|incomplete|missing/, JSON.stringify(raw))
    }
  })

  it('does not return a fabricated clean or empty status on Git failure', async () => {
    const host = fakeHost('', 128)
    const tool = createGitStatusTool(host.ctx, normalizeConfig({ workspaceRoot: process.cwd() }))
    await assert.rejects(tool.execute({}, exec), /code_git_status: git command failed with exit code 128/)
    assert.deepEqual(host.calls[0].argv, ['git', 'status', '--porcelain=v1', '--branch', '-z'])
  })

  it('rejects truncated Git status but continues to signal truncation on diffs', async () => {
    const host = fakeHost('## main\0?? file.txt\0', 0, { lossy: true })
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    await assert.rejects(createGitStatusTool(host.ctx, settings).execute({}, exec), /output truncated/)
    const result = await createGitDiffTool(host.ctx, settings).execute({}, exec)
    assert.equal(result.truncated, true)
  })

  it('reports Git diff failure rather than returning an empty successful diff', async () => {
    const host = fakeHost('', 129)
    await assert.rejects(
      createGitDiffTool(host.ctx, normalizeConfig({ workspaceRoot: process.cwd() })).execute({}, exec),
      /code_git_diff: git command failed with exit code 129/,
    )
  })

  it('never silently downgrades a denied DSH subprocess to local Node execution', async () => {
    const host = fakeHost('', 0, { deny: true })
    const settings = normalizeConfig({ workspaceRoot: process.cwd() })
    await assert.rejects(createGitStatusTool(host.ctx, settings).execute({}, exec), /host denied git command/)
    assert.equal(host.calls.length, 1)
  })

  it('rejects symlinked Git working directories outside the workspace', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-git-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-git-outside-'))
    try {
      await symlink(outside, join(root, 'link'), 'dir')
      const host = fakeHost('## main\0', 0)
      const tool = createGitStatusTool(host.ctx, normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({ cwd: 'link' }, exec), /escapes workspace/)
      assert.equal(host.calls.length, 0)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

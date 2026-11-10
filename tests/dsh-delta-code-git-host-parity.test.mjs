import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createGitStatusTool, createGitDiffTool } from '../packages/dsh-delta-code/lib/tools/git.js'
import { createGitHubTools } from '../packages/dsh-delta-code/lib/tools/github.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const ROOT = '/dsh-remote-code-worker-git-root'
const PROCESS_CWD = '/host-process/coding-checkout'
const TOKEN_ENV = 'DSH_DELTA_GIT_HOST_AUDIT_TOKEN'
const execution = () => ({ signal: new AbortController().signal })

function output(stdout) {
  return {
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

function fixture(options = {}) {
  const commands = []
  const inspections = []
  const fs = {
    async resolve(path) {
      inspections.push('resolve:' + path)
      if (options.rejectResolve) throw new Error('Host FS denied resolve')
      const localPath = path === ROOT ? ROOT : ROOT + '/' + path
      const actual = options.escapedFile && path === 'repo-a/external.ts'
        ? '/external/secret.ts' : localPath
      return { path: actual }
    },
    contains(root, target) {
      inspections.push('contains')
      if (options.rejectContain) return false
      return target.path === root.path || target.path.startsWith(root.path + '/')
    },
    async stat(target) {
      inspections.push('stat:' + target.path)
      if (options.rejectStat) throw new Error('Host FS denied metadata')
      return { type: 'directory' }
    },
    processPath(target) {
      inspections.push('processPath:' + target.path)
      return PROCESS_CWD + target.path.slice(ROOT.length)
    },
  }
  if (options.incompleteFs) delete fs.processPath
  const ctx = {
    get: key => key === 'fs' ? fs : undefined,
    ...(options.noSubprocess ? {} : {
      subprocess: { spawn(spec) {
        commands.push(spec)
        if (options.rejectSubprocess) throw new Error('Host refused Git inspection')
        if (spec.argv[1] === 'status') return output('## main\0?? temp.txt\0')
        if (spec.argv[1] === 'diff') return output('diff --git a/worker.ts b/worker.ts\n')
        if (spec.argv[1] === 'remote') return output('git@github.com:fongap-labs/demo.git\n')
        throw new Error('unexpected Git command ' + spec.argv.join(' '))
      } },
    }),
  }
  const settings = normalizeConfig({
    workspaceRoot: ROOT,
    github: { accounts: [{ owner: 'fongap-labs', tokenEnv: TOKEN_ENV }] },
  })
  return { ctx, fs, settings, commands, inspections }
}

describe('Code Worker Git, GitHub and Host FS authority parity', () => {
  it('uses the same remote Host execution cwd for Git status, diff and automatic GitHub origin', async () => {
    const f = fixture()
    const tokenBefore = process.env[TOKEN_ENV]
    const fetchBefore = globalThis.fetch
    process.env[TOKEN_ENV] = 'private-test-token'
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({
        default_branch: 'main', private: false, permissions: { pull: true },
      }), { status: 200 })
      const status = await createGitStatusTool(f.ctx, f.settings).execute({}, execution())
      assert.deepEqual(status.untracked, ['temp.txt'])
      const diff = await createGitDiffTool(f.ctx, f.settings).execute({}, execution())
      assert.match(diff.diff, /worker.ts/)
      const connected = await createGitHubTools(f.ctx, f.settings)
        .find(item => item.name === 'code_github_connection').execute({}, execution())
      assert.equal(connected.repository, 'fongap-labs/demo')
      assert.equal(f.commands.length, 3)
      assert.ok(f.commands.every(command => command.cwd === PROCESS_CWD))
      assert.equal(f.inspections.filter(x => x === 'processPath:' + ROOT).length, 3)
    } finally {
      globalThis.fetch = fetchBefore
      if (tokenBefore === undefined) delete process.env[TOKEN_ENV]
      else process.env[TOKEN_ENV] = tokenBefore
    }
  })

  it('restricts diff paths to the selected repository using a literal Git pathspec', async () => {
    const f = fixture()
    await createGitDiffTool(f.ctx, f.settings).execute({
      cwd: 'repo-a', path: 'repo-a/src/worker.ts',
    }, execution())
    assert.deepEqual(f.commands[0].argv, [
      'git', 'diff', '--no-color', '--', ':(literal)src/worker.ts',
    ])
    assert.equal(f.commands[0].cwd, PROCESS_CWD + '/repo-a')
    assert.ok(f.inspections.includes('resolve:repo-a/src/worker.ts'))
  })

  it('refuses cross-repository and host-escaped diff paths before starting Git', async () => {
    const f = fixture({ escapedFile: true })
    for (const path of ['repo-b/src/worker.ts', 'repo-a/external.ts']) {
      await assert.rejects(createGitDiffTool(f.ctx, f.settings).execute({
        cwd: 'repo-a', path,
      }, execution()), /escapes selected repository/)
    }
    for (const path of ['../secret.ts', 'repo-a/../repo-b/secret.ts', 'C:\\secret.ts']) {
      await assert.rejects(createGitDiffTool(f.ctx, f.settings).execute({
        cwd: 'repo-a', path,
      }, execution()), /safe workspace-relative/)
    }
    assert.equal(f.commands.length, 0)
  })

  it('does not execute local Git when Host FS is present without subprocess', async () => {
    const f = fixture({ noSubprocess: true })
    await assert.rejects(createGitStatusTool(f.ctx, f.settings).execute({}, execution()), /host subprocess service unavailable/)
    await assert.rejects(createGitDiffTool(f.ctx, f.settings).execute({}, execution()), /host subprocess service unavailable/)
    const tokenBefore = process.env[TOKEN_ENV]
    process.env[TOKEN_ENV] = 'private-test-token'
    try {
      await assert.rejects(createGitHubTools(f.ctx, f.settings)
        .find(item => item.name === 'code_github_connection').execute({}, execution()), /host subprocess service unavailable/)
    } finally {
      if (tokenBefore === undefined) delete process.env[TOKEN_ENV]
      else process.env[TOKEN_ENV] = tokenBefore
    }
    assert.deepEqual(f.commands, [])
  })

  it('preserves Host FS denial and incomplete interface without local realpath fallback', async () => {
    for (const options of [{ rejectContain: true }, { rejectResolve: true },
      { incompleteFs: true }, { rejectStat: true }]) {
      const f = fixture(options)
      await assert.rejects(createGitStatusTool(f.ctx, f.settings).execute({}, execution()),
        /Host|Git|workspace/)
      await assert.rejects(createGitDiffTool(f.ctx, f.settings).execute({}, execution()),
        /Host|Git|workspace/)
      await assert.rejects(createGitHubTools(f.ctx, f.settings)
        .find(item => item.name === 'code_github_connection').execute({}, execution()),
        /Host|Git|workspace/)
      assert.deepEqual(f.commands, [], JSON.stringify(options))
    }
  })

  it('never retries a Host-denied Git process through Node for any Git inspection tool', async () => {
    const f = fixture({ rejectSubprocess: true })
    await assert.rejects(createGitStatusTool(f.ctx, f.settings).execute({}, execution()),
      /Host refused Git inspection/)
    await assert.rejects(createGitDiffTool(f.ctx, f.settings).execute({}, execution()),
      /Host refused Git inspection/)
    await assert.rejects(createGitHubTools(f.ctx, f.settings)
      .find(item => item.name === 'code_github_connection').execute({}, execution()),
      /Host refused Git inspection/)
    assert.equal(f.commands.length, 3)
  })
})

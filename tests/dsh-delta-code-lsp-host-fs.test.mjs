import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { createLspProbeTool } from '../packages/dsh-delta-code/lib/tools/lsp.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const ROOT = join(tmpdir(), 'dsh-code-lsp-virtual-host-only-workspace')
const HOST_CWD = '/host-authorized-lsp-workspace'
const execute = () => ({ signal: new AbortController().signal })

function hostOutput(stdout = 'typescript-language-server 1.0') {
  return {
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

function fixture(options = {}) {
  const calls = []
  const accesses = []
  const fs = {
    async resolve(path) {
      accesses.push('resolve:' + path)
      if (options.denyResolve) throw new Error('Host FS denied resolve')
      return { path }
    },
    contains(root, target) {
      accesses.push('contains')
      if (options.denyContain) return false
      return target.path === root.path || target.path.startsWith(root.path + sep)
    },
    async stat(target, signal) {
      accesses.push('stat:' + target.path)
      if (options.abortOnStat) options.abortOnStat.abort()
      if (signal?.aborted) throw new Error('Host FS cancelled')
      if (options.denyStat) throw new Error('Host FS denied stat')
      return { type: options.notDirectory ? 'file' : 'directory' }
    },
    processPath() {
      accesses.push('processPath')
      return options.invalidProcessPath ?? HOST_CWD
    },
  }
  if (options.incompleteFs) delete fs.processPath
  const ctx = {
    get: name => name === 'fs' ? fs : undefined,
    ...(options.noSubprocess ? {} : { subprocess: {
      spawn(spec) {
        calls.push(spec)
        return hostOutput()
      },
    } }),
  }
  const settings = normalizeConfig({
    workspaceRoot: ROOT,
    lsp: { servers: [{ language: 'typescript', command: 'typescript-language-server' }] },
  })
  return { ctx, fs, settings, calls, accesses }
}

describe('DSH Code Worker LSP Host FS authority', () => {
  it('runs a virtual Host FS probe in its Host processPath without local Node realpath', async () => {
    const f = fixture()
    const result = await createLspProbeTool(f.ctx, f.settings).execute({}, execute())
    assert.equal(result.servers.length, 1)
    assert.equal(result.servers[0].available, true)
    assert.deepEqual(f.calls[0].argv, ['typescript-language-server', '--version'])
    assert.equal(f.calls[0].cwd, HOST_CWD)
    assert.ok(f.accesses.includes('processPath'))
  })

  it('denies an out-of-scope directory before executing a probe', async () => {
    const f = fixture({ denyContain: true })
    await assert.rejects(
      createLspProbeTool(f.ctx, f.settings).execute({}, execute()),
      /escapes Host workspace/,
    )
    assert.equal(f.calls.length, 0)
  })

  it('does not fall back to local file paths when Host FS is partial or denies access', async () => {
    for (const option of [
      { incompleteFs: true }, { denyResolve: true }, { denyStat: true },
      { notDirectory: true }, { invalidProcessPath: '' },
      { invalidProcessPath: '\0escaped' },
    ]) {
      const f = fixture(option)
      await assert.rejects(
        createLspProbeTool(f.ctx, f.settings).execute({}, execute()),
        /Host|Git|workspace|directory|process path/,
      )
      assert.equal(f.calls.length, 0)
    }
  })

  it('never falls back to Node when Host FS exists but the subprocess service is unavailable', async () => {
    const f = fixture({ noSubprocess: true })
    const result = await createLspProbeTool(f.ctx, f.settings).execute({}, execute())
    assert.equal(result.servers[0].available, false)
    assert.match(result.servers[0].note, /host|subprocess|executor/i)
    assert.equal(f.calls.length, 0)
  })

  it('honors cancellation during Host directory metadata without spawning', async () => {
    const controller = new AbortController()
    const f = fixture({ abortOnStat: controller })
    await assert.rejects(
      createLspProbeTool(f.ctx, f.settings).execute({}, { signal: controller.signal }),
      /cancelled|canceled/,
    )
    assert.equal(f.calls.length, 0)
  })

  it('retains a local realpath symlink escape guard when no Host FS is mounted', {
    skip: process.platform === 'win32',
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lsp-guard-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-lsp-outside-'))
    try {
      await symlink(outside, join(root, 'escape'), 'dir')
      const f = fixture()
      const ctx = { get: () => undefined, subprocess: f.ctx.subprocess }
      const settings = normalizeConfig({
        workspaceRoot: root,
        lsp: { servers: [{ language: 'typescript', command: 'typescript-language-server' }] },
      })
      await assert.rejects(
        createLspProbeTool(ctx, settings).execute({ cwd: 'escape' }, execute()),
        /escapes workspace/,
      )
      assert.equal(f.calls.length, 0)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

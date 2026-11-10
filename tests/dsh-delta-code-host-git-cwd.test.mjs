import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { resolveAuthorizedGitCwd } from '../packages/dsh-delta-code/lib/tools/host-git-cwd.js'
import { createNativeResumeTool } from '../packages/dsh-delta-code/lib/tools/resume.js'
import { createDeliveryGateTool } from '../packages/dsh-delta-code/lib/tools/delivery-gate.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const HEAD = 'a'.repeat(40)
const VIRTUAL_ROOT = join(tmpdir(), 'dsh-code-worker-virtual-host-fs-only', 'workspace')
const PROCESS_CWD = '/host-process-workspace/authorized-git'
const pending = [{ content: 'Implement task', status: 'pending' }]
const completed = [{ content: 'Implement task', status: 'completed' }]
const exec = () => ({ agent: { session: { id: 'test-session' } }, signal: new AbortController().signal })

function mockOutput(stdout = '') {
  return {
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

function fakeHost(options = {}) {
  const accesses = []
  const commands = []
  const fs = {
    async resolve(path) {
      accesses.push('resolve:' + path)
      if (options.denyResolve) throw new Error('DSH Host FS denied resolution')
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
      if (signal?.aborted) throw new Error('DSH Host FS cancelled')
      if (options.denyStat) throw new Error('DSH Host FS denied stat')
      if (options.notDirectory && target.path === VIRTUAL_ROOT) return { type: 'file' }
      if (target.path.endsWith(sep + 'package.json')) return { type: 'file' }
      return { type: 'directory' }
    },
    async readText(target) {
      accesses.push('readText:' + target.path)
      if (options.denyRead) throw new Error('DSH Host FS denied read')
      return JSON.stringify({ scripts: { test: 'node --test' } })
    },
    processPath() {
      accesses.push('processPath')
      return options.invalidPath ?? PROCESS_CWD
    },
  }
  if (options.incomplete) delete fs.processPath
  const ctx = {
    get: name => name === 'fs' ? fs : undefined,
    subprocess: {
      spawn(spec) {
        commands.push({ argv: spec.argv, cwd: spec.cwd })
        if (spec.argv[0] === 'git') {
          if (spec.argv[1] === 'rev-parse') return mockOutput(HEAD + '\n')
          if (spec.argv[1] === 'status') return mockOutput('## main\0')
          if (spec.argv[1] === 'diff') return mockOutput()
        }
        if (spec.argv[0] === 'npm') return mockOutput('tests passed')
        throw new Error('unexpected Host command: ' + spec.argv.join(' '))
      },
    },
  }
  const settings = normalizeConfig({
    workspaceRoot: VIRTUAL_ROOT,
    execution: { allowCommands: true },
  })
  return { ctx, fs, settings, commands, accesses }
}

describe('Delta Code Worker Host FS Git cwd authority', () => {
  it('maps a virtual Host FS directory to the subprocess execution path without Node realpath', async () => {
    const f = fakeHost()
    const cwd = await resolveAuthorizedGitCwd(f.ctx, VIRTUAL_ROOT, undefined, exec())
    assert.equal(cwd, PROCESS_CWD)
    assert.ok(f.accesses.includes('stat:' + VIRTUAL_ROOT))
    assert.ok(f.accesses.includes('processPath'))
    assert.deepEqual(f.commands, [])
  })

  it('uses exactly the same Host execution path for resumed Git and delivery tests', async () => {
    const f = fakeHost()
    const reader = {
      read: () => ({ tasks: pending, writeSeq: 5, invalid: false }),
      dispose() {},
    }
    const resume = createNativeResumeTool(f.ctx, f.settings, reader)
    const recovered = await resume.execute({ expectedHead: HEAD }, exec())
    assert.equal(recovered.stage, 'resume')
    assert.equal(recovered.head, HEAD)

    const gate = createDeliveryGateTool(f.ctx, f.settings)
    const checked = await gate.execute({
      tasks: completed, scripts: ['test'], expectedHead: HEAD,
    }, exec())
    assert.equal(checked.stage, 'verified')
    assert.deepEqual(checked.checks.map(x => x.passed), [true])
    assert.ok(f.commands.some(item => item.argv[0] === 'npm'))
    assert.ok(f.commands.every(item => item.cwd === PROCESS_CWD))
  })

  it('rejects incomplete or denied Host FS capabilities without local or subprocess fallback', async () => {
    for (const options of [
      { incomplete: true }, { denyResolve: true }, { denyContain: true },
      { denyStat: true }, { notDirectory: true }, { invalidPath: '' },
      { invalidPath: '\0unsafe' },
    ]) {
      const f = fakeHost(options)
      await assert.rejects(
        resolveAuthorizedGitCwd(f.ctx, VIRTUAL_ROOT, undefined, exec()),
        /Host|Git|process path/,
      )
      assert.deepEqual(f.commands, [], JSON.stringify(options))
    }
  })

  it('blocks both public tools before starting Git when Host FS refuses access', async () => {
    const f = fakeHost({ denyContain: true })
    const reader = {
      read: () => ({ tasks: pending, writeSeq: 9, invalid: false }),
      dispose() {},
    }
    const resumed = await createNativeResumeTool(f.ctx, f.settings, reader).execute({
      expectedHead: HEAD,
    }, exec())
    assert.equal(resumed.stage, 'blocked')
    const gate = await createDeliveryGateTool(f.ctx, f.settings).execute({
      tasks: completed, expectedHead: HEAD, scripts: ['test'],
    }, exec())
    assert.equal(gate.stage, 'blocked')
    assert.deepEqual(f.commands, [])
  })

  it('stops Host FS resolution on cancellation without running commands', async () => {
    const controller = new AbortController()
    const f = fakeHost({ abortOnStat: controller })
    await assert.rejects(
      resolveAuthorizedGitCwd(f.ctx, VIRTUAL_ROOT, undefined, {
        agent: {}, signal: controller.signal,
      }), /cancelled|canceled/,
    )
    assert.deepEqual(f.commands, [])
  })

  it('retains the local realpath compatibility path only if Host FS is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-git-cwd-legacy-'))
    try {
      const ctx = { get: () => undefined }
      assert.equal(await resolveAuthorizedGitCwd(ctx, root, undefined, exec()), await realpath(root))
      await assert.rejects(
        resolveAuthorizedGitCwd(ctx, root, 'nonexistent', exec()),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

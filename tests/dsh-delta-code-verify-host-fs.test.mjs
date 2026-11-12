import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { createVerifyTool } from '../packages/dsh-delta-code/lib/tools/verify.js'
import { createVerifySuiteTool } from '../packages/dsh-delta-code/lib/tools/verify-suite.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { mockHostPathContains, mockHostFsContext } from './helpers/host-fs-mock.mjs'
import { mockHostCommandResult } from './helpers/host-subprocess-mock.mjs'

const root = resolve('dsh-virtual-host-verification-workspace')
const HOST_EXECUTION_CWD = '/dsh-host-only-verify-execution-path'
const exec = () => ({ signal: new AbortController().signal })
function fakeHost(files, options = {}) {
  const observed = []
  const spawns = []
  let processCalls = 0
  const fs = {
    async resolve(path) {
      observed.push('resolve:' + path)
      if (options.rejectResolve) throw new Error('Host FS denied resolution')
      return { key: path }
    },
    contains(parent, target) {
      if (options.rejectContain && target.key.endsWith(sep + 'package.json')) return false
      if (options.rejectDirectoryContain && target.key === root) return false
      return mockHostPathContains(parent, target, 'key')
    },
    async stat(target) {
      observed.push('stat:' + target.key)
      if (options.rejectStat) throw new Error('Host FS denied metadata')
      if (target.key === root) return { type: options.notDirectory ? 'file' : 'directory' }
      return Object.hasOwn(files, target.key) ? { type: 'file' } : undefined
    },
    processPath(target) {
      observed.push('processPath:' + target.key)
      if (options.rejectProcessPath) throw new Error('Host FS denied process path')
      const value = options.processPaths?.[processCalls++]
      return value ?? (options.invalidProcessCwd ?? HOST_EXECUTION_CWD)
    },
    async readText(target) {
      observed.push('readText:' + target.key)
      if (options.rejectRead) throw new Error('Host FS denied manifest read')
      return files[target.key]
    },
  }
  if (options.noProcessPath) delete fs.processPath
  const ctx = mockHostFsContext(options.incompleteFs ? { resolve: fs.resolve } : fs, {
    subprocess: { spawn(spec) {
      spawns.push(spec)
      return mockHostCommandResult({ stdout: 'ok' })
    } },
  })
  return { ctx, observed, spawns }
}
const settings = normalizeConfig({ workspaceRoot: root, execution: { allowCommands: true } })
describe('Code Worker verification through DSH Host FS', () => {
  it('supports Host-only Node workspaces and Host-visible package managers', async () => {
    const host = fakeHost({
      [join(root, 'package.json')]: JSON.stringify({ scripts: { test: 'node --test' } }),
      [join(root, 'pnpm-lock.yaml')]: 'lockfile',
    })
    const result = await createVerifyTool(host.ctx, settings).execute({ script: 'test' }, exec())
    assert.equal(result.passed, true)
    assert.equal(result.failureKind, 'none')
    assert.match(result.nextAction, /Verification passed/)
    assert.equal(result.project, 'node')
    assert.deepEqual(host.spawns.map(item => item.argv), [['pnpm', 'run', 'test']])
    assert.equal(host.spawns[0].cwd, HOST_EXECUTION_CWD)
    assert.ok(host.observed.includes('processPath:' + root))
    assert.ok(host.observed.some(item => item.startsWith('readText:')))
  })
  it('uses Host metadata for Rust lockfile detection', async () => {
    const host = fakeHost({
      [join(root, 'Cargo.toml')]: '[package]',
      [join(root, 'Cargo.lock')]: 'locked',
    })
    const result = await createVerifyTool(host.ctx, settings).execute({ script: 'test' }, exec())
    assert.equal(result.project, 'rust')
    assert.deepEqual(host.spawns[0].argv, ['cargo', 'test', '--locked'])
    assert.equal(host.spawns[0].cwd, HOST_EXECUTION_CWD)
  })
  it('fails closed on Host resolution, stat and read denial', async () => {
    for (const options of [{ rejectStat: true }, { rejectRead: true }, { rejectResolve: true }]) {
      const host = fakeHost({ [join(root, 'package.json')]: '{"scripts":{"test":"ok"}}' }, options)
      await assert.rejects(
        createVerifyTool(host.ctx, settings).execute({ script: 'test' }, exec()),
        /Host FS denied/,
      )
      assert.equal(host.spawns.length, 0)
    }
  })
  it('rejects incomplete Host FS and unsafe containment without falling back', async () => {
    const files = { [join(root, 'package.json')]: '{"scripts":{"test":"ok"}}' }
    const incomplete = fakeHost(files, { incompleteFs: true })
    await assert.rejects(
      createVerifyTool(incomplete.ctx, settings).execute({ script: 'test' }, exec()),
      /missing resolve\/contains\/stat\/readText/,
    )
    assert.equal(incomplete.spawns.length, 0)
    const escaped = fakeHost(files, { rejectContain: true })
    await assert.rejects(
      createVerifyTool(escaped.ctx, settings).execute({ script: 'test' }, exec()),
      /package.json escapes the workspace/,
    )
    assert.equal(escaped.spawns.length, 0)
  })
  it('preflights a complete suite through Host FS before executing anything', async () => {
    const host = fakeHost({ [join(root, 'package.json')]: '{"scripts":{"test":"ok"}}' })
    await assert.rejects(
      createVerifySuiteTool(host.ctx, settings).execute({ scripts: ['test', 'build'] }, exec()),
      /does not declare script build/,
    )
    assert.equal(host.spawns.length, 0)
    assert.ok(host.observed.some(item => item.startsWith('readText:')))
  })
  it('probes project manifests and package scripts once per suite while authorizing each step', async () => {
    const host = fakeHost({
      [join(root, 'package.json')]: JSON.stringify({
        scripts: { test: 'node --test', build: 'tsc', lint: 'eslint .' },
      }),
    })
    const result = await createVerifySuiteTool(host.ctx, settings).execute({
      scripts: ['test', 'build', 'lint'],
    }, exec())
    assert.equal(result.passed, true)
    assert.equal(host.observed.filter(item => item === 'stat:' + join(root, 'package.json')).length, 1)
    assert.equal(host.observed.filter(item => item === 'readText:' + join(root, 'package.json')).length, 1)
    assert.equal(host.observed.filter(item => item === 'processPath:' + root).length, 3)
    assert.equal(host.spawns.length, 3)
  })

  it('rejects a changed Host FS mount during shared project preflight without spawning', async () => {
    const host = fakeHost({
      [join(root, 'package.json')]: JSON.stringify({ scripts: { test: 'node --test', build: 'tsc' } }),
    })
    const fs = host.ctx.get('fs')
    const original = fs.processPath
    fs.processPath = target => {
      const cwd = original(target)
      // A newly mounted Host may have different contents and capabilities.
      host.ctx.get = key => key === 'fs' ? { ...fs } : undefined
      return cwd
    }
    await assert.rejects(
      createVerifySuiteTool(host.ctx, settings).execute({ scripts: ['test', 'build'] }, exec()),
      /project changed during preflight/,
    )
    assert.deepEqual(host.spawns, [])
  })

  it('runs the entire verification suite in the same Host process cwd', async () => {
    const host = fakeHost({
      [join(root, 'package.json')]: JSON.stringify({ scripts: { test: 'node --test', build: 'tsc' } }),
    })
    const result = await createVerifySuiteTool(host.ctx, settings).execute({
      scripts: ['test', 'build'],
    }, exec())
    assert.equal(result.passed, true)
    assert.deepEqual(host.spawns.map(item => item.argv), [
      ['npm', 'run', 'test'], ['npm', 'run', 'build'],
    ])
    assert.ok(host.spawns.every(item => item.cwd === HOST_EXECUTION_CWD))
  })
  it('blocks a suite before its first command if Host processPath changes between scripts', async () => {
    const host = fakeHost({
      [join(root, 'package.json')]: JSON.stringify({ scripts: { test: 'node --test', build: 'tsc' } }),
    }, { processPaths: [HOST_EXECUTION_CWD, '/different-host-process-cwd'] })
    await assert.rejects(
      createVerifySuiteTool(host.ctx, settings).execute({ scripts: ['test', 'build'] }, exec()),
      /execution directory changed/,
    )
    assert.deepEqual(host.spawns, [])
  })
  it('rejects absent, denied and malformed Host process paths before spawning commands', async () => {
    const files = { [join(root, 'package.json')]: '{"scripts":{"test":"ok","build":"ok"}}' }
    for (const options of [
      { noProcessPath: true },
      { rejectProcessPath: true },
      { invalidProcessCwd: '' },
      { invalidProcessCwd: '\0forbidden' },
      { notDirectory: true },
      { rejectDirectoryContain: true },
    ]) {
      const host = fakeHost(files, options)
      await assert.rejects(
        createVerifyTool(host.ctx, settings).execute({ script: 'test' }, exec()),
        /Host|Git|process path|directory|workspace/,
        JSON.stringify(options),
      )
      await assert.rejects(
        createVerifySuiteTool(host.ctx, settings).execute({ scripts: ['test', 'build'] }, exec()),
        /Host|Git|process path|directory|workspace/,
        JSON.stringify(options),
      )
      assert.deepEqual(host.spawns, [], JSON.stringify(options))
    }
  })
  it('never starts a subprocess when cancelled during Host metadata', async () => {
    const controller = new AbortController()
    const host = fakeHost({ [join(root, 'package.json')]: '{"scripts":{"test":"ok"}}' })
    const fs = host.ctx.get('fs')
    const stat = fs.stat
    fs.stat = async target => {
      controller.abort()
      return stat(target)
    }
    await assert.rejects(
      createVerifyTool(host.ctx, settings).execute({ script: 'test' }, { signal: controller.signal }),
      /verification cancelled/,
    )
    assert.equal(host.spawns.length, 0)
  })
})

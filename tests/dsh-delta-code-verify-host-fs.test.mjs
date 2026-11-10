import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { createVerifyTool } from '../packages/dsh-delta-code/lib/tools/verify.js'
import { createVerifySuiteTool } from '../packages/dsh-delta-code/lib/tools/verify-suite.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const root = resolve('dsh-virtual-host-verification-workspace')
const exec = () => ({ signal: new AbortController().signal })
function fakeHost(files, options = {}) {
  const observed = []
  const spawns = []
  const fs = {
    async resolve(path) {
      observed.push('resolve:' + path)
      if (options.rejectResolve) throw new Error('Host FS denied resolution')
      return { key: path }
    },
    contains(parent, target) {
      if (options.rejectContain && target.key.endsWith(sep + 'package.json')) return false
      return target.key === parent.key || target.key.startsWith(parent.key + sep)
    },
    async stat(target) {
      observed.push('stat:' + target.key)
      if (options.rejectStat) throw new Error('Host FS denied metadata')
      return Object.hasOwn(files, target.key) ? { type: 'file' } : undefined
    },
    async readText(target) {
      observed.push('readText:' + target.key)
      if (options.rejectRead) throw new Error('Host FS denied manifest read')
      return files[target.key]
    },
  }
  const ctx = {
    get: key => key === 'fs' ? (options.incompleteFs ? { resolve: fs.resolve } : fs) : undefined,
    subprocess: { spawn(spec) {
      spawns.push(spec)
      return {
        done: Promise.resolve({ exitCode: 0 }),
        collected: {
          stdout: { readFrom: () => ({ text: 'ok', lossy: false }) },
          stderr: { readFrom: () => ({ text: '', lossy: false }) },
        },
      }
    } },
  }
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
    assert.equal(result.project, 'node')
    assert.deepEqual(host.spawns.map(item => item.argv), [['pnpm', 'run', 'test']])
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

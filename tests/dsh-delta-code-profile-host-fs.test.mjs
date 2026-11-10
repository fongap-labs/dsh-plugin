import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { createProjectProfileTool } from '../packages/dsh-delta-code/lib/tools/profile.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const workspace = resolve('dsh-virtual-host-profile')
const exec = () => ({ signal: new AbortController().signal })

function fakeHost(files, { denyStat = false, denyRead = false } = {}) {
  const observed = []
  const fs = {
    async resolve(path) {
      observed.push('resolve')
      return { targetKey: path, displayPath: path }
    },
    contains(parent, target) {
      return target.targetKey === parent.targetKey || target.targetKey.startsWith(parent.targetKey + sep)
    },
    async stat(target) {
      observed.push('stat')
      if (denyStat) throw new Error('Host FS denied metadata')
      return Object.hasOwn(files, target.targetKey) ? { type: 'file' } : undefined
    },
    async readText(target) {
      observed.push('readText')
      if (denyRead) throw new Error('Host FS denied read')
      return files[target.targetKey]
    },
  }
  return { ctx: { get: key => key === 'fs' ? fs : undefined }, observed }
}

describe('Code Worker project profiling via DSH Host FS', () => {
  it('discovers files and scripts in a virtual Host workspace without local Node reads', async () => {
    const host = fakeHost({
      [join(workspace, 'package.json')]: JSON.stringify({ scripts: { test: 'node --test', typecheck: 'tsc --noEmit' } }),
      [join(workspace, 'AGENTS.md')]: '# instructions',
      [join(workspace, 'tsconfig.json')]: '{}',
    })
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    const result = await tool.execute({}, exec())
    assert.ok(result.technologies.includes('node'))
    assert.ok(result.technologies.includes('typescript'))
    assert.deepEqual(result.scripts, ['test', 'typecheck'])
    assert.deepEqual(result.guidance, ['AGENTS.md'])
    assert.deepEqual(result.suggestedChecks, ['test', 'typecheck'])
    assert.equal(JSON.stringify(result).includes('tsc --noEmit'), false)
    assert.ok(host.observed.includes('readText'))
  })

  it('does not retry Host metadata refusal using local Node filesystem', async () => {
    const host = fakeHost({}, { denyStat: true })
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, exec()), /Host FS denied metadata/)
    assert.ok(host.observed.includes('stat'))
  })

  it('does not retry Host read refusal using local Node filesystem', async () => {
    const host = fakeHost({ [join(workspace, 'package.json')]: '{}' }, { denyRead: true })
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, exec()), /Host FS denied read/)
  })

  it('rejects an incomplete Host FS instead of falling back', async () => {
    const ctx = { get: key => key === 'fs' ? { resolve: async path => path } : undefined }
    const tool = createProjectProfileTool(ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, exec()), /Host FS missing resolve\/contains\/stat\/readText/)
  })

  it('honors Host containment decisions for returned targets', async () => {
    const host = fakeHost({ [join(workspace, 'package.json')]: '{}' })
    const originalGet = host.ctx.get
    host.ctx.get = key => {
      const fs = originalGet(key)
      if (!fs) return undefined
      return { ...fs, contains(parent, target) {
        if (target.targetKey.endsWith(sep + 'package.json')) return false
        return fs.contains(parent, target)
      } }
    }
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    const result = await tool.execute({}, exec())
    assert.equal(result.files.includes('package.json'), false)
    assert.equal(result.scripts.length, 0)
    assert.equal(host.observed.includes('readText'), false)
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve, sep } from 'node:path'
import { createProjectProfileTool } from '../packages/delta-code/lib/tools/profile.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'
import { mockHostPathContains, mockHostFsContext } from './helpers/host-fs-mock.mjs'

const workspace = resolve('dsh-virtual-host-profile')
const exec = () => ({ signal: new AbortController().signal })

function fakeHost(files, { denyStat = false, denyRead = false, isDirectory = true, abortOnRead } = {}) {
  const observed = []
  const fs = {
    async resolve(path) {
      observed.push('resolve')
      return { targetKey: path, displayPath: path }
    },
    contains(parent, target) {
      return mockHostPathContains(parent, target, 'targetKey')
    },
    async stat(target) {
      observed.push('stat')
      if (denyStat) throw new Error('Host FS denied metadata')
      if (target.targetKey === workspace) return isDirectory ? { type: 'directory' } : { type: 'file' }
      return Object.hasOwn(files, target.targetKey) ? { type: 'file' } : undefined
    },
    async readText(target) {
      observed.push('readText')
      if (denyRead) throw new Error('Host FS denied read')
      if (abortOnRead) abortOnRead.abort()
      return files[target.targetKey]
    },
  }
  return { ctx: mockHostFsContext(fs), observed }
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

  it('discovers only workspace-authorized ancestor rules without reading instruction bodies', async () => {
    const inner = join(workspace, 'src', 'feature')
    const middle = join(workspace, 'src')
    const rootRules = join(workspace, 'AGENTS.md')
    const middleRules = join(middle, 'CLAUDE.md')
    const observedReads = []
    const files = { [rootRules]: 'root', [middleRules]: 'parent' }
    const fs = {
      async resolve(path) { return { targetKey: path } },
      contains(parent, target) { return mockHostPathContains(parent, target, 'targetKey') },
      async stat(target) {
        if ([workspace, middle, inner].includes(target.targetKey)) return { type: 'directory' }
        return Object.hasOwn(files, target.targetKey) ? { type: 'file' } : undefined
      },
      async readText(target) { observedReads.push(target.targetKey); return files[target.targetKey] },
    }
    const tool = createProjectProfileTool(mockHostFsContext(fs), normalizeConfig({ workspaceRoot: workspace }))
    const result = await tool.execute({ cwd: 'src/feature' }, exec())
    assert.deepEqual(result.guidance, [join('..', 'CLAUDE.md'), join('..', '..', 'AGENTS.md')])
    assert.equal(observedReads.length, 0)
    assert.deepEqual(result.files, [])
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
    const ctx = mockHostFsContext({ resolve: async path => path })
    const tool = createProjectProfileTool(ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, exec()), /Host FS missing resolve\/contains\/stat\/readText/)
  })

  it('rejects a Host FS cwd that is a file before probing project manifests', async () => {
    const host = fakeHost({ [join(workspace, 'package.json')]: '{}' }, { isDirectory: false })
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, exec()), /Host-authorized directory/)
    assert.equal(host.observed.includes('readText'), false)
  })

  it('does not return profile evidence after Host manifest read is cancelled', async () => {
    const controller = new AbortController()
    const host = fakeHost({
      [join(workspace, 'package.json')]: '{"scripts":{"test":"node --test"}}',
    }, { abortOnRead: controller })
    const tool = createProjectProfileTool(host.ctx, normalizeConfig({ workspaceRoot: workspace }))
    await assert.rejects(tool.execute({}, { signal: controller.signal }), /project profile cancelled/)
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

describe('Project profile bounded Host monorepo discovery', () => {
  it('finds nested Vue/Tauri/Rust modules and keeps child checks scoped', async () => {
    const directories = [workspace, join(workspace, 'apps'), join(workspace, 'apps', 'windows'),
      join(workspace, 'apps', 'windows', 'src-tauri'), join(workspace, 'node_modules')];
    const manifests = {
      [join(workspace, 'README.md')]: 'root',
      [join(workspace, 'apps', 'windows', 'package.json')]: JSON.stringify({
        dependencies: { vue: '3', '@tauri-apps/api': '2' },
        devDependencies: { typescript: '5' },
        scripts: { test: 'private command', typecheck: 'tsc' },
      }),
      [join(workspace, 'apps', 'windows', 'src-tauri', 'Cargo.toml')]: '[package]',
      [join(workspace, 'apps', 'windows', 'src-tauri', 'tauri.conf.json')]: '{}',
      [join(workspace, 'node_modules', 'package.json')]: '{}',
    }
    const reads = [], listed = []
    const fs = {
      async resolve(path) { return { targetKey: path } },
      contains(parent, target) { return mockHostPathContains(parent, target, 'targetKey') },
      async stat(target) {
        const path = target.targetKey
        if (directories.includes(path)) return { type: 'directory' }
        return Object.hasOwn(manifests, path) ? { type: 'file' } : undefined
      },
      async listDir(target) {
        const parent = target.targetKey
        listed.push(parent)
        return [...directories.map(path => ({ path, type: 'directory' })),
          ...Object.keys(manifests).map(path => ({ path, type: 'file' }))]
          .filter(entry => entry.path.startsWith(parent + sep) &&
            !entry.path.slice(parent.length + 1).includes(sep))
          .map(entry => ({ name: entry.path.slice(parent.length + 1),
            type: entry.type, target: { targetKey: entry.path } }))
      },
      async readText(target) { reads.push(target.targetKey); return manifests[target.targetKey] },
    }
    const result = await createProjectProfileTool(mockHostFsContext(fs),
      normalizeConfig({ workspaceRoot: workspace })).execute({}, exec())
    assert.deepEqual(new Set(result.technologies), new Set(['node', 'vue', 'typescript', 'tauri', 'rust']))
    assert.deepEqual(result.scripts, [])
    assert.deepEqual(result.modules.map(module => module.path), ['apps/windows', 'apps/windows/src-tauri'])
    assert.deepEqual(result.modules[0].scripts, ['test', 'typecheck'])
    assert.deepEqual(result.modules[1].technologies, ['rust', 'tauri'])
    assert.equal(result.moduleScanTruncated, false)
    assert.equal(listed.includes(join(workspace, 'node_modules')), false)
    assert.deepEqual(reads, [join(workspace, 'apps', 'windows', 'package.json')])
    assert.equal(JSON.stringify(result).includes('private command'), false)
  })
})

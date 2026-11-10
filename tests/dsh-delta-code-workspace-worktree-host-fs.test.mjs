import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { posix } from 'node:path'
const join = posix.join
import { createWorkspaceMapTool } from '../packages/dsh-delta-code/lib/tools/workspace.js'
import { createWorktreeTool } from '../packages/dsh-delta-code/lib/tools/worktree.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const ROOT = '/dsh-host-only-virtual-workspace-222'
const PROCESS_ROOT = '/ssh-process-workspace'
const execute = () => ({ signal: new AbortController().signal })

function result(stdout = '', exitCode = 0) {
  return {
    done: Promise.resolve({ exitCode, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

function fixture(options = {}) {
  const commands = []
  const accesses = []
  const writtenBranches = new Set()
  const targetPath = join(ROOT, '.dsh-delta-code', 'worktrees', 'task-1')
  const fs = {
    async resolve(path, opts = {}) {
      accesses.push('resolve:' + path)
      if (options.denyResolve) throw new Error('Host FS denied resolution')
      return { p: posix.resolve(opts.cwd ?? ROOT, path) }
    },
    contains(parent, child) {
      accesses.push('contains')
      if (options.denyContain) return false
      return child.p === parent.p || child.p.startsWith(parent.p + '/')
    },
    async stat(target) {
      accesses.push('stat:' + target.p)
      if (options.denyStat) throw new Error('Host FS denied metadata')
      if (target.p === ROOT) return { type: 'directory' }
      if (target.p === join(ROOT, 'repo-a') || target.p === join(ROOT, 'repo-b')) {
        return { type: 'directory' }
      }
      return undefined
    },
    async lstat(path, opts = {}) {
      const cwd = opts.cwd?.startsWith(PROCESS_ROOT)
        ? ROOT + opts.cwd.slice(PROCESS_ROOT.length)
        : (opts.cwd ?? ROOT)
      const absolute = posix.resolve(cwd, path)
      accesses.push('lstat:' + absolute)
      if (options.parentSymlink && absolute === join(ROOT, '.dsh-delta-code')) return { type: 'symlink' }
      if (absolute === targetPath && options.existingTarget) return { type: 'directory' }
      if (absolute === join(ROOT, 'repo-a') || absolute === join(ROOT, 'repo-b')) return { type: 'directory' }
      if (absolute === join(ROOT, 'repo-a', '.git')) return { type: 'directory' }
      if (absolute === join(ROOT, 'repo-b', '.git')) return { type: 'file' }
      if (absolute === join(ROOT, 'repo-external')) return { type: 'directory' }
      return undefined
    },
    async listDir(target) {
      accesses.push('listDir:' + target.p)
      if (options.denyList) throw new Error('Host FS refused directory listing')
      if (target.p === ROOT) {
        if (options.rootIsRepo) {
          return [{ name: '.git', type: 'directory', target: { p: join(ROOT, '.git') } }]
        }
        return [
          { name: 'repo-a', type: 'directory', target: { p: join(ROOT, 'repo-a') } },
          { name: 'repo-b', type: 'directory', target: { p: join(ROOT, 'repo-b') } },
          { name: 'repo-link', type: 'other', target: { p: '/external/repository' } },
          ...(options.escapingChild
            ? [{ name: 'repo-external', type: 'directory', target: { p: '/external/repository' } }]
            : []),
        ]
      }
      if (target.p === join(ROOT, 'repo-a')) {
        return [{ name: '.git', type: 'directory', target: { p: join(ROOT, 'repo-a', '.git') } }]
      }
      if (target.p === join(ROOT, 'repo-b')) {
        return [{ name: '.git', type: 'file', target: { p: join(ROOT, 'repo-b', '.git') } }]
      }
      throw new Error('Unexpected Host directory listing')
    },
    processPath(target) {
      accesses.push('processPath:' + target.p)
      if (options.invalidTargetPath && target.p.endsWith('task-1')) return '\0unsafe'
      return target.p.replace(ROOT, PROCESS_ROOT)
    },
  }
  if (options.missingList) delete fs.listDir
  const ctx = {
    get: name => name === 'fs' ? fs : undefined,
    ...(options.noSubprocess ? {} : {
      subprocess: {
        spawn(spec) {
          commands.push(spec)
          const args = spec.argv
          if (args[1] === 'ls-files') {
            if (spec.cwd === PROCESS_ROOT && !options.rootIsRepo) return result('', 128)
            if (spec.cwd === join(PROCESS_ROOT, 'repo-a')) {
              return result(options.invalidTracked ? '../secret.txt\0' : 'src/sidebar.ts\0')
            }
            if (spec.cwd === join(PROCESS_ROOT, 'repo-b')) return result('src/runtime.ts\0')
            if (spec.cwd === PROCESS_ROOT && options.rootIsRepo) return result('README.md\0')
          }
          if (args[1] === 'worktree' && args[2] === 'list') return result('worktree /ssh-process-workspace\n')
          if (args[1] === 'worktree' && args[2] === 'add') {
            const branch = args[4]
            if (writtenBranches.has(branch)) return result('', 128)
            writtenBranches.add(branch)
            return result('Preparing worktree')
          }
          throw new Error('Unexpected Host Git command: ' + args.join(' '))
        },
      },
    }),
  }
  const settings = normalizeConfig({
    workspaceRoot: ROOT,
    execution: { allowWorktreeWrites: true },
  })
  return { ctx, fs, settings, commands, accesses, writtenBranches }
}

describe('Delta Code Worker Host multi-repository isolation', () => {
  it('maps direct Host repositories without reading local filesystem paths', async () => {
    const f = fixture()
    const data = await createWorkspaceMapTool(f.ctx, f.settings).execute({ query: 'sidebar', limit: 10 }, execute())
    assert.equal(data.total, 2)
    assert.deepEqual(data.selected, ['repo-a/src/sidebar.ts'])
    assert.deepEqual(data.repositories, ['repo-a', 'repo-b'])
    assert.ok(f.commands.every(command => command.cwd.startsWith(PROCESS_ROOT)))
    assert.ok(f.accesses.some(x => x === 'listDir:' + ROOT))
    assert.ok(!f.accesses.some(x => x.includes('repo-link/.git')))
  })

  it('limits explicit Host indexing to the authorized selected repository', async () => {
    const f = fixture()
    const data = await createWorkspaceMapTool(f.ctx, f.settings).execute({
      cwd: 'repo-b', query: 'runtime',
    }, execute())
    assert.deepEqual(data.repositories, ['repo-b'])
    assert.deepEqual(data.selected, ['repo-b/src/runtime.ts'])
    assert.equal(f.commands.length, 1)
    assert.equal(f.commands[0].cwd, join(PROCESS_ROOT, 'repo-b'))
  })

  it('blocks a Host child whose resolved identity escapes the workspace', async () => {
    const f = fixture({ escapingChild: true })
    await assert.rejects(createWorkspaceMapTool(f.ctx, f.settings).execute({}, execute()),
      /Host repository escapes workspace/)
    assert.ok(!f.commands.some(c => c.cwd === '/external/repository'))
  })

  it('rejects partial Host FS, provider refusal and unsafe Git path data without a local fallback', async () => {
    for (const options of [{ missingList: true }, { denyList: true },
      { denyResolve: true }, { invalidTracked: true }, { noSubprocess: true }]) {
      const f = fixture(options)
      await assert.rejects(
        createWorkspaceMapTool(f.ctx, f.settings).execute({}, execute()),
        /Host|unsafe|subprocess|refus|missing/,
      )
    }
  })

  it('does not hide an unindexable Git workspace root by discovering child repositories', async () => {
    const f = fixture({ rootIsRepo: true })
    const value = await createWorkspaceMapTool(f.ctx, f.settings).execute({}, execute())
    assert.deepEqual(value.repositories, ['.'])
    assert.deepEqual(value.selected, ['README.md'])
  })
})

describe('Delta Code Worker Host Git worktree authority', () => {
  it('lists worktrees with the Host-only process path', async () => {
    const f = fixture({ rootIsRepo: true })
    const list = await createWorktreeTool(f.ctx, f.settings).execute({ action: 'list' }, execute())
    assert.equal(list.action, 'list')
    assert.equal(f.commands[0].cwd, PROCESS_ROOT)
  })

  it('creates a feature worktree under the canonical Host process directory without Node FS', async () => {
    const f = fixture({ rootIsRepo: true })
    const created = await createWorktreeTool(f.ctx, f.settings).execute({
      action: 'create', task: 'task-1',
    }, execute())
    assert.equal(created.action, 'create')
    assert.match(created.output, /code-worker\/task-1/)
    assert.deepEqual(f.commands[0].argv, ['git', 'worktree', 'add', '-b',
      'code-worker/task-1', join(PROCESS_ROOT, '.dsh-delta-code', 'worktrees', 'task-1'), 'HEAD'])
    assert.equal(f.commands[0].cwd, PROCESS_ROOT)
  })

  it('blocks symlinked parents, existing targets, denied Host FS and invalid target paths before writes', async () => {
    for (const options of [
      { parentSymlink: true }, { existingTarget: true },
      { denyResolve: true }, { denyContain: true },
      { denyStat: true }, { invalidTargetPath: true },
    ]) {
      const f = fixture({ rootIsRepo: true, ...options })
      await assert.rejects(
        createWorktreeTool(f.ctx, f.settings).execute({ action: 'create', task: 'task-1' }, execute()),
        /Host|worktree|Git|directory/,
      )
      assert.deepEqual(f.commands, [], JSON.stringify(options))
    }
  })

  it('uses Host Git branch/target uniqueness to reject concurrent duplicate worktree creation', async () => {
    const f = fixture({ rootIsRepo: true })
    const tool = createWorktreeTool(f.ctx, f.settings)
    const results = await Promise.allSettled([
      tool.execute({ action: 'create', task: 'task-1' }, execute()),
      tool.execute({ action: 'create', task: 'task-1' }, execute()),
    ])
    assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
    assert.equal(results.filter(x => x.status === 'rejected').length, 1)
    assert.equal(f.writtenBranches.size, 1)
    assert.equal(f.commands.length, 2)
  })

  it('refuses missing Host subprocess rather than silently using a local Git process', async () => {
    const f = fixture({ rootIsRepo: true, noSubprocess: true })
    await assert.rejects(createWorktreeTool(f.ctx, f.settings).execute({
      action: 'list',
    }, execute()), /host subprocess service is required/)
  })
})

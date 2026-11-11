import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeliveryGateTool, remainingDeliveryTasks } from '../packages/dsh-delta-code/lib/tools/delivery-gate.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const HEAD = 'a'.repeat(40)
const NEXT_HEAD = 'b'.repeat(40)
const execution = () => ({ agent: { session: { id: 'native-test-session' } }, signal: new AbortController().signal })
const done = [{ content: 'Locate source', status: 'completed' }, { content: 'Fix and test', status: 'completed' }]
function hostOutput(code, stdout = '') {
  return {
    done: Promise.resolve({ exitCode: code, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}
async function fixture({ failScript = false, drift = false, driftPatch = false, untracked = false, malformedStatus, deny = false, allowCommands = true, nativeTasks, nativeAfterRun, nativeUnavailable = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-delivery-gate-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', typecheck: 'tsc' } }))
  const commands = []
  let headCalls = 0
  let patchCalls = 0
  const ctx = {
    get: () => undefined,
    subprocess: { spawn(spec) {
      const argv = spec.argv
      commands.push(argv)
      if (deny) throw new Error('Host rejected command')
      if (argv[0] === 'git') {
        if (argv[1] === 'rev-parse') {
          headCalls += 1
          return hostOutput(0, (drift && headCalls > 1 ? NEXT_HEAD : HEAD) + '\n')
        }
        if (argv[1] === 'status') return hostOutput(0, malformedStatus ?? (untracked ? '## main\0?? new-file.ts\0' : '## main\0 M src.ts\0'))
        if (argv[1] === 'diff') {
          if (argv.includes('--binary')) {
            patchCalls += 1
            return hostOutput(0, driftPatch && patchCalls > 2 ? 'new patch' : 'original patch')
          }
          return hostOutput(0)
        }
        throw Error('unexpected Git argv ' + argv.join(' '))
      }
      if (argv[0] === 'npm') return hostOutput(failScript && argv.at(-1) === 'test' ? 2 : 0, 'check result')
      throw Error('unexpected command ' + argv.join(' '))
    } },
  }
  const settings = normalizeConfig({ workspaceRoot: root, execution: { allowCommands } })
  let nativeReads = 0
  const nativeResume = nativeTasks === undefined && !nativeUnavailable ? undefined : {
    read() {
      nativeReads++
      if (nativeUnavailable) return undefined
      const changed = nativeReads > 1 && nativeAfterRun !== undefined
      return { tasks: changed ? nativeAfterRun : nativeTasks, writeSeq: changed ? 8 : 7, invalid: false }
    },
  }
  const tool = createDeliveryGateTool(ctx, settings, nativeResume)
  return { root, tool, commands, cleanup: () => rm(root, { force: true, recursive: true }) }
}

describe('Delta Code Worker execution delivery gate', () => {

  it('rejects model-claimed completion when native Todo still contains pending work', async () => {
    const f = await fixture({ nativeTasks: [
      { content: 'Locate source', status: 'completed' },
      { content: 'Fix and test', status: 'pending' },
    ] })
    try {
      const result = await f.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.stage, 'blocked')
      assert.match(result.blockers.join(' '), /supplied tasks differ/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('fails closed when the DSH native Todo projection is unavailable', async () => {
    const f = await fixture({ nativeUnavailable: true })
    try {
      const result = await f.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.stage, 'blocked')
      assert.match(result.blockers.join(' '), /native Todo projection/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('accepts matching native Todo evidence and blocks checkpoint changes during checks', async () => {
    const stable = await fixture({ nativeTasks: done })
    try {
      const result = await stable.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.stage, 'verified')
      assert.equal(result.ready, true)
    } finally { await stable.cleanup() }

    const changed = await fixture({ nativeTasks: done, nativeAfterRun: done })
    try {
      const result = await changed.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.stage, 'blocked')
      assert.equal(result.ready, false)
      assert.match(result.blockers.join(' '), /native Todo changed/)
      assert.ok(changed.commands.some(args => args[0] === 'npm'))
    } finally { await changed.cleanup() }
  })
  it('validates native Todo tasks and preserves their exact pending order', () => {
    assert.deepEqual(remainingDeliveryTasks([
      { content: 'Inspect', status: 'completed' },
      { content: 'Edit', status: 'in_progress' },
      { content: 'Verify', status: 'pending' },
    ]), ['Edit', 'Verify'])
    assert.throws(() => remainingDeliveryTasks([]), /1..32/)
    assert.throws(() => remainingDeliveryTasks([
      { content: 'Same', status: 'completed' }, { content: 'Same', status: 'pending' },
    ]), /duplicate/)
  })

  it('resumes unfinished Todo steps without performing any command', async () => {
    const f = await fixture()
    try {
      const value = await f.tool.execute({ tasks: [
        { content: 'Inspect', status: 'completed' },
        { content: 'Write regression test', status: 'in_progress' },
        { content: 'Run tests', status: 'pending' },
      ] }, execution())
      assert.equal(value.stage, 'continue')
      assert.equal(value.ready, false)
      assert.deepEqual(value.remaining, ['Write regression test', 'Run tests'])
      assert.match(value.nextAction, /Write regression test/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('blocks missing baseline and missing final tests without starting Host processes', async () => {
    const f = await fixture()
    try {
      const noTests = await f.tool.execute({ tasks: done, expectedHead: HEAD }, execution())
      assert.equal(noTests.stage, 'blocked')
      const noHead = await f.tool.execute({ tasks: done, scripts: ['test'] }, execution())
      assert.equal(noHead.stage, 'blocked')
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('checks Git HEAD and staged/unstaged diff, executes fresh verification, then rechecks Git', async () => {
    const f = await fixture()
    try {
      const result = await f.tool.execute({
        tasks: done, expectedHead: HEAD, scripts: ['typecheck', 'test'],
      }, execution())
      assert.equal(result.stage, 'verified')
      assert.equal(result.ready, true)
      assert.equal(result.head, HEAD)
      assert.deepEqual(result.checks.map(x => [x.script, x.passed, x.exitCode]), [
        ['typecheck', true, 0], ['test', true, 0],
      ])
      assert.deepEqual(f.commands, [
        ['git', 'rev-parse', '--verify', 'HEAD'],
        ['git', 'status', '--porcelain=v1', '--branch', '-z'],
        ['git', 'diff', '--check'],
        ['git', 'diff', '--cached', '--check'],
        ['git', 'diff', '--no-ext-diff', '--binary'],
        ['git', 'diff', '--cached', '--no-ext-diff', '--binary'],
        ['npm', 'run', 'typecheck'],
        ['npm', 'run', 'test'],
        ['git', 'rev-parse', '--verify', 'HEAD'],
        ['git', 'status', '--porcelain=v1', '--branch', '-z'],
        ['git', 'diff', '--no-ext-diff', '--binary'],
        ['git', 'diff', '--cached', '--no-ext-diff', '--binary'],
      ])
      assert.ok(f.commands.every(x => !x.includes('sh')))
    } finally { await f.cleanup() }
  })

  it('stops on a test failure and never reports verified completion', async () => {
    const f = await fixture({ failScript: true })
    try {
      const result = await f.tool.execute({
        tasks: done, expectedHead: HEAD, scripts: ['test', 'typecheck'],
      }, execution())
      assert.equal(result.ready, false)
      assert.equal(result.stage, 'blocked')
      assert.deepEqual(result.checks.map(x => x.script), ['test'])
      assert.match(result.blockers.join(' '), /verification failed/)
      assert.ok(!f.commands.some(x => x.includes('typecheck')))
    } finally { await f.cleanup() }
  })

  it('blocks when HEAD changes during tests or untracked files escape diff coverage', async () => {
    for (const config of [{ drift: true }, { driftPatch: true }, { untracked: true }]) {
      const f = await fixture(config)
      try {
        const result = await f.tool.execute({
          tasks: done, expectedHead: HEAD, scripts: ['test'],
        }, execution())
        assert.equal(result.stage, 'blocked')
        assert.equal(result.ready, false)
        assert.match(result.blockers.join(' '), config.drift || config.driftPatch ? /repository changed/ : /untracked/)
      } finally { await f.cleanup() }
    }
  })

  it('blocks verification before test execution if Host Git status evidence is malformed', async () => {
    for (const malformedStatus of ['', '## main\0unexpected\0', '## main\0 M changed.ts']) {
      const f = await fixture({ malformedStatus })
      try {
        const result = await f.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
        assert.equal(result.stage, 'blocked')
        assert.equal(result.ready, false)
        assert.deepEqual(result.checks, [])
        assert.ok(!f.commands.some(args => args[0] === 'npm'))
      } finally { await f.cleanup() }
    }
  })

  it('does not fall back to local Node when the Host denies Git execution', async () => {
    const f = await fixture({ deny: true })
    try {
      const result = await f.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.stage, 'blocked')
      assert.equal(result.ready, false)
      assert.match(result.blockers.join(' '), /Host Git or verification/)
      assert.equal(f.commands.length, 1)
    } finally { await f.cleanup() }
  })

  it('respects script execution permissions and fails closed without commands', async () => {
    const f = await fixture({ allowCommands: false })
    try {
      const result = await f.tool.execute({ tasks: done, expectedHead: HEAD, scripts: ['test'] }, execution())
      assert.equal(result.ready, false)
      assert.match(result.blockers.join(' '), /script execution is disabled/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('prevalidates every verification script before any Host Git or npm command', async () => {
    const f = await fixture()
    try {
      const result = await f.tool.execute({
        tasks: done, expectedHead: HEAD, scripts: ['test', 'build'],
      }, execution())
      assert.equal(result.ready, false)
      assert.match(result.blockers.join(' '), /preflight rejected/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })
})

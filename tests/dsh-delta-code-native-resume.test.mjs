import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNativeResumeTool, foldNativeResume, registerNativeResume } from '../packages/dsh-delta-code/lib/tools/resume.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const HEAD = 'a'.repeat(40)
const SECOND_HEAD = 'b'.repeat(40)
const execute = agent => ({ agent, signal: new AbortController().signal })
const TASKS = [
  { content: 'Inspect code', status: 'completed' },
  { content: 'Fix bug', status: 'in_progress' },
  { content: 'Run tests', status: 'pending' },
]

function hostOutput(stdout, exitCode = 0) {
  return {
    done: Promise.resolve({ exitCode, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}

async function fixture({ status = '## main\\0', deny = false, drift = false, mounted = true, allowGit = true } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-native-resume-'))
  const commands = []
  const agent = { session: { id: 'session-one' } }
  let definition
  let state
  let disposed = false
  let headReads = 0
  const ctx = {
    get: () => undefined,
    inject(dependencies, callback) {
      if (mounted && dependencies.includes('sessionProjections')) callback({
        sessionProjections: {
          register: async spec => {
            definition = spec
            state = spec.init()
            return {
              stateOf(session) {
                assert.equal(session, agent.session)
                return state
              },
              async dispose() { disposed = true },
            }
          },
        },
      })
    },
    subprocess: {
      spawn(spec) {
        commands.push(spec.argv)
        if (deny) throw new Error('Host denied request')
        if (spec.argv[0] !== 'git') throw new Error('Unexpected command')
        if (spec.argv[1] === 'rev-parse') {
          headReads++
          return hostOutput((drift && headReads > 1 ? SECOND_HEAD : HEAD) + '\\n')
        }
        if (spec.argv[1] === 'status') return hostOutput(status)
        throw new Error('Unexpected Git args')
      },
    },
  }
  const reader = registerNativeResume(ctx)
  // The native registry resolves an awaited projection handle.
  await Promise.resolve()
  await Promise.resolve()
  const settings = normalizeConfig({ workspaceRoot: workspace, git: { enabled: allowGit } })
  const tool = createNativeResumeTool(ctx, settings, reader)
  return {
    workspace, commands, agent, tool, reader,
    emit(todos, seq = 7) {
      assert.ok(definition, 'native projection must register')
      state = definition.apply(state, { type: 'todo/write', seq, data: { todos } })
    },
    turnStart(seq = 8) {
      state = definition.apply(state, { type: 'turn/start', seq, data: {} })
    },
    getState: () => state,
    get disposed() { return disposed },
    cleanup: async () => {
      reader.dispose()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

describe('Delta Code Worker native session resume', () => {
  it('retains the durable native Todo snapshot across a new turn without copying state to disk', async () => {
    const f = await fixture()
    try {
      f.emit(TASKS)
      f.turnStart()
      assert.deepEqual(f.getState().tasks, TASKS)
      const output = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
      assert.equal(output.stage, 'resume')
      assert.equal(output.head, HEAD)
      assert.equal(output.sourceSeq, 7)
      assert.deepEqual(output.remaining, ['Fix bug', 'Run tests'])
      assert.deepEqual(f.commands, [
        ['git', 'rev-parse', '--verify', 'HEAD'],
        ['git', 'status', '--porcelain=v1', '--branch', '-z'],
        ['git', 'rev-parse', '--verify', 'HEAD'],
      ])
    } finally { await f.cleanup() }
  })

  it('requires manual reconciliation without the previous Git baseline', async () => {
    const f = await fixture()
    try {
      f.emit(TASKS)
      const output = await f.tool.execute({}, execute(f.agent))
      assert.equal(output.stage, 'reconcile')
      assert.match(output.nextAction, /baseline/)
      assert.equal(output.remaining[0], 'Fix bug')
    } finally { await f.cleanup() }
  })

  it('blocks changed HEAD rather than replaying prior tasks', async () => {
    const f = await fixture()
    try {
      f.emit(TASKS)
      const output = await f.tool.execute({ expectedHead: SECOND_HEAD }, execute(f.agent))
      assert.equal(output.stage, 'blocked')
      assert.match(output.blockers.join(' '), /HEAD differs/)
      assert.equal(f.commands.length, 1)
    } finally { await f.cleanup() }
  })

  it('requires inspection of pre-existing modified and untracked files', async () => {
    for (const status of ['## main\\0 M touched.ts\\0', '## main\\0?? new.ts\\0']) {
      const f = await fixture({ status })
      try {
        f.emit(TASKS)
        const output = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
        assert.equal(output.stage, 'reconcile')
        assert.equal(output.changed.length, 1)
        assert.equal(output.remaining[0], 'Fix bug')
      } finally { await f.cleanup() }
    }
  })

  it('denies recovery without an owning agent or native projection', async () => {
    const f = await fixture({ mounted: false })
    try {
      const noOwner = await f.tool.execute({}, execute(undefined))
      assert.equal(noOwner.stage, 'blocked')
      const noHistory = await f.tool.execute({}, execute(f.agent))
      assert.equal(noHistory.stage, 'blocked')
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('keeps an empty, cleared or completed native Todo list from triggering Git', async () => {
    const f = await fixture()
    try {
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'empty')
      f.emit([])
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'empty')
      f.emit(TASKS.map(task => ({ ...task, status: 'completed' })), 9)
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'complete')
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('rejects malformed todo events and unknown baseline without executing Git', async () => {
    const f = await fixture()
    try {
      f.emit([{ content: 'same', status: 'pending' }, { content: 'same', status: 'completed' }])
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'blocked')
      f.emit(TASKS, 10)
      assert.equal((await f.tool.execute({ expectedHead: 'bad' }, execute(f.agent))).stage, 'blocked')
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('fails closed on DSH Host subprocess refusal and mid-read HEAD changes', async () => {
    for (const config of [{ deny: true }, { drift: true }, { allowGit: false }]) {
      const f = await fixture(config)
      try {
        f.emit(TASKS)
        const output = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
        assert.equal(output.stage, 'blocked')
        assert.ok(output.blockers.length > 0)
      } finally { await f.cleanup() }
    }
  })

  it('folds only todo/write and leaves non-todo session events unchanged', () => {
    const init = { tasks: null, writeSeq: -1, invalid: false }
    assert.equal(foldNativeResume(init, { type: 'turn/start', seq: 1 }), init)
    const next = foldNativeResume(init, { type: 'todo/write', seq: 2, data: { todos: TASKS } })
    assert.equal(next.writeSeq, 2)
    assert.deepEqual(next.tasks, TASKS)
  })
})

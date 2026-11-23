import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNativeResumeTool, foldNativeResume, registerNativeResume } from '../packages/delta-code/lib/tools/resume.js'
import { normalizeConfig } from '../packages/delta-code/lib/runtime.js'

const HEAD = 'a'.repeat(40)
const SECOND_HEAD = 'b'.repeat(40)
const execute = agent => ({ agent, signal: new AbortController().signal })
const TASKS = [
  { content: 'Inspect code', status: 'completed' },
  { content: 'Fix bug', status: 'in_progress' },
  { content: 'Run tests', status: 'pending' },
]

function hostOutput(stdout, exitCode = 0, stderr = '') {
  return {
    done: Promise.resolve({ exitCode, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout, lossy: false }) },
      stderr: { readFrom: () => ({ text: stderr, lossy: false }) },
    },
  }
}

async function fixture({ status = '## main\0', statusAfter, deny = false, drift = false, mounted = true, allowGit = true, transientOnce = false, returnedFailure, unborn = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-native-resume-'))
  const commands = []
  const agent = { session: { id: 'session-one' } }
  let definition
  let state
  let disposed = false
  let headReads = 0
  let statusReads = 0
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
        if (transientOnce && commands.length === 1) throw new Error('HTTP 503 Service Unavailable')
        if (returnedFailure && commands.length === 1) {
          return hostOutput('', returnedFailure.exitCode, returnedFailure.stderr)
        }
        if (deny) throw new Error('Host denied request')
        if (spec.argv[0] !== 'git') throw new Error('Unexpected command')
        if (spec.argv[1] === 'rev-parse') {
          headReads++
          if (unborn) return hostOutput('', 128, 'fatal: Needed a single revision')
          return hostOutput((drift && headReads > 1 ? SECOND_HEAD : HEAD) + '\n')
        }
        if (spec.argv[1] === 'symbolic-ref') return hostOutput('refs/heads/main\n')
        if (spec.argv[1] === 'status') {
          statusReads++
          const initial = unborn && status === '## main\0' ? '## No commits yet on main\0' : status
          return hostOutput(statusReads > 1 && statusAfter !== undefined ? statusAfter : initial)
        }
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
  it('reconstructs native compaction watermarks without retaining summary bodies', async () => {
    const { EMPTY_COMPACTION, foldCompactionMarker, parseCompactionMarker, compactionReview } =
      await import('../packages/delta-code/lib/delta-code-quality/compaction-continuity.js')
    const secret = 'private-user-decision-must-not-be-copied'
    const summary = { type: 'compaction/summary', seq: 12, data: { summary: [{ type: 'text', text: secret }] } }
    const first = foldCompactionMarker(EMPTY_COMPACTION, summary)
    assert.deepEqual(first, { summarySeq: 12, summaries: 1, invalid: false })
    assert.equal(JSON.stringify(first).includes(secret), false)
    assert.equal(foldCompactionMarker(first, { type: 'turn/start', seq: 13 }), first)
    assert.deepEqual(compactionReview(first, 9), {
      state: 'review', lastSummarySeq: 12, todoUpdatedAfterSummary: false,
      action: 'Native compaction occurred. Recheck the user constraints, technical decisions, unresolved failures and test evidence against the current Host Session and Git state; do not reconstruct missing facts from memory.',
    })
    assert.equal(compactionReview(first, 14).todoUpdatedAfterSummary, true)
    assert.equal(compactionReview(EMPTY_COMPACTION, -1).state, 'none')
    assert.equal(compactionReview(undefined, -1).state, 'unavailable')
    const invalid = foldCompactionMarker(first, { ...summary, seq: 11 })
    assert.equal(invalid.invalid, true)
    assert.equal(compactionReview(invalid, 14).state, 'unavailable')
    assert.throws(() => parseCompactionMarker({ summarySeq: 2, summaries: 0, invalid: false }), /checkpoint/)
  })

  it('uses the native Host projection and revokes stale compaction readers on disposal', async () => {
    const { registerNativeCompactionMarker } =
      await import('../packages/delta-code/lib/delta-code-adapter/providers/dsh/compaction-marker.js')
    let attach
    let released = 0
    let currentState
    let spec
    const agent = { session: {} }
    const reader = registerNativeCompactionMarker({
      inject(services, callback) {
        assert.deepEqual(services, ['sessionProjections'])
        attach = callback
      },
    })
    try {
      const release = attach({ sessionProjections: {
        async register(definition) {
          spec = definition
          currentState = spec.init()
          return {
            stateOf(session) { assert.equal(session, agent.session); return currentState },
            async dispose() { released++ },
          }
        },
      } })
      await Promise.resolve()
      assert.equal(reader.read(agent).summaries, 0)
      currentState = spec.apply(currentState, {
        type: 'compaction/summary', seq: 22,
        data: { summary: [{ type: 'text', text: 'sensitive summary' }] },
      })
      assert.deepEqual(reader.read(agent), { summarySeq: 22, summaries: 1, invalid: false })
      release()
      assert.equal(reader.read(agent), undefined)
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(released, 1)
      reader.dispose()
      assert.equal(reader.read(agent), undefined)
    } finally { reader.dispose() }
  })

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
        ['git', 'status', '--porcelain=v1', '--branch', '-z'],
        ['git', 'rev-parse', '--verify', 'HEAD'],
      ])
    } finally { await f.cleanup() }
  })

  it('reconciles a valid unborn Git branch without claiming a verified HEAD or replaying writes', async () => {
    const f = await fixture({ unborn: true })
    try {
      f.emit(TASKS)
      const actual = await f.tool.execute({}, execute(f.agent))
      assert.equal(actual.stage, 'reconcile')
      assert.equal(actual.head, '')
      assert.match(actual.nextAction, /no commits yet/)
      assert.deepEqual(actual.remaining, ['Fix bug', 'Run tests'])
      assert.ok(f.commands.some(args => args[1] === 'symbolic-ref'))
      assert.ok(f.commands.filter(args => args[1] === 'status').length >= 3)
      assert.ok(f.commands.every(args => args[0] === 'git'))
      const pinned = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
      assert.equal(pinned.stage, 'blocked', 'an unborn repository cannot satisfy an old committed baseline')
      assert.match(pinned.blockers.join(' '), /HEAD differs/)
    } finally { await f.cleanup() }
  })

  it('fails closed if an unborn branch cannot be independently confirmed or status changes', async () => {
    const unexpected = await fixture({ unborn: true, status: '## main\0' })
    try {
      unexpected.emit(TASKS)
      const actual = await unexpected.tool.execute({}, execute(unexpected.agent))
      assert.equal(actual.stage, 'blocked')
      assert.match(actual.blockers.join(' '), /Host Git inspection/)
    } finally { await unexpected.cleanup() }
    const drift = await fixture({ unborn: true, statusAfter: '## main\0' })
    try {
      drift.emit(TASKS)
      const actual = await drift.tool.execute({}, execute(drift.agent))
      assert.equal(actual.stage, 'blocked')
      assert.match(actual.blockers.join(' '), /Git status changed/)
    } finally { await drift.cleanup() }
  })

  it('rejects stale empty checkpoints, invalid HEAD and cancellation without Git', async () => {
    const f = await fixture()
    try {
      const noSnapshot = await f.tool.execute({ expectedSeq: 0 }, execute(f.agent))
      assert.equal(noSnapshot.stage, 'blocked')
      assert.match(noSnapshot.blockers.join(' '), /sequence differs/)
      f.emit([], 7)
      const stale = await f.tool.execute({ expectedSeq: 6 }, execute(f.agent))
      assert.equal(stale.stage, 'blocked')
      assert.match(stale.blockers.join(' '), /sequence differs/)
      const invalidHead = await f.tool.execute({ expectedSeq: 7, expectedHead: 'bad' }, execute(f.agent))
      assert.equal(invalidHead.stage, 'blocked')
      assert.match(invalidHead.blockers.join(' '), /invalid expectedHead/)
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(f.tool.execute({ expectedSeq: 7 },
        { agent: f.agent, signal: controller.signal }), /native resume cancelled/)
      const valid = await f.tool.execute({ expectedSeq: 7 }, execute(f.agent))
      assert.equal(valid.stage, 'empty')
      assert.deepEqual(f.commands, [], 'invalid or empty Todo checks must not execute Host Git')
    } finally { await f.cleanup() }
  })

  it('blocks stale milestone handoff before any Git operation', async () => {
    const f = await fixture()
    try {
      f.emit(TASKS)
      const mismatch = await f.tool.execute({
        expectedHead: HEAD,
        expectedTasks: ['Inspect code', 'Wrong task', 'Run tests'],
      }, execute(f.agent))
      assert.equal(mismatch.stage, 'blocked')
      assert.match(mismatch.blockers.join(' '), /does not match expected plan/)
      assert.deepEqual(f.commands, [], 'mismatched plans must not run commands')
      const valid = await f.tool.execute({
        expectedHead: HEAD,
        expectedTasks: ['Inspect code', 'Fix bug', 'Run tests'],
      }, execute(f.agent))
      assert.equal(valid.stage, 'resume')
      assert.deepEqual(valid.remaining, ['Fix bug', 'Run tests'])
    } finally { await f.cleanup() }
  })

  it('revokes registered native projection readers on service withdrawal and remount', async () => {
    let attach
    let injectionDisposals = 0
    let firstDisposals = 0
    let secondDisposals = 0
    const agent = { session: {} }
    const makeHandle = (writeSeq, onDispose) => ({
      stateOf(session) {
        assert.strictEqual(session, agent.session)
        return { tasks: TASKS, writeSeq, invalid: false }
      },
      async dispose() { onDispose() },
    })
    const first = makeHandle(7, () => firstDisposals++)
    const second = makeHandle(9, () => secondDisposals++)
    let releaseCurrent
    const reader = registerNativeResume({
      inject(services, callback) {
        assert.deepEqual(services, ['sessionProjections'])
        attach = callback
        return { async dispose() {
          injectionDisposals++
          releaseCurrent?.()
        } }
      },
    })
    try {
      releaseCurrent = attach({ sessionProjections: { register: async () => first } })
      await Promise.resolve()
      assert.equal(reader.read(agent)?.writeSeq, 7)
      releaseCurrent()
      assert.equal(reader.read(agent), undefined, 'an unmounted Host handle must not be read')
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(firstDisposals, 1)
      releaseCurrent = attach({ sessionProjections: { register: async () => second } })
      await Promise.resolve()
      assert.equal(reader.read(agent)?.writeSeq, 9)
      reader.dispose()
      assert.equal(reader.read(agent), undefined)
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(secondDisposals, 1)
      assert.equal(injectionDisposals, 1)
      reader.dispose()
      assert.equal(injectionDisposals, 1)
    } finally {
      reader.dispose()
    }
  })

  it('does not resurrect a withdrawn projection when its async registration resolves late', async () => {
    let attach
    let resolveOld
    let oldDisposals = 0
    let currentDisposals = 0
    const agent = { session: {} }
    const previous = {
      stateOf() { return { tasks: TASKS, writeSeq: 7, invalid: false } },
      async dispose() { oldDisposals++ },
    }
    const current = {
      stateOf() { return { tasks: TASKS, writeSeq: 11, invalid: false } },
      async dispose() { currentDisposals++ },
    }
    const pending = new Promise(resolve => { resolveOld = resolve })
    const reader = registerNativeResume({
      inject(_services, callback) { attach = callback },
    })
    try {
      const releaseOld = attach({ sessionProjections: { register: () => pending } })
      assert.equal(reader.read(agent), undefined)
      releaseOld()
      const releaseNew = attach({ sessionProjections: { register: async () => current } })
      await Promise.resolve()
      assert.equal(reader.read(agent)?.writeSeq, 11)
      resolveOld(previous)
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(oldDisposals, 1)
      assert.equal(reader.read(agent)?.writeSeq, 11, 'old async handle cannot replace current')
      releaseOld()
      assert.equal(reader.read(agent)?.writeSeq, 11, 'stale cleanup cannot unmount newer reader')
      releaseNew()
      assert.equal(reader.read(agent), undefined)
      await Promise.resolve()
      await Promise.resolve()
      assert.equal(currentDisposals, 1)
    } finally {
      reader.dispose()
    }
  })

  it('rejects stale native Todo sequences without executing Git', async () => {
    const f = await fixture()
    try {
      f.emit(TASKS, 7)
      const result = await f.tool.execute({ expectedHead: HEAD, expectedSeq: 6 }, execute(f.agent))
      assert.equal(result.stage, 'blocked')
      assert.match(result.blockers.join(' '), /sequence differs/)
      assert.deepEqual(f.commands, [])
    } finally { await f.cleanup() }
  })

  it('retries an explicit transient read-only Host Git failure only once', async () => {
    const f = await fixture({ transientOnce: true })
    try {
      f.emit(TASKS, 7)
      const result = await f.tool.execute({ expectedHead: HEAD, expectedSeq: 7 }, execute(f.agent))
      assert.equal(result.stage, 'resume')
      assert.equal(f.commands.filter(args => args[1] === 'rev-parse').length, 3)
    } finally { await f.cleanup() }
  })

  it('retries only a known transient Host Git failure, retaining the original status', async () => {
    const f = await fixture({ returnedFailure: { exitCode: 2, stderr: 'HTTP 429 rate limited' } })
    try {
      f.emit(TASKS)
      const outcome = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
      assert.equal(outcome.stage, 'resume')
      assert.equal(f.commands.filter(args => args[1] === 'rev-parse').length, 3)
    } finally { await f.cleanup() }
  })

  it('does not retry an explicit nonretryable Host response or an unknown exit', async () => {
    for (const returnedFailure of [
      { exitCode: 2, stderr: 'HTTP 429 rate limited; retryable=false' },
      { exitCode: null, stderr: 'HTTP 503 Service Unavailable' },
      { exitCode: 2, stderr: 'HTTP 403 access denied; HTTP 503' },
    ]) {
      const f = await fixture({ returnedFailure })
      try {
        f.emit(TASKS)
        const outcome = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
        assert.equal(outcome.stage, 'blocked')
        assert.equal(f.commands.length, 1)
      } finally { await f.cleanup() }
    }
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
    for (const status of ['## main\0 M touched.ts\0', '## main\0?? new.ts\0']) {
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

  it('blocks when Git status changes during the resume inspection without moving HEAD', async () => {
    const f = await fixture({ statusAfter: '## main\0 M appeared.ts\0' })
    try {
      f.emit(TASKS)
      const output = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
      assert.equal(output.stage, 'blocked')
      assert.match(output.blockers.join(' '), /Git status changed/)
      assert.equal(output.head, HEAD)
      assert.deepEqual(f.commands.map(args => args[1]), [
        'rev-parse', 'status', 'status', 'rev-parse',
      ])
    } finally { await f.cleanup() }
  })

  it('fails closed when Host returns a successful but malformed Git status response', async () => {
    for (const status of ['', '## main\0unknown\0', '## main\0 M unfinished.ts']) {
      const f = await fixture({ status })
      try {
        f.emit(TASKS)
        const result = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
        assert.equal(result.stage, 'blocked')
        assert.equal(result.blockers.length > 0, true)
        assert.notEqual(result.stage, 'resume')
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

  it('keeps empty native Todo lists Git-free but requires evidence for completed Todos', async () => {
    const f = await fixture()
    try {
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'empty')
      f.emit([])
      assert.equal((await f.tool.execute({}, execute(f.agent))).stage, 'empty')
      assert.deepEqual(f.commands, [])
      f.emit(TASKS.map(task => ({ ...task, status: 'completed' })), 9)
      const stale = await f.tool.execute({ expectedHead: HEAD, expectedSeq: 8 }, execute(f.agent))
      assert.equal(stale.stage, 'blocked')
      assert.deepEqual(f.commands, [])
      const unpinned = await f.tool.execute({}, execute(f.agent))
      assert.equal(unpinned.stage, 'reconcile')
      assert.equal(unpinned.head, HEAD)
      assert.match(unpinned.nextAction, /baseline/)
      const pinned = await f.tool.execute({ expectedHead: HEAD, expectedSeq: 9 }, execute(f.agent))
      assert.equal(pinned.stage, 'reconcile')
      assert.match(pinned.nextAction, /delivery-gate evidence/)
      assert.equal(f.commands.length, 8)
    } finally { await f.cleanup() }
  })

  it('never calls a dirty or inaccessible repository complete even when all Todos are completed', async () => {
    for (const config of [
      { status: '## main\0 M pending.ts\0' },
      { allowGit: false },
      { deny: true },
    ]) {
      const f = await fixture(config)
      try {
        f.emit(TASKS.map(task => ({ ...task, status: 'completed' })))
        const outcome = await f.tool.execute({ expectedHead: HEAD }, execute(f.agent))
        assert.notEqual(outcome.stage, 'complete')
        assert.equal(outcome.stage, config.status ? 'reconcile' : 'blocked')
      } finally { await f.cleanup() }
    }
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

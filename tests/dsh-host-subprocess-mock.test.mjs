import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mockHostCommandResult, mockHostSubprocess } from './helpers/host-subprocess-mock.mjs'

describe('Shared DSH Host subprocess fixture', () => {
  it('models successful completion and independent stdout/stderr collection', async () => {
    const result = mockHostCommandResult({ stdout: 'ready', stderr: 'note' })
    assert.deepEqual(await result.done, { exitCode: 0, signal: null })
    assert.deepEqual(result.collected.stdout.readFrom({ offset: 0 }), { text: 'ready', lossy: false })
    assert.deepEqual(result.collected.stderr.readFrom({ offset: 0 }), { text: 'note', lossy: false })
  })

  it('preserves nonzero exit, signal and truncation evidence', async () => {
    const result = mockHostCommandResult({
      exitCode: 128, signal: 'SIGTERM', stdout: 'partial',
      stdoutLossy: true, stderrLossy: true,
    })
    assert.deepEqual(await result.done, { exitCode: 128, signal: 'SIGTERM' })
    assert.equal(result.collected.stdout.readFrom().lossy, true)
    assert.equal(result.collected.stderr.readFrom().lossy, true)
  })

  it('records commands before a Host denial and never provides a local fallback', () => {
    const { ctx, calls } = mockHostSubprocess({ denial: 'Host refused request' })
    const spec = { argv: ['git', 'status'] }
    assert.throws(() => ctx.subprocess.spawn(spec), /Host refused request/)
    assert.deepEqual(calls, [spec])
    assert.equal(ctx.get('fs'), undefined)
  })

  it('returns a new Host result for each spawned command', async () => {
    const { ctx, calls } = mockHostSubprocess({ exitCode: 2, stdout: 'failed' })
    assert.equal((await ctx.subprocess.spawn({ argv: ['one'] }).done).exitCode, 2)
    assert.equal(ctx.subprocess.spawn({ argv: ['two'] }).collected.stdout.readFrom().text, 'failed')
    assert.equal(calls.length, 2)
  })
})

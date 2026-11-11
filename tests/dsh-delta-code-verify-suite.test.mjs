import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVerifySuiteTool } from '../packages/dsh-delta-code/lib/tools/verify-suite.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

const execute = () => ({ signal: new AbortController().signal })
function hostResult(exitCode, text = 'ok') {
  return {
    done: Promise.resolve({ exitCode }),
    collected: {
      stdout: { readFrom: () => ({ text, lossy: false }) },
      stderr: { readFrom: () => ({ text: '', lossy: false }) },
    },
  }
}
async function fixture(scripts, spawn) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-suite-'))
  await writeFile(join(root, 'package.json'), JSON.stringify({ scripts }))
  const calls = []
  const ctx = { get: () => undefined, subprocess: { spawn(spec) {
    calls.push(spec)
    return spawn(spec, calls.length)
  } } }
  const tool = createVerifySuiteTool(ctx, normalizeConfig({ workspaceRoot: root, execution: { allowCommands: true } }))
  return { root, tool, calls, cleanup: () => rm(root, { recursive: true, force: true }) }
}

describe('DSH Code Worker fail-fast verification suite', () => {
  it('runs three declared checks in order and reports evidence', async () => {
    const f = await fixture({ typecheck: 'tsc', test: 'node --test', build: 'tsc' }, () => hostResult(0))
    try {
      const result = await f.tool.execute({ scripts: ['typecheck', 'test', 'build'] }, execute())
      assert.equal(result.passed, true)
      assert.equal(result.completed, 3)
      assert.deepEqual(result.skipped, [])
      assert.deepEqual(f.calls.map(c => c.argv), [
        ['npm','run','typecheck'], ['npm','run','test'], ['npm','run','build'],
      ])
      assert.ok(result.results.every(step => step.passed && step.exitCode === 0 && step.failureKind === 'none'))
      assert.match(result.nextAction, /Verification passed/)
      assert.ok(f.calls.every(c => c.stdio.stdin === 'ignore'))
    } finally { await f.cleanup() }
  })

  it('stops on nonzero exit and labels remaining checks skipped', async () => {
    const f = await fixture({ typecheck: 'tsc', test: 'node --test', build: 'tsc' },
      (_, n) => hostResult(n === 2 ? 2 : 0, n === 2 ? 'failed' : 'ok'))
    try {
      const result = await f.tool.execute({ scripts: ['typecheck', 'test', 'build'] }, execute())
      assert.equal(result.passed, false)
      assert.equal(result.completed, 2)
      assert.deepEqual(result.skipped, ['build'])
      assert.equal(f.calls.length, 2)
      assert.equal(result.results[1].exitCode, 2)
      assert.match(result.results[1].output, /failed/)
      assert.equal(result.results[1].failureKind, 'verification')
      assert.match(result.nextAction, /Diagnose/)
    } finally { await f.cleanup() }
  })

  it('validates every script before launching any process', async () => {
    const f = await fixture({ test: 'node --test' }, () => { throw Error('must not spawn') })
    try {
      await assert.rejects(f.tool.execute({ scripts: ['test', 'build'] }, execute()), /does not declare script build/)
      await assert.rejects(f.tool.execute({ scripts: ['test', 'test'] }, execute()), /must not be duplicated/)
      await assert.rejects(f.tool.execute({ scripts: [] }, execute()), /1\.\.5/)
      await assert.rejects(f.tool.execute({ scripts: ['test', 'rm'] }, execute()), /one of|not allowlisted/)
      assert.equal(f.calls.length, 0)
    } finally { await f.cleanup() }
  })

  it('never retries a Host denial locally', async () => {
    const f = await fixture({ test: 'node --test', build: 'tsc' },
      () => { throw Error('Host refused') })
    try {
      const result = await f.tool.execute({ scripts: ['test', 'build'] }, execute())
      assert.equal(result.passed, false)
      assert.equal(result.completed, 1)
      assert.deepEqual(result.skipped, ['build'])
      assert.equal(result.results[0].exitCode, -1)
      assert.equal(result.results[0].failureKind, 'permission')
      assert.match(result.results[0].output, /Host subprocess refused/)
      assert.match(result.nextAction, /Host authorization/)
      assert.equal(f.calls.length, 1)
    } finally { await f.cleanup() }
  })

  it('does not auto-retry a test that fails due to an HTTP 503 dependency', async () => {
    const f = await fixture({ test: 'node --test' }, () => hostResult(1, 'HTTP 503 Service Unavailable'))
    try {
      const result = await f.tool.execute({ scripts: ['test'] }, execute())
      assert.equal(result.results[0].failureKind, 'transient')
      assert.equal(f.calls.length, 1)
      assert.match(result.nextAction, /rerun explicitly/)
    } finally { await f.cleanup() }
  })

  it('classifies a missing Host executable as environment failure without retry', async () => {
    const f = await fixture({ test: 'node --test', build: 'tsc' }, () => { throw Error('spawn npm ENOENT') })
    try {
      const result = await f.tool.execute({ scripts: ['test', 'build'] }, execute())
      assert.equal(result.passed, false)
      assert.equal(result.results[0].failureKind, 'environment')
      assert.deepEqual(result.skipped, ['build'])
      assert.match(result.nextAction, /Restore the missing Host subprocess or executable/)
      assert.equal(f.calls.length, 1)
    } finally { await f.cleanup() }
  })

  it('treats a missing Host exit status as uncertain, never as a passing check', async () => {
    const f = await fixture({ test: 'node --test', build: 'tsc' }, () => hostResult(null))
    try {
      const result = await f.tool.execute({ scripts: ['test', 'build'] }, execute())
      assert.equal(result.passed, false)
      assert.equal(result.results[0].failureKind, 'uncertain')
      assert.deepEqual(result.skipped, ['build'])
      assert.match(result.nextAction, /outcome is unconfirmed/)
      assert.equal(f.calls.length, 1)
    } finally { await f.cleanup() }
  })

  it('keeps command execution disabled by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verify-disabled-'))
    try {
      await writeFile(join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
      const tool = createVerifySuiteTool({ get: () => undefined },
        normalizeConfig({ workspaceRoot: root }))
      await assert.rejects(tool.execute({ scripts: ['test'] }, execute()), /script execution disabled/)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('does not run checks when cancelled before preparation', async () => {
    const f = await fixture({ test: 'node --test' }, () => { throw Error('must not spawn') })
    try {
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(f.tool.execute({ scripts: ['test'] }, { signal: controller.signal }), /verification cancelled/)
      assert.equal(f.calls.length, 0)
    } finally { await f.cleanup() }
  })
})

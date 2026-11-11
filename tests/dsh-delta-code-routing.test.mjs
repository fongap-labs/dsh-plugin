import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALL_CODING_SKILLS } from '../packages/dsh-delta-code/lib/skills.js'
import { decideCodingWorkflow, createWorkflowRouteTool, planCodingWaves } from '../packages/dsh-delta-code/lib/workflow-route.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'
import { createVerifyTool } from '../packages/dsh-delta-code/lib/tools/verify.js'
import { chooseVerificationCommand } from '../packages/dsh-delta-code/lib/tools/verify-presets.js'

const exec = { signal: new AbortController().signal }

function verifyCommandFor(project, script, manager = 'npm', isRustLocked = false) {
  if (!['test', 'typecheck', 'build', 'lint', 'check'].includes(script)) throw new Error('script is not allowlisted')
  const selected = chooseVerificationCommand(script, project, [project], manager, ['test', 'typecheck', 'build', 'lint', 'check'], isRustLocked)
  return { command: selected.command, args: selected.args }
}

test('routing is deterministic, lean for small changes and strict for higher risk', async () => {
  const fast = decideCodingWorkflow({ taskKind: 'feature', scope: 'small', risk: 'low' })
  assert.equal(fast.mode, 'fast')
  assert.deepEqual(fast.skills, ['code-fast-change', 'code-verification-gate'])
  const fix = decideCodingWorkflow({ taskKind: 'bugfix', scope: 'small', risk: 'low' })
  assert.equal(fix.mode, 'diagnose')
  assert.ok(fix.skills.includes('code-root-cause-debugging'))
  assert.ok(!fix.skills.includes('code-writing-plans'))
  const complexFix = decideCodingWorkflow({
    taskKind: 'bugfix', scope: 'large', risk: 'high', independentTasks: 4, nativeSubagents: true,
  })
  assert.equal(complexFix.mode, 'diagnose')
  assert.deepEqual(complexFix.skills.slice(0, 3), [
    'code-root-cause-debugging', 'code-writing-plans', 'code-executing-plans',
  ])
  assert.equal(complexFix.parallelCandidate, false)
  const risky = decideCodingWorkflow({
    taskKind: 'refactor', scope: 'large', risk: 'high', independentTasks: 4, nativeSubagents: true,
    taskPaths: [['src/a.ts'], ['src/b.ts'], ['src/c.ts'], ['src/d.ts']],
  })
  assert.equal(risky.mode, 'planned')
  assert.equal(risky.parallelCandidate, true)
  assert.deepEqual(risky.executionWaves, [[0, 1, 2, 3]])
  assert.ok(risky.skills.includes('code-subagent-delivery'))
  assert.ok(risky.skills.includes('code-review-readiness'))
  const noHost = decideCodingWorkflow({
    taskKind: 'feature', scope: 'large', risk: 'high', independentTasks: 4,
  })
  assert.equal(noHost.parallelCandidate, false)
  assert.deepEqual(noHost.executionWaves, [[0], [1], [2], [3]])
  assert.ok(noHost.skills.includes('code-executing-plans'))
  assert.ok(!noHost.skills.includes('code-subagent-delivery'))
  const ci = decideCodingWorkflow({ taskKind: 'ci', scope: 'small', risk: 'high' })
  assert.deepEqual(ci.skills, ['code-ci-repair', 'code-verification-gate'])
  const ids = new Set(ALL_CODING_SKILLS.map(skill => skill.name))
  for (const result of [fast, fix, complexFix, risky, noHost, ci]) {
    for (const skill of result.skills) assert.ok(ids.has(skill), skill)
  }
  assert.throws(() => decideCodingWorkflow({ taskKind: 'feature', scope: 'large', risk: 'high', independentTasks: 0 }), /independentTasks/)
  const tool = createWorkflowRouteTool()
  assert.equal(tool.name, 'code_workflow_route')
  const actual = await tool.execute({ taskKind: 'feature', scope: 'small', risk: 'low' }, exec)
  assert.deepEqual(actual.skills, fast.skills)
})

test('parallel task plans require explicit disjoint write sets and obey dependencies', () => {
  const missing = decideCodingWorkflow({
    taskKind: 'feature', scope: 'large', risk: 'medium',
    independentTasks: 3, nativeSubagents: true,
  })
  assert.equal(missing.parallelCandidate, false)
  assert.deepEqual(missing.executionWaves, [[0], [1], [2]])
  assert.deepEqual(planCodingWaves(3, [
    ['src/a'], ['src/a/file.ts'], ['src/other.ts'],
  ], [[], [], [0]], true), [[0], [1, 2]])
  assert.deepEqual(planCodingWaves(3, [
    ['src/a.ts'], ['src/b.ts'], ['src/c.ts'],
  ], [[], [0], []], true), [[0, 2], [1]])
  assert.deepEqual(planCodingWaves(2, [
    ['src/a.ts'], ['src/b.ts'],
  ], undefined, false), [[0], [1]])
  assert.throws(() => planCodingWaves(2, [['src/a.ts'], ['../outside']], [], true), /taskDependencies|paths/)
  assert.throws(() => planCodingWaves(2, [['src/a.ts'], ['../outside']], undefined, true), /taskPaths/)
  assert.throws(() => planCodingWaves(2, [['src/a.ts'], ['src/b.ts']], [[], [1]], true), /taskDependencies/)
  assert.throws(() => planCodingWaves(2, [['src/a.ts'], ['src/b.ts']], [[1], []], true), /taskDependencies/)
})

test('fixed verification commands never interpret model input as shell fragments', () => {
  assert.deepEqual(verifyCommandFor('rust', 'test', 'npm', true), { command: 'cargo', args: ['test', '--locked'] })
  assert.deepEqual(verifyCommandFor('rust', 'lint'), { command: 'cargo', args: ['clippy', '--all-targets', '--', '-D', 'warnings'] })
  assert.deepEqual(verifyCommandFor('go', 'typecheck'), { command: 'go', args: ['test', '-run', '^$', './...'] })
  assert.deepEqual(verifyCommandFor('go', 'check'), { command: 'go', args: ['vet', './...'] })
  assert.deepEqual(verifyCommandFor('python', 'test'), { command: 'python', args: ['-m', 'pytest'] })
  assert.deepEqual(verifyCommandFor('python', 'check'), { command: 'python', args: ['-m', 'compileall', '-q', '.'] })
  assert.deepEqual(verifyCommandFor('node', 'build', 'pnpm'), { command: 'pnpm', args: ['run', 'build'] })
  assert.throws(() => verifyCommandFor('go', 'oops;rm -rf' , 'npm'), /allowlisted/)
})

function fakeHost(exitCode = 0) {
  const calls = []
  return {
    calls, get: () => undefined,
    subprocess: {
      spawn(spec) {
        calls.push(spec)
        return {
          done: Promise.resolve({ exitCode }),
          collected: {
            stdout: { readFrom: () => ({ text: 'test-output', lossy: false }) },
            stderr: { readFrom: () => ({ text: '', lossy: false }) },
          },
        }
      },
    },
  }
}

test('Host-only command execution respects permissions, manifests and ecosystem selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-verify-polyglot-'))
  try {
    for (const name of ['node', 'rust', 'go', 'python', 'polyglot']) await mkdir(join(root, name))
    await writeFile(join(root, 'node', 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    await writeFile(join(root, 'rust', 'Cargo.toml'), '[package]\nname="demo"\nversion="0.1.0"\n')
    await writeFile(join(root, 'rust', 'Cargo.lock'), '# lock\n')
    await writeFile(join(root, 'go', 'go.mod'), 'module demo\n')
    await writeFile(join(root, 'python', 'pyproject.toml'), '[project]\nname="demo"\n')
    await writeFile(join(root, 'polyglot', 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }))
    await writeFile(join(root, 'polyglot', 'Cargo.toml'), '[workspace]\n')


    const host = fakeHost()
    const settings = normalizeConfig({ workspaceRoot: root, execution: { allowCommands: true } })
    const tool = createVerifyTool(host, settings)
    const checks = [
      { cwd: 'node', script: 'test', expected: ['npm', 'run', 'test'], ecosystem: 'node' },
      { cwd: 'rust', script: 'test', expected: ['cargo', 'test', '--locked'], ecosystem: 'rust' },
      { cwd: 'go', script: 'test', expected: ['go', 'test', './...'], ecosystem: 'go' },
      { cwd: 'python', script: 'check', expected: ['python', '-m', 'compileall', '-q', '.'], ecosystem: 'python' },
    ]
    for (const check of checks) {
      const result = await tool.execute({ cwd: check.cwd, script: check.script }, exec)
      assert.equal(result.passed, true)
      assert.equal(result.project, check.ecosystem)
      assert.deepEqual(host.calls.at(-1).argv, check.expected)
      assert.equal(await realpath(host.calls.at(-1).cwd), await realpath(join(root, check.cwd)))
    }
    await assert.rejects(tool.execute({ cwd: 'node', script: 'lint' }, exec), /does not declare script lint/)
    await assert.rejects(tool.execute({ cwd: 'polyglot', script: 'test' }, exec), /ambiguous|multiple project types/)
    await assert.rejects(tool.execute({ cwd: 'rust', script: 'test', timeoutMs: 9999 }, exec), /timeoutMs/)
    await assert.rejects(tool.execute({ cwd: '../', script: 'test' }, exec), /sandbox|escapes/i)

    const denied = createVerifyTool(host, normalizeConfig({ workspaceRoot: root }))
    await assert.rejects(denied.execute({ cwd: 'node', script: 'test' }, exec), /disabled/)
    const missingHost = createVerifyTool({ get: () => undefined }, settings)
    await assert.rejects(missingHost.execute({ cwd: 'node', script: 'test' }, exec), /host subprocess/)

    const failing = createVerifyTool(fakeHost(1), settings)
    const result = await failing.execute({ cwd: 'rust', script: 'test' }, exec)
    assert.equal(result.passed, false)
    assert.equal(result.exitCode, 1)
  } finally { await rm(root, { recursive: true, force: true }) }
})

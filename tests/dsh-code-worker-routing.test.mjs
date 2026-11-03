import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALL_CODING_SKILLS } from '../packages/dsh-code-worker/lib/skills.js'
import { decideCodingWorkflow, createWorkflowRouteTool } from '../packages/dsh-code-worker/lib/workflow-route.js'
import { normalizeConfig } from '../packages/dsh-code-worker/lib/runtime.js'
import {
  verificationCommandFor, detectVerificationEcosystem, createVerifyTool,
} from '../packages/dsh-code-worker/lib/tools/verify.js'

const exec = { signal: new AbortController().signal }

test('routing is deterministic, lean for small changes and strict for higher risk', async () => {
  const fast = decideCodingWorkflow({ taskKind: 'feature', scope: 'small', risk: 'low' })
  assert.equal(fast.mode, 'fast')
  assert.deepEqual(fast.skills, ['code-fast-change', 'code-verification-gate'])
  const fix = decideCodingWorkflow({ taskKind: 'bugfix', scope: 'small', risk: 'low' })
  assert.equal(fix.mode, 'diagnose')
  assert.ok(fix.skills.includes('code-root-cause-debugging'))
  const risky = decideCodingWorkflow({
    taskKind: 'refactor', scope: 'large', risk: 'high', independentTasks: 4, nativeSubagents: true,
  })
  assert.equal(risky.mode, 'planned')
  assert.equal(risky.parallelCandidate, true)
  assert.ok(risky.skills.includes('code-subagent-delivery'))
  assert.ok(risky.skills.includes('code-review-readiness'))
  const noHost = decideCodingWorkflow({
    taskKind: 'feature', scope: 'large', risk: 'high', independentTasks: 4,
  })
  assert.equal(noHost.parallelCandidate, false)
  assert.ok(noHost.skills.includes('code-executing-plans'))
  assert.ok(!noHost.skills.includes('code-subagent-delivery'))
  const ci = decideCodingWorkflow({ taskKind: 'ci', scope: 'small', risk: 'high' })
  assert.deepEqual(ci.skills, ['code-ci-repair', 'code-verification-gate'])
  const ids = new Set(ALL_CODING_SKILLS.map(skill => skill.name))
  for (const result of [fast, fix, risky, noHost, ci]) {
    for (const skill of result.skills) assert.ok(ids.has(skill), skill)
  }
  assert.throws(() => decideCodingWorkflow({ taskKind: 'feature', scope: 'large', risk: 'high', independentTasks: 0 }), /independentTasks/)
  const tool = createWorkflowRouteTool()
  assert.equal(tool.name, 'code_workflow_route')
  const actual = await tool.execute({ taskKind: 'feature', scope: 'small', risk: 'low' }, exec)
  assert.deepEqual(actual.skills, fast.skills)
})

test('fixed verification commands never interpret model input as shell fragments', () => {
  assert.deepEqual(verificationCommandFor('rust', 'test', 'npm', true), { command: 'cargo', args: ['test', '--locked'] })
  assert.deepEqual(verificationCommandFor('rust', 'lint'), { command: 'cargo', args: ['clippy', '--all-targets', '--', '-D', 'warnings'] })
  assert.deepEqual(verificationCommandFor('go', 'typecheck'), { command: 'go', args: ['test', '-run', '^$', './...'] })
  assert.deepEqual(verificationCommandFor('go', 'check'), { command: 'go', args: ['vet', './...'] })
  assert.deepEqual(verificationCommandFor('python', 'test'), { command: 'python', args: ['-m', 'pytest'] })
  assert.deepEqual(verificationCommandFor('python', 'check'), { command: 'python', args: ['-m', 'compileall', '-q', '.'] })
  assert.deepEqual(verificationCommandFor('node', 'build', 'pnpm'), { command: 'pnpm', args: ['run', 'build'] })
  assert.throws(() => verificationCommandFor('go', 'oops;rm -rf' , 'npm'), /allowlisted/)
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

    assert.equal(await detectVerificationEcosystem(join(root, 'rust'), root), 'rust')
    assert.equal(await detectVerificationEcosystem(join(root, 'python'), root), 'python')
    await assert.rejects(detectVerificationEcosystem(join(root, 'polyglot'), root), /ambiguous/)
    assert.equal(await detectVerificationEcosystem(join(root, 'polyglot'), root, 'node'), 'node')
    await assert.rejects(detectVerificationEcosystem(join(root, 'rust'), root, 'go'), /no go project/)

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
      assert.equal(result.ecosystem, check.ecosystem)
      assert.deepEqual(host.calls.at(-1).argv, check.expected)
      assert.equal(host.calls.at(-1).cwd, join(root, check.cwd))
    }
    await assert.rejects(tool.execute({ cwd: 'node', script: 'lint' }, exec), /does not declare script lint/)
    await assert.rejects(tool.execute({ cwd: 'polyglot', script: 'test' }, exec), /ambiguous/)
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

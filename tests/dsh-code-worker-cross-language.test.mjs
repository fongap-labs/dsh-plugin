import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chooseVerificationCommand } from '../packages/dsh-code-worker/lib/tools/verify-presets.js'
import { createVerifyTool } from '../packages/dsh-code-worker/lib/tools/verify.js'
import { normalizeConfig } from '../packages/dsh-code-worker/lib/runtime.js'

const exec = { signal: new AbortController().signal }

describe('cross-language validation command boundaries', () => {
  it('selects only known Rust, Python, Go and Node commands', () => {
    assert.deepEqual(chooseVerificationCommand('test', 'auto', ['rust']), { project: 'rust', command: 'cargo', args: ['test'] })
    assert.deepEqual(chooseVerificationCommand('test', 'auto', ['python']), { project: 'python', command: 'python', args: ['-m', 'pytest'] })
    assert.deepEqual(chooseVerificationCommand('check', 'auto', ['go']), { project: 'go', command: 'go', args: ['vet', './...'] })
    assert.deepEqual(chooseVerificationCommand('test', 'auto', ['node'], 'pnpm', ['test']), { project: 'node', command: 'pnpm', args: ['run', 'test'] })
    assert.throws(() => chooseVerificationCommand('test', 'auto', ['node', 'rust']), /multiple project types/)
    assert.throws(() => chooseVerificationCommand('test', 'python', ['go']), /manifest not found/)
    assert.throws(() => chooseVerificationCommand('build', 'python', ['python']), /safe preset/)
    assert.throws(() => chooseVerificationCommand('lint', 'node', ['node'], 'npm', ['test']), /does not declare/)
  })

  it('uses the actual DSH subprocess boundary with no shell or arbitrary commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-code-verify-'))
    try {
      await writeFile(join(root, 'Cargo.toml'), '[package]\nname="demo"\nversion="0.1.0"\n')
      let seen
      const ctx = {
        get: () => undefined,
        subprocess: { spawn(spec) {
          seen = spec
          return {
            done: Promise.resolve({ exitCode: 0 }),
            collected: {
              stdout: { readFrom: () => ({ text: 'ok' }) },
              stderr: { readFrom: () => ({ text: '' }) },
            },
          }
        } },
      }
      const tool = createVerifyTool(ctx, normalizeConfig({ workspaceRoot: root, execution: { allowCommands: true } }))
      const result = await tool.execute({ script: 'test', project: 'auto' }, exec)
      assert.equal(result.passed, true)
      assert.equal(result.project, 'rust')
      assert.deepEqual(seen.argv, ['cargo', 'test'])
      assert.equal(seen.cwd, root)
      assert.equal(seen.stdio.stdin, 'ignore')
      await assert.rejects(tool.execute({ script: 'rm', project: 'rust' }, exec), /not allowlisted/)
      await writeFile(join(root, 'package.json'), '{"scripts":{"test":"echo ok"}}')
      await assert.rejects(tool.execute({ script: 'test', project: 'auto' }, exec), /multiple project types/)
      const explicit = await tool.execute({ script: 'test', project: 'node' }, exec)
      assert.deepEqual(seen.argv, ['npm', 'run', 'test'])
      assert.equal(explicit.project, 'node')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a manifest symlink escaping the workspace', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verify-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-verify-outside-'))
    try {
      await writeFile(join(outside, 'Cargo.toml'), '[package]\nname="outside"\nversion="0.1.0"\n')
      await symlink(join(outside, 'Cargo.toml'), join(root, 'Cargo.toml'))
      const ctx = { get: () => undefined, subprocess: { spawn: () => { throw Error('must not run') } } }
      const tool = createVerifyTool(ctx, normalizeConfig({ workspaceRoot: root, execution: { allowCommands: true } }))
      await assert.rejects(tool.execute({ script: 'test' }, exec), /escapes the workspace/)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

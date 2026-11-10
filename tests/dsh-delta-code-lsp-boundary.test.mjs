import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createLspProbeTool } from '../packages/dsh-delta-code/lib/tools/lsp.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

function setup(root, onSpawn, servers = [{ language: 'typescript', command: 'typescript-language-server' }]) {
  const calls = []
  const ctx = {
    get: () => undefined,
    subprocess: { spawn(spec) {
      calls.push(spec)
      if (onSpawn) return onSpawn(spec, calls.length)
      return {
        done: Promise.resolve({ exitCode: 0 }),
        collected: {
          stdout: { readFrom: () => ({ text: 'v1', lossy: false }) },
          stderr: { readFrom: () => ({ text: '', lossy: false }) },
        },
      }
    } },
  }
  return {
    calls,
    tool: createLspProbeTool(ctx, normalizeConfig({ workspaceRoot: root, lsp: { servers } })),
  }
}
const exec = () => ({ signal: new AbortController().signal })

describe('Code Worker LSP workspace and cancellation safety', () => {
  it('rejects symlinked working directories outside the workspace before invoking the Host', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lsp-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-lsp-outside-'))
    try {
      await symlink(outside, join(root, 'escape'), 'dir')
      const { tool, calls } = setup(root)
      await assert.rejects(tool.execute({ cwd: 'escape' }, exec()), /lsp cwd escapes workspace/)
      assert.equal(calls.length, 0)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('allows a normal nested workspace and passes canonical cwd to the Host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lsp-valid-'))
    try {
      const inner = join(root, 'src')
      await mkdir(inner)
      const { tool, calls } = setup(root)
      const result = await tool.execute({ cwd: 'src' }, exec())
      assert.equal(result.servers[0].available, true)
      assert.equal(calls.length, 1)
      assert.equal(resolve(calls[0].cwd), resolve(inner))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not start a probe if the caller already cancelled it', async () => {
    const { tool, calls } = setup(process.cwd())
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(tool.execute({}, { signal: controller.signal }), /lsp probe cancelled/)
    assert.equal(calls.length, 0)
  })

  it('stops without probing subsequent servers if cancelled during the Host call', async () => {
    const controller = new AbortController()
    const { tool, calls } = setup(process.cwd(), () => {
      controller.abort()
      throw new Error('Host operation cancelled')
    }, [
      { language: 'typescript', command: 'typescript-language-server' },
      { language: 'python', command: 'pyright-langserver' },
    ])
    await assert.rejects(tool.execute({}, { signal: controller.signal }), /lsp probe cancelled/)
    assert.equal(calls.length, 1)
  })

  it('continues reporting a non-cancellation Host rejection as unavailable', async () => {
    const { tool, calls } = setup(process.cwd(), () => { throw new Error('Host refused LSP execution') })
    const result = await tool.execute({}, exec())
    assert.equal(result.servers[0].available, false)
    assert.match(result.servers[0].note, /Host refused LSP execution/)
    assert.equal(calls.length, 1)
  })
})

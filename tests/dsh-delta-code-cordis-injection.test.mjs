import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as codeWorker from '../packages/dsh-delta-code/lib/index.js'

describe('Code Worker real Cordis subprocess injection', () => {
  it('resolves the mounted service through Cordis and executes workspace indexing', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'dsh-cordis-injected-'))
    const registered = new Map()
    const spawned = []
    const ctx = new Context()
    let fiber
    try {
      ctx.provide('tools', {
        register(definition) {
          registered.set(definition.name, definition)
          return () => registered.delete(definition.name)
        },
      })
      ctx.provide('subprocess', {
        spawn(spec) {
          spawned.push(spec)
          return {
            done: Promise.resolve({ exitCode: 0, signal: null }),
            collected: {
              stdout: { readFrom: () => ({ text: 'src/sidebar.ts\0', lossy: false }) },
              stderr: { readFrom: () => ({ text: '', lossy: false }) },
            },
          }
        },
      })
      fiber = ctx.plugin({
        name: codeWorker.name,
        inject: codeWorker.inject,
        apply: codeWorker.apply,
      }, { workspaceRoot: workspace })
      await fiber
      const workspaceMap = registered.get('code_workspace_map')
      assert.ok(workspaceMap, 'Cordis-mounted plugin should register the real tool')
      const result = await workspaceMap.execute({ query: 'sidebar' }, {
        signal: new AbortController().signal,
      })
      assert.deepEqual(result.selected, ['src/sidebar.ts'])
      assert.equal(result.total, 1)
      assert.equal(spawned.length, 1)
      assert.deepEqual(spawned[0].argv, ['git', 'ls-files', '-z', '--cached'])
    } finally {
      if (fiber?.dispose) await fiber.dispose()
      await rm(workspace, { recursive: true, force: true })
    }
  })
})

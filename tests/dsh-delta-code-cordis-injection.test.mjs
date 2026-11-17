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

describe('Code Worker optional subprocess capability', () => {
  it('keeps strategy tools alive and mounts command tools only while subprocess is provided', async () => {
    const ctx = new Context()
    const registered = new Map()
    const releaseTools = ctx.provide('tools', {
      register(definition) {
        registered.set(definition.name, definition)
        return () => registered.delete(definition.name)
      },
    })
    const fiber = ctx.plugin({
      name: codeWorker.name, inject: codeWorker.inject, apply: codeWorker.apply,
    }, {})
    const settle = async (check) => {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (check()) return
        await new Promise(resolve => setImmediate(resolve))
      }
      assert.ok(check(), 'Cordis capability lifecycle did not settle')
    }
    let releaseSubprocess
    try {
      await fiber
      await settle(() => registered.has('code_workflow_route'))
      assert.equal(registered.has('code_git_status'), false)
      assert.equal(registered.has('code_workspace_map'), false)

      releaseSubprocess = ctx.provide('subprocess', {
        spawn() { throw Error('subprocess should not execute during registration') },
      })
      await settle(() => registered.has('code_git_status') && registered.has('code_workspace_map'))
      await releaseSubprocess()
      releaseSubprocess = undefined
      await settle(() => !registered.has('code_git_status') && !registered.has('code_workspace_map'))
      assert.equal(registered.has('code_workflow_route'), true)
    } finally {
      if (releaseSubprocess) await releaseSubprocess()
      await fiber.dispose()
      await releaseTools()
      assert.equal(registered.size, 0)
    }
  })
})

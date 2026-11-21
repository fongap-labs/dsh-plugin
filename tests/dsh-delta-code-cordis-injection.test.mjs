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
      assert.equal(registered.has('code_lsp_probe'), false)
      assert.equal(registered.has('code_github_connection'), true, 'native GitHub credential is resolved lazily at request time')
      for (const name of ['code_multi_edit', 'code_project_profile', 'code_host_probe', 'code_execution_next']) {
        assert.ok(registered.has(name), name + ' should be mounted without subprocess')
      }

      releaseSubprocess = ctx.provide('subprocess', {
        spawn() { throw Error('subprocess should not execute during registration') },
      })
      await settle(() => registered.has('code_git_status') && registered.has('code_workspace_map') &&
        registered.has('code_lsp_probe'))
      await releaseSubprocess()
      releaseSubprocess = undefined
      await settle(() => !registered.has('code_git_status') && !registered.has('code_workspace_map'))
      for (const name of ['code_workflow_route', 'code_multi_edit', 'code_project_profile', 'code_host_probe', 'code_execution_next']) {
        assert.ok(registered.has(name), name + ' should remain after subprocess removal')
      }
    } finally {
      if (releaseSubprocess) await releaseSubprocess()
      await fiber.dispose()
      await releaseTools()
      assert.equal(registered.size, 0)
    }
  })
})

describe('Delta Code GitHub remote execution without subprocess', () => {
  it('allows an explicitly bound repository without starting local commands', async () => {
    const ctx = new Context()
    const registered = new Map()
    const releaseTools = ctx.provide('tools', {
      register(definition) {
        registered.set(definition.name, definition)
        return () => registered.delete(definition.name)
      },
    })
    const tokenName = 'DELTA_CODE_TEST_REMOTE_TOKEN'
    const oldToken = process.env[tokenName]
    const oldFetch = globalThis.fetch
    const requests = []
    process.env[tokenName] = 'fixture-token'
    let fiber
    try {
      globalThis.fetch = async (url, opts) => {
        requests.push({ url: String(url), authorization: opts.headers.Authorization })
        return new Response(JSON.stringify({
          full_name: 'company/remote-code', private: true, permissions: { pull: true },
        }), { status: 200 })
      }
      fiber = ctx.plugin({ name: codeWorker.name, inject: codeWorker.inject, apply: codeWorker.apply }, {
        github: { accounts: [{ owner: 'company', tokenEnv: tokenName }] },
      })
      await fiber
      const connection = registered.get('code_github_connection')
      assert.ok(connection)
      const result = await connection.execute({ repository: 'company/remote-code' }, {
        signal: new AbortController().signal,
      })
      assert.equal(result.account, 'company')
      assert.equal(requests.length, 1)
      assert.equal(requests[0].authorization, 'Bearer fixture-token')
      assert.doesNotMatch(JSON.stringify(result), /fixture-token/)
    } finally {
      globalThis.fetch = oldFetch
      if (oldToken === undefined) delete process.env[tokenName]
      else process.env[tokenName] = oldToken
      if (fiber?.dispose) await fiber.dispose()
      await releaseTools()
      assert.equal(registered.size, 0)
    }
  })
})

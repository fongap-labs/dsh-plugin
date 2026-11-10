import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMultiEditTool } from '../packages/dsh-delta-code/lib/tools/multi-edit.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

describe('DSH Code Worker integrated P0 security', () => {
  it('detects a symlink escape in preflight before writing an earlier valid file', { skip: process.platform === 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-integrated-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-integrated-outside-'))
    try {
      await symlink(outside, join(root, 'linked'), 'dir')
      await writeFile(join(outside, 'secret.txt'), 'unchanged', 'utf8')
      const tool = createMultiEditTool({ get: () => undefined }, normalizeConfig({ workspaceRoot: root }))
      const result = await tool.execute({ preflight: true, edits: [
        { path: 'good.txt', content: 'must not write' },
        { path: 'linked/secret.txt', content: 'must not overwrite outside' },
      ] }, { signal: new AbortController().signal })
      assert.equal(result.applied, 0)
      assert.ok(result.results.every(item => !item.ok))
      assert.match(result.results[1].note, /sandbox/)
      await assert.rejects(readFile(join(root, 'good.txt'), 'utf8'), { code: 'ENOENT' })
      assert.equal(await readFile(join(outside, 'secret.txt'), 'utf8'), 'unchanged')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
  it('respects DSH Host FS resolution denial before starting the batch writes', async () => {
    let writes = 0
    let resolutions = 0
    const ctx = {
      get(name) {
        if (name !== 'fs') return undefined
        return {
          resolve: async target => {
            resolutions += 1
            if (target.endsWith('blocked.txt')) throw new Error('host denied edit target')
            return target
          },
          readText: async () => '',
          writeText: async () => { writes += 1 },
        }
      },
    }
    const tool = createMultiEditTool(ctx, normalizeConfig({ workspaceRoot: process.cwd() }))
    const result = await tool.execute({ preflight: true, edits: [
      { path: 'safe.txt', content: 'do not write' },
      { path: 'blocked.txt', content: 'also do not write' },
    ] }, { signal: new AbortController().signal })
    assert.equal(result.applied, 0)
    assert.equal(resolutions, 2)
    assert.equal(writes, 0)
    assert.match(result.results[1].note, /host denied edit target/)
    assert.ok(result.results.every(item => !item.ok))
  })

})

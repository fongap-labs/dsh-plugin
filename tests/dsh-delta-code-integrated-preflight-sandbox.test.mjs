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
})

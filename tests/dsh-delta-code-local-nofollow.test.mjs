import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeLocalTextNoFollow, writeTextSafe } from '../packages/dsh-delta-code/lib/runtime.js'

const exec = () => ({ signal: new AbortController().signal })
const localHost = { get: () => undefined }

describe('Code Worker local no-follow writes', () => {
  it('creates and overwrites local files through the compatibility path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-local-write-'))
    try {
      await writeTextSafe(localHost, exec(), root, 'nested/new.txt', 'first')
      assert.equal(await readFile(join(root, 'nested', 'new.txt'), 'utf8'), 'first')
      await writeTextSafe(localHost, exec(), root, 'nested/new.txt', 'second')
      assert.equal(await readFile(join(root, 'nested', 'new.txt'), 'utf8'), 'second')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a final symlink directly at the kernel-open boundary', {
    skip: process.platform === 'win32' || !constants.O_NOFOLLOW,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-nofollow-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-nofollow-outside-'))
    try {
      const target = join(outside, 'protected.txt')
      await writeFile(target, 'unchanged', 'utf8')
      const link = join(root, 'target.txt')
      await symlink(target, link)
      // Exercise the open guard directly rather than relying on preflight lstat.
      await assert.rejects(writeLocalTextNoFollow(link, 'must-not-write'))
      assert.equal(await readFile(target, 'utf8'), 'unchanged')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

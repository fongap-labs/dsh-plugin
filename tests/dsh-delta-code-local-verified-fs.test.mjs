import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, link, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readLocalTextVerified, writeLocalTextVerified,
} from '../packages/dsh-delta-code/lib/runtime.js'

describe('Code Worker portable verified-handle local filesystem', () => {
  it('creates, reads and replaces a regular file using its opened handle', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-local-'))
    try {
      await mkdir(join(root, 'nested'))
      const file = join(root, 'nested', 'file.txt')
      await writeLocalTextVerified(root, file, 'before')
      assert.equal(await readLocalTextVerified(root, file), 'before')
      await writeLocalTextVerified(root, file, 'after')
      assert.equal(await readFile(file, 'utf8'), 'after')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a symlinked final file without truncating its referent', {
    skip: process.platform === 'win32',
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-symlink-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-verified-symlink-target-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'protected')
      const indirect = join(root, 'indirect.txt')
      await symlink(protectedFile, indirect)
      await assert.rejects(writeLocalTextVerified(root, indirect, 'unwanted'))
      await assert.rejects(readLocalTextVerified(root, indirect))
      assert.equal(await readFile(protectedFile, 'utf8'), 'protected')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects a symlinked parent pointing outside the workspace', {
    skip: process.platform === 'win32',
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-parent-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-verified-parent-target-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'protected')
      await symlink(outside, join(root, 'redirect'), 'dir')
      await assert.rejects(writeLocalTextVerified(root, join(root, 'redirect', 'protected.txt'), 'bad'))
      assert.equal(await readFile(protectedFile, 'utf8'), 'protected')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses a hardlinked target before truncating external content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-hardlink-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-verified-hardlink-target-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'protected')
      const alias = join(root, 'alias.txt')
      await link(protectedFile, alias)
      await assert.rejects(writeLocalTextVerified(root, alias, 'bad'), /regular unshared file/)
      assert.equal(await readFile(protectedFile, 'utf8'), 'protected')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects non-file targets without modifying them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-directory-'))
    try {
      await mkdir(join(root, 'directory'))
      await assert.rejects(writeLocalTextVerified(root, join(root, 'directory'), 'bad'))
      await assert.rejects(readLocalTextVerified(root, join(root, 'directory')))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('honors cancellation before opening or mutating a file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-cancel-'))
    try {
      const target = join(root, 'protected.txt')
      await writeFile(target, 'protected')
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        writeLocalTextVerified(root, target, 'unwanted', controller.signal),
        /abort/i,
      )
      await assert.rejects(
        readLocalTextVerified(root, target, controller.signal),
        /abort/i,
      )
      assert.equal(await readFile(target, 'utf8'), 'protected')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a regular target located outside the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-boundary-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-verified-boundary-target-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'protected')
      await assert.rejects(writeLocalTextVerified(root, protectedFile, 'bad'))
      await assert.rejects(readLocalTextVerified(root, protectedFile))
      assert.equal(await readFile(protectedFile, 'utf8'), 'protected')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })
})

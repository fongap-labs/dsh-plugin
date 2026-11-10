import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, link, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readLocalTextAnchored, writeLocalTextAnchored, readTextSafe, writeTextSafe,
} from '../packages/dsh-delta-code/lib/runtime.js'

const linux = { skip: process.platform !== 'linux' }
const noHost = { get: () => undefined }
const exec = () => ({ signal: new AbortController().signal })

describe('Code Worker Linux descriptor-anchored local filesystem', () => {
  it('creates nested directories, overwrites regular files and reads through anchored handles', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-ok-'))
    try {
      const path = join(root, 'deep', 'folder', 'file.txt')
      await writeTextSafe(noHost, exec(), root, 'deep/folder/file.txt', 'before')
      assert.equal(await readTextSafe(noHost, exec(), root, 'deep/folder/file.txt'), 'before')
      await writeLocalTextAnchored(root, path, 'after')
      assert.equal(await readLocalTextAnchored(root, path), 'after')
      assert.equal(await readFile(path, 'utf8'), 'after')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not follow symlinked intermediate directories, even when they point back inside', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-symlink-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-anchored-outside-'))
    try {
      await mkdir(join(root, 'inside'))
      await symlink(join(root, 'inside'), join(root, 'inside-link'), 'dir')
      await symlink(outside, join(root, 'outside-link'), 'dir')
      for (const rel of ['inside-link/file.txt', 'outside-link/file.txt']) {
        await assert.rejects(writeTextSafe(noHost, exec(), root, rel, 'not-written'))
        await assert.rejects(readTextSafe(noHost, exec(), root, rel))
      }
      await assert.rejects(readFile(join(root, 'inside', 'file.txt')), { code: 'ENOENT' })
      await assert.rejects(readFile(join(outside, 'file.txt')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects hardlinked write targets without truncating the other link', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-hardlink-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-anchored-linked-outside-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'unchanged')
      await link(protectedFile, join(root, 'hardlink.txt'))
      await assert.rejects(writeTextSafe(noHost, exec(), root, 'hardlink.txt', 'bad'), /unshared file/)
      assert.equal(await readFile(protectedFile, 'utf8'), 'unchanged')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('refuses final-component symlinks on writes and reads', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-final-'))
    const outside = await mkdtemp(join(tmpdir(), 'dsh-anchored-final-outside-'))
    try {
      const protectedFile = join(outside, 'protected.txt')
      await writeFile(protectedFile, 'unchanged')
      await symlink(protectedFile, join(root, 'final-link.txt'))
      await assert.rejects(writeLocalTextAnchored(root, join(root, 'final-link.txt'), 'bad'))
      await assert.rejects(readLocalTextAnchored(root, join(root, 'final-link.txt')))
      assert.equal(await readFile(protectedFile, 'utf8'), 'unchanged')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('rejects paths whose final entry is not a regular file', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-not-file-'))
    try {
      await mkdir(join(root, 'folder'))
      await assert.rejects(writeLocalTextAnchored(root, join(root, 'folder'), 'bad'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('honors cancellation before any filesystem mutation', linux, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-anchored-abort-'))
    try {
      const controller = new AbortController()
      controller.abort()
      await assert.rejects(
        writeTextSafe(noHost, { signal: controller.signal }, root, 'new/target.txt', 'bad'),
        /abort/i,
      )
      await assert.rejects(readFile(join(root, 'new', 'target.txt')), { code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

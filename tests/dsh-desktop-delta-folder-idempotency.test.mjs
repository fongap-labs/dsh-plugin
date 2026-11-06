import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = mkdtempSync(join(tmpdir(), 'delta-folder-noop-'))
const originalHome = os.homedir
os.homedir = () => HOME
syncBuiltinESMExports()
const { mutateFolderView, readFolderView, FolderConflictError } =
  await import('../packages/dsh-desktop-delta/lib/host/folders.js')
const file = join(HOME, '.dsh-ui-delta', 'folders.json')
after(() => {
  os.homedir = originalHome
  syncBuiltinESMExports()
  rmSync(HOME, { recursive: true, force: true })
})

const unchanged = (action) => {
  const before = readFolderView()
  const contents = readFileSync(file)
  const metadata = statSync(file)
  const result = mutateFolderView({ ...action, expectedRevision: before.revision })
  assert.deepEqual(result, before, 'no-op must return the existing view')
  assert.deepEqual(readFileSync(file), contents, 'no-op must not rewrite state')
  assert.equal(statSync(file).mtimeMs, metadata.mtimeMs, 'no-op must not touch mtime')
}

test('rename, move, assign and unassign no-ops preserve revision and disk file', () => {
  const first = mutateFolderView({ action: 'create', name: 'Research' })
  const id = first.folders[0].id
  const second = mutateFolderView({ action: 'create', name: 'Code' })
  assert.equal(second.folders.length, 2)
  unchanged({ action: 'rename', id, name: ' Research ' })
  unchanged({ action: 'move', id, direction: 'up' })
  unchanged({ action: 'move', id: second.folders[1].id, direction: 'down' })
  unchanged({ action: 'unassign', sessionId: 'not-yet-assigned' })
  mutateFolderView({ action: 'assign', sessionId: 'session-1', folderId: id })
  unchanged({ action: 'assign', sessionId: 'session-1', folderId: id })
  mutateFolderView({ action: 'unassign', sessionId: 'session-1' })
  unchanged({ action: 'unassign', sessionId: 'session-1' })
})

test('genuine updates change revision; stale no-ops still reject old versions', () => {
  const before = readFolderView()
  const id = before.folders[0].id
  const next = mutateFolderView({ action: 'rename', id, name: 'Analysis' })
  assert.notEqual(next.revision, before.revision)
  assert.throws(() => mutateFolderView({
    action: 'rename', id, name: 'Analysis', expectedRevision: before.revision,
  }), FolderConflictError)
  unchanged({ action: 'rename', id, name: 'Analysis' })
})

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = mkdtempSync(join(tmpdir(), 'delta-folder-orphans-'))
const oldHome = os.homedir
os.homedir = () => HOME
syncBuiltinESMExports()
const {
  readFolderView, mutateFolderView, countMissingAssignments, pruneMissingAssignments, FolderConflictError,
} = await import('../packages/dsh-suite-delta/lib/host/folders.js')
after(() => {
  os.homedir = oldHome
  syncBuiltinESMExports()
  rmSync(HOME, { recursive: true, force: true })
})

test('manual reconciliation never deletes active or archived sessions', () => {
  const created = mutateFolderView({ action: 'create', name: 'Research' })
  const id = created.folders[0].id
  for (const sessionId of ['active-1', 'archived-1', 'removed-1']) {
    mutateFolderView({ action: 'assign', sessionId, folderId: id })
  }
  const before = readFolderView()
  const persistedAndLive = new Set(['active-1', 'archived-1'])
  assert.equal(countMissingAssignments(persistedAndLive, before), 1)
  assert.equal(readFolderView().assignments['removed-1'], id)
  const result = pruneMissingAssignments(persistedAndLive, before.revision)
  assert.equal(result.removedCount, 1)
  assert.equal(result.view.assignments['removed-1'], undefined)
  assert.equal(result.view.assignments['active-1'], id)
  assert.equal(result.view.assignments['archived-1'], id)
  assert.equal(result.view.folders.length, 1)
  assert.equal(countMissingAssignments(persistedAndLive, result.view), 0)
})

test('cleanup is explicit and rejects stale revision to preserve concurrent changes', () => {
  const first = readFolderView()
  mutateFolderView({ action: 'create', name: 'Code' })
  assert.throws(() => pruneMissingAssignments(new Set(), first.revision), FolderConflictError)
  const current = readFolderView()
  const unchanged = pruneMissingAssignments(new Set(['active-1', 'archived-1']), current.revision)
  assert.equal(unchanged.removedCount, 0)
  assert.equal(unchanged.view.revision, current.revision)
})

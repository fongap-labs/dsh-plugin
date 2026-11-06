import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import os from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = mkdtempSync(join(tmpdir(), 'delta-folder-transactions-'))
const oldHome = os.homedir
os.homedir = () => HOME
syncBuiltinESMExports()
const {
  readFolders, readFolderView, mutateFolderView, forgetDeletedSession, FolderConflictError,
} = await import('../packages/dsh-suite-delta/lib/host/folders.js')
const FOLDER_FILE = join(HOME, '.dsh-ui-delta', 'folders.json')
after(() => {
  os.homedir = oldHome
  syncBuiltinESMExports()
  rmSync(HOME, { recursive: true, force: true })
})

test('stale revision cannot overwrite a newer folder assignment', () => {
  const initial = readFolderView()
  assert.equal(typeof initial.revision, 'string')
  assert.equal(initial.folders.length, 0)
  const first = mutateFolderView({ action: 'create', name: 'Research', expectedRevision: initial.revision })
  assert.notEqual(first.revision, initial.revision)
  assert.throws(
    () => mutateFolderView({ action: 'create', name: 'Outdated', expectedRevision: initial.revision }),
    FolderConflictError,
  )
  assert.deepEqual(readFolderView().folders.map(x => x.name), ['Research'])
  const next = mutateFolderView({ action: 'create', name: 'Code', expectedRevision: first.revision })
  assert.deepEqual(next.folders.map(x => x.name), ['Research', 'Code'])
})

test('a concurrent writer holding the lock cannot suffer a lost update', () => {
  const before = readFileSync(FOLDER_FILE, 'utf8')
  const lock = FOLDER_FILE + '.lock'
  mkdirSync(lock)
  try {
    assert.throws(
      () => mutateFolderView({ action: 'create', name: 'Do not overwrite' }),
      FolderConflictError,
    )
    assert.equal(readFileSync(FOLDER_FILE, 'utf8'), before)
  } finally {
    rmdirSync(lock)
  }
  assert.equal(readFolderView().folders.length, 2)
})

test('revision identifies the same atomic filesystem snapshot as folder data', () => {
  const persisted = readFolderView()
  const unchanged = readFolderView()
  assert.equal(unchanged.revision, persisted.revision)
  assert.deepEqual(readFolders().folders, persisted.folders)
  assert.equal(readFileSync(FOLDER_FILE, 'utf8').includes('Research'), true)
})

test('successful session deletion removes only assignment, never the folders', () => {
  const id = readFolderView().folders[0].id
  mutateFolderView({ action: 'assign', sessionId: 'session-001', folderId: id })
  assert.equal(forgetDeletedSession('session-001'), true)
  assert.equal(forgetDeletedSession('session-001'), false)
  assert.equal(readFolderView().assignments['session-001'], undefined)
  assert.deepEqual(readFolderView().folders.map(x => x.name), ['Research', 'Code'])
  assert.throws(() => forgetDeletedSession('../../root'), /Invalid session ID/)
})

test('createAndAssign commits folder and membership together under one revision', () => {
  const before = readFolderView()
  const created = mutateFolderView({
    action: 'createAndAssign', name: 'Atomic Folder', sessionId: 'atomic-session',
    expectedRevision: before.revision,
  })
  const folder = created.folders.find(item => item.name === 'Atomic Folder')
  assert.ok(folder)
  assert.equal(created.assignments['atomic-session'], folder.id)
  assert.notEqual(created.revision, before.revision)
  const bytes = readFileSync(FOLDER_FILE, 'utf8')
  assert.ok(bytes.includes('atomic-session'))
  assert.ok(bytes.includes('Atomic Folder'))
})

test('invalid createAndAssign fails closed with no orphan folder and no state write', () => {
  const before = readFolderView()
  const bytes = readFileSync(FOLDER_FILE, 'utf8')
  for (const request of [
    { action: 'createAndAssign', name: 'Bad Session', sessionId: '../outside' },
    { action: 'createAndAssign', name: 'Atomic Folder', sessionId: 'another' },
    { action: 'createAndAssign', name: 'Unassigned', sessionId: '' },
  ]) {
    assert.throws(() => mutateFolderView({ ...request, expectedRevision: before.revision }))
    assert.deepEqual(readFolderView(), before)
    assert.equal(readFileSync(FOLDER_FILE, 'utf8'), bytes)
  }
})

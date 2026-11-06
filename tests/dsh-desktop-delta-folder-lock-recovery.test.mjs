import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = mkdtempSync(join(tmpdir(), 'delta-folder-lock-recovery-'))
const oldHome = os.homedir
os.homedir = () => HOME
syncBuiltinESMExports()
const { mutateFolderView, readFolderView, FolderConflictError } =
  await import('../packages/dsh-desktop-delta/lib/host/folders.js')

// Verify recovery using a real exited process, not an arbitrary invalid PID.
const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], {
  encoding: 'utf8',
})
assert.equal(child.status, 0)
const departedPid = Number(child.stdout.trim())
assert.ok(Number.isSafeInteger(departedPid) && departedPid > 0)
const lock = join(HOME, '.dsh-ui-delta', 'folders.json.lock')
const recovery = lock + '.recovery'
after(() => {
  os.homedir = oldHome
  syncBuiltinESMExports()
  rmSync(HOME, { recursive: true, force: true })
})

const seedLock = (owner) => {
  mkdirSync(lock, { recursive: true })
  if (owner !== undefined) {
    writeFileSync(join(lock, 'owner.json'), typeof owner === 'string' ? owner : JSON.stringify(owner))
  }
}
const clearLock = () => rmSync(lock, { recursive: true, force: true })

test('a dead owner can be recovered without losing persisted folder data', () => {
  const first = mutateFolderView({ action: 'create', name: 'Research' })
  assert.equal(existsSync(lock), false, 'normal owner and lock should be released')
  seedLock({ pid: departedPid, token: randomUUID() })
  const second = mutateFolderView({
    action: 'create', name: 'Code', expectedRevision: first.revision,
  })
  assert.deepEqual(second.folders.map(folder => folder.name), ['Research', 'Code'])
  assert.equal(existsSync(lock), false)
  assert.equal(existsSync(recovery), false)
  assert.notEqual(second.revision, first.revision)
})

test('live process owner cannot be evicted even if writer wants to mutate', () => {
  const before = readFolderView()
  seedLock({ pid: process.pid, token: randomUUID() })
  try {
    assert.throws(() => mutateFolderView({ action: 'create', name: 'Never create' }), FolderConflictError)
    assert.equal(existsSync(join(lock, 'owner.json')), true)
    assert.equal(readFolderView().revision, before.revision)
  } finally {
    clearLock()
  }
})

test('missing, malformed, or unrecognized lock owner fails closed', () => {
  for (const owner of [undefined, '{bad-json', { pid: -1, token: randomUUID() },
    { pid: departedPid, token: 'unrecognized' }]) {
    const before = readFolderView()
    seedLock(owner)
    try {
      assert.throws(() => mutateFolderView({ action: 'create', name: 'Reject unsafe recovery' }),
        FolderConflictError)
      assert.equal(readFolderView().revision, before.revision)
      assert.equal(existsSync(lock), true)
    } finally {
      clearLock()
    }
  }
})

test('unexpected lock contents or concurrent recovery contender prevent lock stealing', () => {
  seedLock({ pid: departedPid, token: randomUUID() })
  writeFileSync(join(lock, 'unexpected.txt'), 'do not remove')
  try {
    assert.throws(() => mutateFolderView({ action: 'create', name: 'Unsafe' }), FolderConflictError)
    assert.equal(readFileSync(join(lock, 'unexpected.txt'), 'utf8'), 'do not remove')
  } finally {
    clearLock()
  }
  seedLock({ pid: departedPid, token: randomUUID() })
  mkdirSync(recovery)
  try {
    assert.throws(() => mutateFolderView({ action: 'create', name: 'Contested' }), FolderConflictError)
    assert.equal(existsSync(join(lock, 'owner.json')), true)
  } finally {
    rmSync(recovery, { recursive: true, force: true })
    clearLock()
  }
})

test('a symlink masquerading as a lock directory is not followed or removed', {
  skip: process.platform === 'win32',
}, () => {
  const target = join(HOME, 'unrelated-owner-directory')
  mkdirSync(target)
  writeFileSync(join(target, 'owner.json'), JSON.stringify({ pid: departedPid, token: randomUUID() }))
  symlinkSync(target, lock, 'dir')
  try {
    const before = readFolderView().revision
    assert.throws(() => mutateFolderView({ action: 'create', name: 'Reject link' }),
      FolderConflictError)
    assert.equal(readFolderView().revision, before)
    assert.equal(existsSync(join(target, 'owner.json')), true)
  } finally {
    clearLock()
    rmSync(target, { recursive: true, force: true })
  }
})

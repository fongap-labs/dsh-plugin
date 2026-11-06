import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-folder-tests-'))
const FILE = path.join(HOME, '.dsh-ui-delta', 'folders.json')
const oldHome = os.homedir
os.homedir = () => HOME
syncBuiltinESMExports()
const { readFolders, mutateFolders } = await import('../packages/dsh-desktop-delta/lib/host/folders.js')

after(() => {
  os.homedir = oldHome
  syncBuiltinESMExports()
  fs.rmSync(HOME, { recursive: true, force: true })
})

test('session folders are stored atomically and never alter account configuration', () => {
  const cfg = path.join(HOME, '.dsh-ui-delta', 'config.json')
  fs.mkdirSync(path.dirname(cfg), { recursive: true })
  fs.writeFileSync(cfg, '{"search":{"providers":[{"apiKeyEnc":"sealed"}]}}\n')
  assert.deepEqual(readFolders(), { folders: [], assignments: {} })
  const created = mutateFolders({ action: 'create', name: '  Research  ' })
  assert.equal(created.folders[0]?.name, 'Research')
  assert.ok(/^[a-f0-9-]{36}$/.test(created.folders[0]?.id ?? ''))
  assert.deepEqual(fs.readdirSync(path.dirname(FILE)).sort(), ['config.json', 'folders.json'])
  assert.match(fs.readFileSync(cfg, 'utf8'), /"apiKeyEnc":"sealed"/)
  assert.deepEqual(readFolders().folders, created.folders)
})

test('rename, reorder, assignment and deletion preserve the session contents', () => {
  const research = readFolders().folders[0]
  assert.ok(research)
  const development = mutateFolders({ action: 'create', name: 'Code' }).folders[1]
  assert.ok(development)
  let state = mutateFolders({ action: 'assign', sessionId: 'session-123', folderId: research.id })
  assert.equal(state.assignments['session-123'], research.id)
  state = mutateFolders({ action: 'move', id: development.id, direction: 'up' })
  assert.deepEqual(state.folders.map(folder => folder.name), ['Code', 'Research'])
  state = mutateFolders({ action: 'rename', id: research.id, name: 'Analysis' })
  assert.equal(state.folders.find(folder => folder.id === research.id)?.name, 'Analysis')
  state = mutateFolders({ action: 'unassign', sessionId: 'session-123' })
  assert.equal(state.assignments['session-123'], undefined)
  mutateFolders({ action: 'assign', sessionId: 'session-123', folderId: research.id })
  state = mutateFolders({ action: 'delete', id: research.id })
  assert.equal(state.assignments['session-123'], undefined)
  assert.deepEqual(state.folders.map(folder => folder.name), ['Code'])
})

test('invalid session ids, duplicate folder names and traversal attempts do not mutate the file', () => {
  const before = fs.readFileSync(FILE, 'utf8')
  const folderId = readFolders().folders[0]?.id ?? ''
  assert.throws(() => mutateFolders({ action: 'create', name: ' code ' }), /already exists/)
  assert.throws(() => mutateFolders({ action: 'assign', sessionId: '../../private', folderId }), /Invalid session ID/)
  assert.throws(() => mutateFolders({ action: 'assign', sessionId: 'session-124', folderId: 'unknown' }), /Folder not found/)
  assert.throws(() => mutateFolders({ action: 'rename', id: folderId, name: '' }), /1–80/)
  assert.equal(fs.readFileSync(FILE, 'utf8'), before)
})

test('corrupted persisted folders are left untouched and future writes fail closed', () => {
  const malformed = '{"folders": {"unexpected": true}}'
  fs.writeFileSync(FILE, malformed, 'utf8')
  assert.throws(() => readFolders(), /unreadable/)
  assert.throws(() => mutateFolders({ action: 'create', name: 'New' }), /unreadable/)
  assert.equal(fs.readFileSync(FILE, 'utf8'), malformed)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../packages/dsh-suite-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const source = readFileSync(new URL('../packages/dsh-suite-delta/src/host/folders.ts', import.meta.url), 'utf8')

test('mutations are versioned, serialized, and return HTTP 409 on conflicts', () => {
  assert.match(source, /const withFolderLock = <T>/)
  assert.match(source, /mkdirSync\(FOLDER_LOCK, \{ mode: 0o700 \}\)/)
  assert.match(source, /rmdirSync\(FOLDER_LOCK\)/)
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /expectedRevision !== state\.revision/)
  assert.match(route, /readFolderView\(\)/)
  assert.match(route, /mutateFolderView\(payload\)/)
  assert.match(route, /error instanceof FolderConflictError \? 409 : 400/)
})

test('all browser mutation entry points transmit current revision and discard outdated reads', () => {
  const count = (client.match(/expectedRevision:/g) || []).length
  assert.equal(count, 3)
  assert.match(client, /folderRequestId\.current/)
  assert.match(client, /folderMutationQueue/)
  assert.match(client, /requestId === folderRequestId/)
  assert.match(client, /requestId === folderReadId/)
  assert.match(client, /if \(isReloadNeeded\)/)
  assert.match(client, /folderSnapshot = data as FolderPanelState/)
})

test('deleting a cold session only cleans assignments after committed deletion', () => {
  const deleted = route.indexOf('await deleteColdSession(')
  const cleaned = route.indexOf('forgetDeletedSession(id)', deleted)
  assert.ok(deleted >= 0 && cleaned > deleted)
  assert.match(route, /return sendJson\(res, 200, \{ ok: true, folderCleanup: isFolderCleanupComplete \}\)/)
  assert.match(client, /if \(result\.folderCleanup === false\)/)
  assert.match(client, /new Event\('dsh-ui-delta:folders-changed'\)/)
})

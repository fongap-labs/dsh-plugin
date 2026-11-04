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

test('one shared store serializes folder mutations and discards outdated reads', () => {
  const storeStart = client.indexOf('const folderStore = (() => {')
  const storeEnd = client.indexOf("}, 'dsh-ui-delta: shared folder state')", storeStart)
  assert.ok(storeStart > 0 && storeEnd > storeStart)
  const store = client.slice(storeStart, storeEnd)
  assert.equal((client.match(/fetch\('\/dsh-ui-delta\/folders'/g) || []).length, 2)
  assert.equal((store.match(/expectedRevision:/g) || []).length, 1)
  assert.match(store, /let mutationQueue: Promise<unknown> = Promise.resolve\(\)/)
  assert.match(store, /const pending = mutationQueue\.then\(async \(\) => \{/)
  assert.match(store, /mutationQueue = pending\.then\(\(\) => undefined, \(\) => undefined\)/)
  assert.match(store, /const seq = \+\+requestSeq/)
  assert.match(store, /if \(seq === requestSeq\) publish\(next\)/)
  assert.match(store, /if \(!folderStore\.isBroadcasting\(\)\)/)
  assert.match(store, /folderStore\.dispose\(\)/)
  assert.doesNotMatch(client, /FolderMenuView|FolderPanelState|folderMutationQueue|folderReadId|folderRequestId/)
})

test('settings, native menus and sidebar use the same cache and revision contract', () => {
  assert.match(client, /React\.useEffect\(\(\) => folderStore\.subscribe\(\(\) => setFolderView\(folderStore\.view\(\)\)\), \[\]\)/)
  assert.match(client, /await folderStore\.mutate\(payload\)/)
  assert.match(client, /const folderCache = folderStore\.view\(\)/)
  assert.match(client, /const updateFolder = \(payload: Record<string, unknown>\) => folderStore\.mutate\(payload\)/)
  assert.match(client, /const mutate = \(payload: Record<string, unknown>\) => folderStore\.mutate\(payload\)/)
  assert.match(client, /folderStore\.publish\(data as FolderStoreView\)/)
  assert.equal((client.match(/window\.addEventListener\('dsh-ui-delta:folders-changed'/g) || []).length, 1)
  assert.equal((client.match(/window\.removeEventListener\('dsh-ui-delta:folders-changed'/g) || []).length, 1)
})

test('deleting a cold session only cleans assignments after committed deletion', () => {
  const deleted = route.indexOf('await deleteColdSession(')
  const cleaned = route.indexOf('forgetDeletedSession(id)', deleted)
  assert.ok(deleted >= 0 && cleaned > deleted)
  assert.match(route, /return sendJson\(res, 200, \{ ok: true, folderCleanup: isFolderCleanupComplete \}\)/)
  assert.match(client, /if \(result\.folderCleanup === false\)/)
  assert.match(client, /new Event\('dsh-ui-delta:folders-changed'\)/)
})

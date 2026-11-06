import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const host = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
const folders = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/folders.ts', import.meta.url), 'utf8')

test('folder mutations stay on the trusted localhost route', () => {
  assert.match(host, /route\('\/dsh-ui-delta\/folders'/)
  assert.match(host, /if \(!isTrustedRequest\(req\)\)/)
  assert.match(host, /readBody\(req, 16 \* 1024\)/)
  assert.match(host, /readFolderView\(\)/)
  assert.match(host, /mutateFolderView\(payload\)/)
})

test('folder actions use the host context menu and settings slot without DOM reshuffling', () => {
  assert.match(client, /id: 'session.delta-folder', target: 'session'/)
  assert.match(client, /action: 'assign', sessionId, folderId: folder.id/)
  assert.match(client, /action: 'unassign', sessionId/)
  assert.match(client, /id: 'session.delta-delete'/)
  assert.match(client, /ctx.slots.inject\('settings.section'/)
  assert.match(client, /key: 'session-folders'/)
  assert.match(client, /window.dispatchEvent\(new Event\('dsh-ui-delta:folders-changed'\)\)/)
  assert.doesNotMatch(client, /appendChild\(.*wnFoaW_sessionRow/)
  assert.doesNotMatch(client, /insertBefore\(.*wnFoaW_sessionRow/)
})

test('persistence limits and strict corruption semantics are mandatory', () => {
  assert.match(folders, /const MAX_FOLDERS = 100/)
  assert.match(folders, /const MAX_ASSIGNMENTS = 10000/)
  assert.match(folders, /randomUUID\(\)/)
  assert.match(folders, /renameSync\(temp, FOLDER_FILE\)/)
  assert.match(folders, /the original file was preserved/)
  assert.match(client, /'#286F78', dark: '#60B4BF'/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const routes = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/routes.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
const verification = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/folder-reconciliation.ts', import.meta.url), 'utf8')

test('session cleanup requires the complete persisted and live Host views', () => {
  assert.match(routes, /route\('\/dsh-ui-delta\/folder-cleanup'/)
  assert.match(routes, /host\.get\?\.\('sessionPersistence'\)/)
  assert.match(routes, /host\.get\?\.\('sessions'\)/)
  assert.match(routes, /if \(!persistence\?\.list \|\| !persistence\.open \|\| !sessions\?\.get\)/)
  assert.match(routes, /verifiedKnownSessionIds\(persistence, sessions, view\.assignments\)/)
  assert.match(verification, /const rows = await persistence\.list\(\)/)
  assert.match(verification, /handle = await persistence\.open\(id, 'read'\)/)
  assert.match(verification, /SessionPersistenceNotFoundError/)
  assert.match(verification, /if \(sessions\.get\(id\) !== undefined\) ids\.add\(id\)/)
  assert.match(routes, /missingCount: countMissingAssignments\(known, view\)/)
  assert.match(routes, /pruneMissingAssignments\(known, body\.expectedRevision\)/)
  assert.doesNotMatch(routes, /ctx\.on\('api-session\/removed'/)
})

test('operator preview, confirmation and revision check are required before deleting an assignment', () => {
  assert.match(client, /const cleanupMissingFolderAssignments = async/)
  assert.match(client, /const previewResponse = await fetch\('\/dsh-ui-delta\/folder-cleanup'\)/)
  assert.match(client, /window\.confirm\(pick\(/)
  assert.match(client, /body: JSON\.stringify\(\{ expectedRevision: preview\.revision \}\)/)
  assert.match(client, /'dsh-ui-delta:folders-changed'/)
  assert.match(client, /key: 'cleanup'/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
})

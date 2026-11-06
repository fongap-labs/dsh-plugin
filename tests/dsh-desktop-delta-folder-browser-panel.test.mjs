import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
const host = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/folders.ts', import.meta.url), 'utf8')

test('no extra session folder launcher or competing browser is registered', () => {
  assert.doesNotMatch(client, /delta\.session-folders|FolderBrowserPanel|sidebar\.panellist', id: PANEL_ID/)
  assert.doesNotMatch(client, /ctx\.slots\.inject\('main'/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.hover'/)
  assert.match(client, /The Host renders and reconciles its original session list/)
})

test('native session menu retains folder operations and atomic create-and-assign', () => {
  assert.match(client, /id: 'session\.delta-folder', target: 'session'/)
  assert.match(client, /action: 'createAndAssign', name: name\.trim\(\), sessionId/)
  assert.match(client, /action: 'assign', sessionId, folderId: folder\.id/)
  assert.match(client, /action: 'unassign', sessionId/)
  assert.match(host, /case 'createAndAssign':/)
  assert.match(host, /writeFolders\(next\)/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const folders = readFileSync(new URL('../packages/dsh-suite-delta/src/host/folders.ts', import.meta.url), 'utf8')
const contract = readFileSync(new URL('../packages/dsh-suite-delta/src/harness-module.d.ts', import.meta.url), 'utf8')

test('uses declared Host sidebar slots instead of replacing the Workspace browser', () => {
  assert.match(client, /const PANEL_ID = 'delta\.session-folders'/)
  assert.match(client, /ctx\.slots\.inject\('main'/)
  assert.match(client, /name: 'main', key: PANEL_ID/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.panellist'/)
  assert.match(client, /name: 'sidebar\.panellist', id: PANEL_ID/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.match(client, /id: 'delta\.session-folder-indicator'/)
  assert.doesNotMatch(client, /ctx\.slots\.inject\('sidebar\.workspaces',/)
  assert.doesNotMatch(client, /ctx\.slots\.register\(\{\s*name: 'sidebar',/)
})

test('folder panel uses catalog snapshots without retaining or rewriting Host sessions', () => {
  assert.match(client, /getSnapshot\(\) \|\| \{ ids: \[\], byId:/)
  assert.match(client, /sessionList\?\.subscribe/)
  assert.match(client, /item\.origin !== 'subagent'/)
  assert.match(client, /!item\.blank/)
  assert.match(client, /navigation\.openSession\(id\)/)
  assert.doesNotMatch(client, /appendChild\([^)]*sessionRow/)
  assert.doesNotMatch(client, /insertBefore\([^)]*sessionRow/)
})

test('drag classification is bounded to the visible catalog and has a keyboard alternative', () => {
  assert.match(client, /const DRAG_TYPE = 'application\/x-delta-session-id'/)
  assert.match(client, /event\.dataTransfer\.setData\(DRAG_TYPE, item\.id\)/)
  assert.match(client, /event\.dataTransfer\.getData\(DRAG_TYPE\)/)
  assert.match(client, /if \(!knownIds\.has\(sessionId\)\) return/)
  assert.match(client, /onDragOver:/)
  assert.match(client, /onDrop:/)
  assert.match(client, /'aria-label': t\('选择会话文件夹', 'Choose session folder'\)/)
  assert.match(client, /action: 'unassign', sessionId: item\.id/)
  assert.match(client, /action: 'assign', sessionId: item\.id, folderId/)
})

test('folder navigator shares the persisted state without changing the brand color contract', () => {
  assert.match(client, /\/dsh-ui-delta\/folders/)
  assert.match(client, /dsh-ui-delta:folders-changed/)
  assert.match(client, /className: 'ens-folder-browser'/)
  assert.match(client, /className: 'ens-folder-browser-group'/)
  assert.match(client, /className: 'ens-folder-browser-row-tag'/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
  assert.match(folders, /renameSync\(temp, FOLDER_FILE\)/)
  assert.match(contract, /slots: \{/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const folderContract = readFileSync(new URL('../packages/dsh-suite-delta/src/host/folders.ts', import.meta.url), 'utf8')

test('renders Session folder markers through Host owned trailing and hover slots only', () => {
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.trailing'/)
  assert.match(client, /ctx\.slots\.inject\('sidebar\.session\.row\.hover'/)
  assert.match(client, /id: 'delta\.session-folder-marker'/)
  assert.match(client, /id: 'delta\.session-folder-detail'/)
  assert.match(client, /function FolderRowMarker\(\{ sessionId \}/)
  assert.match(client, /function FolderHoverDetail\(\{ sessionId \}/)
  assert.match(client, /folderForSession\(view, sessionId\)/)
  assert.match(client, /role: 'img', title: label, 'aria-label': label/)
  assert.doesNotMatch(client, /appendChild\(.*wnFoaW_sessionRow/)
  assert.doesNotMatch(client, /insertBefore\(.*wnFoaW_sessionRow/)
  assert.doesNotMatch(client, /onDragStart=.*folder/)
  assert.doesNotMatch(client, /onDrop=.*folder/)
})

test('shares one passive folder snapshot across row decorations and cleans up listeners', () => {
  assert.match(client, /const folderDecorationListeners = new Set<\(\) => void>\(\)/)
  assert.match(client, /let pendingFolderRefresh: Promise<void> \| undefined/)
  assert.match(client, /if \(pendingFolderRefresh\) return pendingFolderRefresh/)
  assert.match(client, /folderDecorationState = data as FolderDecorationState/)
  assert.match(client, /for \(const listener of folderDecorationListeners\) listener\(\)/)
  assert.match(client, /folderReact\.useEffect\(\(\) => \{/)
  assert.match(client, /folderDecorationListeners\.add\(update\)/)
  assert.match(client, /folderDecorationListeners\.delete\(update\)/)
  assert.match(client, /window\.removeEventListener\('dsh-ui-delta:folders-changed', onFoldersChanged\)/)
  assert.match(client, /folderDecorationListeners\.clear\(\)/)
  assert.match(client, /Keep the last valid snapshot; never affect Host navigation/)
})

test('preserves folder assignments and theme while avoiding native session tree replacement', () => {
  assert.match(folderContract, /readFolders/)
  assert.match(folderContract, /assignments: Record<string, string>/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
  assert.match(client, /\.ens-folder-row-marker \{/)
  assert.match(client, /\.ens-folder-hover-detail \{/)
  assert.match(client, /pointer-events: none;/)
  assert.match(client, /ctx\.slots\.inject\('settings\.section'/)
  assert.match(client, /id: 'session\.delta-folder', target: 'session'/)
})

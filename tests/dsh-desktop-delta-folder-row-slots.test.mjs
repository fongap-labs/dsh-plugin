import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')

test('reuses the native folder browser snapshot rather than registering a second row indicator', () => {
  assert.equal((client.match(/id: 'delta\.session-folder-indicator'/g) || []).length, 1)
  assert.equal((client.match(/name: 'sidebar\.session\.row\.trailing'/g) || []).length, 1)
  assert.match(client, /function FolderSessionMarker\(props: \{ sessionId: string \}\)/)
  assert.match(client, /function FolderHoverDetail\(props: \{ sessionId: string \}\)/)
  assert.match(client, /id: 'delta\.session-folder-hover'/)
  assert.match(client, /name: 'sidebar\.session\.row\.hover'/)
  assert.match(client, /folderSnapshot\.assignments\[props\.sessionId\]/)
  assert.match(client, /folderSnapshot\.folders\.find\(item => item\.id === folderId\)/)
  assert.match(client, /folderReact\.useEffect\(\(\) => folderStore\.subscribe\(\(\) => setRevision\(value => value \+ 1\)\), \[\]\)/)
})

test('hover detail remains presentation-only and does not reparent native session rows', () => {
  const start = client.indexOf('function FolderHoverDetail(')
  const end = client.indexOf('function FolderSessionMarker(', start)
  assert.ok(start > 0 && end > start)
  const body = client.slice(start, end)
  assert.match(body, /ens-folder-hover-detail/)
  assert.match(body, /t\('文件夹', 'Folder'\)/)
  assert.doesNotMatch(body, /onDragStart|onDragOver|onDrop|dataTransfer|appendChild|insertBefore/)
  assert.match(client, /\.ens-folder-hover-detail \{/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
})

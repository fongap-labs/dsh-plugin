import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-desktop-delta/src/client.ts', import.meta.url), 'utf8')
const stylesheet = client.slice(client.indexOf('const STYLESHEET = `'), client.indexOf('\n`;', client.indexOf('const STYLESHEET = `')))

test('native sidebar launcher and settings management remain keyboard accessible', () => {
  assert.match(stylesheet, /\.ens-sidebar-search-input:focus-visible/)
  assert.match(client, /field\.setAttribute\('aria-label', t\('搜索会话', 'Search conversations'\)\)/)
  assert.match(stylesheet, /@media \(max-width: 720px\)/)
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(client, /function FolderBrowserPanel\(/)
})

test('folder settings actions identify the relevant folder', () => {
  const start = client.indexOf('const folderRow = h(UiCard,')
  const end = client.indexOf('const exportRow =', start)
  assert.ok(start > 0 && end > start)
  const settings = client.slice(start, end)
  for (const key of ['up', 'down', 'rename', 'delete']) {
    const index = settings.indexOf("key: '" + key + "', type: 'button'")
    assert.ok(index > 0, "missing folder action: " + key)
    assert.match(settings.slice(index, index + 360),
      /'aria-label': pick\([^\n]+\) \+ ': ' \+ folder\.name,/)
  }
})

test('folder row markers do not reparent native sessions', () => {
  assert.match(client, /function FolderSessionMarker\(/)
  assert.match(client, /function FolderHoverDetail\(/)
  assert.doesNotMatch(client, /appendChild\([^)]*sessionRow|insertBefore\([^)]*sessionRow/)
})

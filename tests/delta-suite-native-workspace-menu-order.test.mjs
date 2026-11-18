import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const start = normalizedSource.indexOf('      if (isWorkspaceMenu) {\n        // Harness and other plugins own all workspace lock commands.')
const end = normalizedSource.indexOf('      if (isSessionMenu) {\n', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native workspace order/separators remain untouched while deletion is still guarded', () => {
  assert.ok(start >= 0 && end > start)
  const workspace = normalizedSource.slice(start, end)
  for (const forbidden of ['setMenuNodeOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(', 'container.appendChild(', 'hiddenSepNodes']) {
    assert.equal(workspace.includes(forbidden), false, 'workspace ordering remains: ' + forbidden)
  }
  assert.doesNotMatch(source, /WORKSPACE_MENU_ORDERS/)
  assert.doesNotMatch(workspace, /lockEls|\.remove\(\)|items\.splice\(/, 'Host and third-party menu items stay intact')
  assert.match(workspace, /Delete workspace/, 'destructive action recognition remains')
  assert.match(workspace, /data-danger/)
  assert.match(workspace, /getWorkspaceCount\(\) <= 1/)
  assert.match(workspace, /hiddenSoleWorkspaceNodes/)
  assert.doesNotMatch(source, /SESSION_MENU_ORDERS/, 'the session ordering table was removed')
  assert.match(source, /if \(isSessionMenu\) \{/)
})

test('ZIP3 review pin still rejects an unapproved workspace DOM reorder', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '        // Built-in workspace separators and item order belong to Harness.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n        container.appendChild(items[0])')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

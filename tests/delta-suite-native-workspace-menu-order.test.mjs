import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = [
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Native workspace menus stay Harness-owned without native Sidebar DOM interception', () => {
  assert.match(source, /function installHostSearch\(/)
  for (const marker of ["installSidebarCompatibility","onMenuClickCapture","WORKSPACE_MENU_ORDERS","hiddenSoleWorkspaceNodes","syncMenus"]) {
    assert.equal(source.includes(marker), false, 'retired native UI takeover: ' + marker)
  }
  assert.doesNotMatch(theme, /\.dtd-context-menu(?:-item)?\b/)
})

test('release guard rejects restoring native Sidebar interception and altered theme', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  assert.throws(() => verifyApprovedZip3Client(emitted,
    source + '\nfunction installSidebarCompatibility() {}\n'),
    /retired native Sidebar DOM interception in client source/)
  const tamperedTheme = theme + '\n.dtd-lock-shield { outline: 5px solid red; }'
  const tamperedClient = emitted.replace(JSON.stringify(theme), JSON.stringify(tamperedTheme))
  assert.throws(() => verifyApprovedZip3Client(tamperedClient, source), /approved theme differs/)
})

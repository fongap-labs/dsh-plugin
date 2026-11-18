import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const norm = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const start = norm.indexOf('function installHostSearch(')
const end = norm.indexOf('\nwindow.__ModuleLoader__.load(', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Ctrl/Cmd+K remains native, Delta palette opens on its own input Enter', () => {
  assert.ok(start >= 0 && end > start)
  const section = norm.slice(start, end)
  for (const removed of ['onGlobalKeyDown', 'const isCmdK', "addEventListener('keydown', onGlobalKeyDown", "removeEventListener('keydown', onGlobalKeyDown"]) {
    assert.equal(section.includes(removed), false, 'global key takeover remains: ' + removed)
  }
  assert.match(section, /input\.addEventListener\('keydown', \(e: KeyboardEvent\) => \{/)
  assert.match(section, /if \(!isModalOpen && e\.key === 'Enter'\)/)
  assert.match(section, /openPalette\(input\.value\)/)
  assert.match(section, /kbdHint\.textContent = 'Enter'/)
  assert.match(section, /pushShortcut\('search', .*Global Command Search', '', \(\) => openPalette\(''\)\)/)
  assert.match(section, /modal\.addEventListener\('keydown', \(e: KeyboardEvent\)/)
  assert.match(section, /if \(!isModalOpen \|\| e\.key !== 'Escape'\) return/)
  assert.match(section, /mInput\.addEventListener\('keydown'/)
  assert.match(section, /getShortcutsService\(\)\?\.catalog\?\.getSnapshot/)
  assert.doesNotMatch(section, /getShortcutsService\(\)\?\.registry\?\.invoke\?\.\(id,/, 'native shortcut invocation is not owned by Delta')
})

test('ZIP3 Search Region pin prevents unapproved global shortcut capture', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '// Delta sidebar Enter opens Search Palette; global Ctrl/Cmd+K remains Harness-owned.'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n  window.addEventListener("keydown", e => e.stopImmediatePropagation(), true)')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

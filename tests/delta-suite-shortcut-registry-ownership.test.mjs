import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const start = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('Host ShortcutsService registry dispatch/invoke stays unmodified and uninvoked', () => {
  assert.ok(start >= 0 && end > start)
  const search = normalized.slice(start, end)
  for (const forbidden of [
    '__deltaSearchHooked', 'restoreShortcutHooks', 'origDispatch',
    'origInvoke', 'reg.dispatch =', 'reg.invoke =',
  ]) {
    assert.equal(search.includes(forbidden), false, 'private Host mutation remains: ' + forbidden)
  }
  assert.doesNotMatch(search, /onGlobalKeyDown|const isCmdK/, 'global shortcuts are now Harness-owned')
  assert.match(search, /modal\.addEventListener\('keydown'/, 'Delta Escape is scoped to its own dialog')
  assert.match(search, /kbdHint\.textContent = 'Enter'/, 'Delta search is opened from its own input')
  assert.match(search, /getShortcutsService\(\)\?\.catalog\?\.getSnapshot/, 'shortcut catalog remains readable')
  assert.doesNotMatch(search, /getShortcutsService\(\)\?\.registry\?\.invoke\?\.\(id,/, 'unknown Host commands must not be executed by Delta')
  assert.match(search, /function installHostSearch\(/)
  assert.match(search, /const triggerModalSearch =/)
})

test('ZIP3 client review pin rejects reintroducing private shortcut method overrides', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '  let observer: MutationObserver | undefined\n  const frameScheduler = createFrameScheduler(() => sync())'
  assert.ok(normalized.includes(anchor))
  const modified = normalized.replace(anchor, '  getShortcutsService().registry.dispatch = () => {}\n' + anchor)
  assert.notEqual(modified, normalized)
  assert.throws(() => verifyApprovedZip3Client(emitted, modified), /approved compatibility adapter changed/)
})

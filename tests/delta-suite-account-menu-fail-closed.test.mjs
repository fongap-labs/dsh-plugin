import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-desktop-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-desktop/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-desktop/src/theme.css')
const start = normalized.indexOf('          const findTargetItem = (): HTMLElement | undefined => {')
const end = normalized.indexOf('\n          let attempts = 0', start)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'data-delta-compat dtd-native-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

function choose(kind, items, existing = [], openedByDelta = true) {
  assert.ok(start >= 0 && end > start)
  // Execute the actual, pure menu-selection body from the TS client with types erased.
  const runnable = normalized.slice(start, end)
    .replace('const findTargetItem = (): HTMLElement | undefined => {', 'const findTargetItem = () => {')
    .replace('querySelectorAll<HTMLElement>', 'querySelectorAll')
    .replace('(el: HTMLElement): string =>', '(el) =>')
  return vm.runInNewContext(runnable + '\nfindTargetItem()', {
    document: { querySelectorAll: () => items },
    preExisting: new Set(existing),
    openedByDelta,
    kind,
  })
}

test('unknown account menu entries never trigger arbitrary first/last item selection', () => {
  const feedback = { textContent: 'Feedback' }
  const deleteItem = { textContent: 'Delete workspace' }
  assert.equal(choose('settings', [feedback, deleteItem]), undefined)
  assert.equal(choose('auth', [feedback, deleteItem]), undefined)
  assert.equal(choose('settings', [{ textContent: 'Account Settings (beta)' }]), undefined)
  assert.equal(choose('auth', [{ textContent: 'Sign out of everything' }]), undefined)
})

test('only explicit account commands can be selected, never old unrelated menu entries', () => {
  const settings = { textContent: ' Settings ' }
  const signOut = { textContent: 'Sign Out' }
  const signIn = { textContent: '登录' }
  assert.equal(choose('settings', [settings]), settings)
  assert.equal(choose('auth', [signOut]), signOut)
  assert.equal(choose('auth', [signIn]), signIn)
  assert.equal(choose('settings', [settings], [settings], true), undefined)
  assert.equal(choose('auth', [signOut], [signOut], true), undefined)
  assert.equal(choose('settings', [settings], [settings], false), settings,
    'an already-open account menu remains available')
})

test('unknown commands leave the native menu visible rather than dispatching guessed actions', () => {
  const attempts = normalized.indexOf('            if (attempts >= 24) {', end)
  const timer = normalized.indexOf('            silentMenuTimer = scheduleTimer(trySelect, 10)', attempts)
  assert.ok(attempts >= 0 && timer > attempts)
  const fallback = normalized.slice(attempts, timer)
  assert.match(fallback, /finishSilent\(\)/)
  assert.doesNotMatch(fallback, /liveTrigger\.click\(|triggerNativeSettingsShortcut\(|item\.click\(/)
  assert.doesNotMatch(normalized.slice(start, end), /candidates\[0\]|candidates\[candidates\.length - 1\]/)
})

test('ZIP3 review pin rejects reintroducing guessed account menu commands', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const anchor = '            const candidates = openedByDelta ? newItems : allItems'
  assert.ok(source.includes(anchor))
  const tampered = source.replace(anchor, anchor + '\n            candidates.push(...allItems)')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

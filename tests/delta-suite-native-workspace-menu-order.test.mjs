import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const normalizedSource = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const begin = normalizedSource.indexOf('function installSidebarCompatibility(')
const end = normalizedSource.indexOf('\ntype SearchTabId', begin)
const compatibility = normalizedSource.slice(begin, end)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native workspace order stays Harness-owned while deletion guards remain', () => {
  assert.ok(begin >= 0 && end > begin)
  for (const forbidden of [
    'setMenuNodeOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(',
    'WORKSPACE_MENU_ORDERS', 'SESSION_MENU_ORDERS', 'data-dtd-menu-order', 'dtd-injected-sep',
  ]) {
    assert.equal(compatibility.includes(forbidden), false, 'native workspace takeover remains: ' + forbidden)
  }
  assert.match(compatibility, /const workspaceCount = deltaFeatures\.getWorkspaceCount\(\)/)
  assert.match(compatibility, /if \(workspaceCount > 1\)/)
  assert.match(compatibility, /else if \(workspaceCount === 1\)/)
  assert.match(compatibility, /const isWorkspaceMenu = labels\.some/)
  assert.match(compatibility, /restoreHiddenNodes\('data-dtd-hidden-sole-workspace'/)
  assert.match(compatibility, /WORKSPACE_DELETE_LABELS\.has\(labels\[i\]\)/)
  assert.match(compatibility, /hiddenSoleWorkspaceNodes/)
  assert.match(compatibility, /onMenuClickCapture/)
})

test('ZIP3 review pin rejects an unapproved workspace DOM reorder', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, normalizedSource))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalizedSource.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const tampered = normalizedSource.slice(0, anchorOffset) +
    normalizedSource.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("[role=menu]")?.appendChild(document.createElement("div"))')
  assert.notEqual(tampered, normalizedSource)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
})

test('single-workspace guard skips multi-workspace menu scans and restores only its own hidden nodes', () => {
  const extract = (start, end) => {
    const from = source.indexOf(start)
    const to = source.indexOf(end, from + start.length)
    assert.ok(from >= 0 && to > from)
    return source.slice(from, to)
  }
  const fragment = [
    extract('  const restoreHiddenNodes =', '\n\n  const hidePrivacyNode ='),
    extract('  const hidePrivacyNode =', '\n  const BLOCKED_COMMAND_RE ='),
    extract('  const syncPrivacyDom =', '\n  const sync = (): void => {'),
  ].join('\n')
  const node = text => {
    const attributes = new Map([['role', 'menuitem']])
    return {
      textContent: text,
      isConnected: true,
      hidden: false,
      getAttribute(name) { return attributes.get(name) ?? null },
      setAttribute(name, value) { attributes.set(name, value) },
      removeAttribute(name) { attributes.delete(name) },
      querySelector() { return null },
    }
  }
  const rename = node('Rename')
  const deletion = node('Delete workspace')
  const menu = {
    children: [rename, deletion],
    getAttribute(name) { return name === 'role' ? 'menu' : null },
    querySelector() { return null },
  }
  let count = 1
  let menuScans = 0
  const guarded = new Set()
  const context = {
    hiddenSessionLogNodes: new Set(),
    hiddenPrivacyCmdNodes: new Set(),
    hiddenSoleWorkspaceNodes: guarded,
    hiddenDeletedRows: new Set(),
    BLOCKED_COMMAND_RE: /^\\/(?:export|feedback)(?:\\s|$)/i,
    WORKSPACE_RENAME_LABELS: new Set(['Rename']),
    WORKSPACE_DELETE_LABELS: new Set(['Delete workspace']),
    getMenuLabel: el => el.textContent,
    deltaFeatures: {
      ensureLoaded() {},
      getWorkspaceCount: () => count,
      syncLockShieldOverlay() {},
    },
    document: {
      querySelector() { return null },
      querySelectorAll(selector) {
        if (selector.startsWith('[data-row-key^="session:"]')) return []
        if (selector.startsWith('[role="listbox"]')) return []
        if (selector.includes('[class*="_viewport_"]')) {
          menuScans++
          return [menu]
        }
        throw Error('unexpected DOM scan: ' + selector)
      },
    },
  }
  const compiled = stripTypeScriptTypes(fragment + '\nthis.runSync = syncPrivacyDom',
    { mode: 'strip' })
  runInNewContext(compiled, context, { timeout: 1000 })
  context.runSync()
  assert.equal(menuScans, 1)
  assert.equal(deletion.hidden, true)
  assert.equal(deletion.getAttribute('data-dtd-hidden-sole-workspace'), '1')
  assert.equal(guarded.has(deletion), true)

  count = 0 // Unknown snapshots must not accidentally clear the old safety guard.
  context.runSync()
  assert.equal(menuScans, 1)
  assert.equal(deletion.hidden, true)

  count = 2
  context.runSync()
  assert.equal(menuScans, 1, 'multi-workspace passes must not inspect native menu labels')
  assert.equal(deletion.hidden, false)
  assert.equal(deletion.getAttribute('data-dtd-hidden-sole-workspace'), null)
  assert.equal(deletion.getAttribute('aria-hidden'), null)
  assert.equal(guarded.size, 0)
  context.runSync()
  assert.equal(menuScans, 1, 'repeated multi-workspace passes stay scan-free')

  count = 1
  context.runSync()
  assert.equal(menuScans, 2)
  assert.equal(deletion.hidden, true)
  assert.equal(guarded.has(deletion), true)
})

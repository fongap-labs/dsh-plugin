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
    const from = normalizedSource.indexOf(start)
    const to = normalizedSource.indexOf(end, from + start.length)
    assert.ok(from >= 0 && to > from)
    return normalizedSource.slice(from, to)
  }
  const fragment = [
    extract('  const previousVisibility =', '\n  const BLOCKED_COMMAND_RE ='),
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
    BLOCKED_COMMAND_RE: /feedback|export/i,
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

test('Delta restores only its own native-node visibility, including after third-party changes', () => {
  const first = normalizedSource.indexOf('  const previousVisibility =')
  const last = normalizedSource.indexOf('  const BLOCKED_COMMAND_RE =', first)
  assert.ok(first >= 0 && last > first)
  const ctx = {}
  const code = normalizedSource.slice(first, last) +
    '\nthis.hide = hidePrivacyNode; this.restore = restoreHiddenNodes;'
  runInNewContext(stripTypeScriptTypes(code, { mode: 'strip' }), ctx, { timeout: 1000 })
  const node = (isInitiallyHidden, previousAria, marker = null) => {
    const attrs = new Map()
    if (previousAria !== null) attrs.set('aria-hidden', previousAria)
    if (marker !== null) attrs.set('data-dtd-hidden-sole-workspace', marker)
    return {
      hidden: isInitiallyHidden,
      getAttribute(key) { return attrs.get(key) ?? null },
      setAttribute(key, value) { attrs.set(key, value) },
      removeAttribute(key) { attrs.delete(key) },
    }
  }
  const attr = 'data-dtd-hidden-sole-workspace'
  const hostHidden = node(true, 'true')
  const hiddenSet = new Set()
  ctx.hide(hostHidden, attr, hiddenSet)
  ctx.restore(attr, hiddenSet)
  assert.equal(hostHidden.hidden, true, 'Host pre-hidden nodes must remain hidden')
  assert.equal(hostHidden.getAttribute('aria-hidden'), 'true')
  assert.equal(hostHidden.getAttribute(attr), null)

  const thirdPartyAria = node(false, 'false')
  ctx.hide(thirdPartyAria, attr, hiddenSet)
  assert.equal(thirdPartyAria.hidden, true)
  ctx.restore(attr, hiddenSet)
  assert.equal(thirdPartyAria.hidden, false)
  assert.equal(thirdPartyAria.getAttribute('aria-hidden'), 'false')

  const changedByHost = node(false, null)
  ctx.hide(changedByHost, attr, hiddenSet)
  changedByHost.setAttribute('aria-hidden', 'false')
  ctx.restore(attr, hiddenSet)
  assert.equal(changedByHost.getAttribute('aria-hidden'), 'false',
    'new Host accessibility state is not Delta-owned')
  assert.equal(changedByHost.getAttribute(attr), null)

  const otherOwner = node(true, 'true', '1')
  ctx.hide(otherOwner, attr, hiddenSet)
  assert.equal(hiddenSet.has(otherOwner), false,
    'an inherited marker is not proof of ownership by this activation')
  ctx.restore(attr, hiddenSet)
  assert.equal(otherOwner.hidden, true)
  assert.equal(otherOwner.getAttribute('aria-hidden'), 'true')
  assert.equal(otherOwner.getAttribute(attr), '1')
})

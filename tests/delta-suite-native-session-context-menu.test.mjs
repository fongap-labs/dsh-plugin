import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const norm = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const from = norm.indexOf('        // Native session context menu order, separators, accessible text, and danger styling belong to Harness.\n')
const to = norm.indexOf('        continue\n      }\n\n    }\n  }\n\n  const syncSettingsNav', from)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native session context menu retains its own appearance while lock checks remain', () => {
  assert.ok(from >= 0 && to > from)
  const section = norm.slice(from, to)
  for (const forbidden of ['setMenuNodeOrder(', 'getSessionMenuOrder(', 'sortContainerChildrenByOrder(', 'createSepNode(', 'hidePrivacyNode(', 'appendChild(']) {
    assert.equal(section.includes(forbidden), false, 'context menu mutation remains: ' + forbidden)
  }
  for (const forbidden of ['SESSION_MENU_ORDERS', 'modifiedMenuNodes', 'hiddenSepNodes', 'data-dtd-menu-order', 'dtd-injected-sep']) {
    assert.equal(norm.includes(forbidden), false, 'orphaned client mutation: ' + forbidden)
    assert.equal(theme.includes(forbidden), false, 'orphaned theme mutation: ' + forbidden)
  }
  assert.doesNotMatch(section, /dtd-menu-danger|data-danger|setAttribute|classList\.add/)
  assert.match(section, /danger styling belong to Harness/)
  assert.match(norm, /onMenuClickCapture/)
  assert.match(norm, /LOCKED_MUTATION_LABELS/)
  assert.match(norm, /hiddenSoleWorkspaceNodes/)
})

test('release guard rejects unapproved session DOM mutation and CSS rule', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const marker = '// Native session context menu order, separators, accessible text, and danger styling belong to Harness.'
  assert.ok(source.includes(marker))
  const tampered = source.replace(marker, marker + '\n        container.appendChild(items[0])')
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
  const alteredCss = theme.replace(
    '.dtd-context-menu-item[data-danger="1"]',
    '.dtd-context-menu-item[data-dtd-menu-order="10"]',
  )
  assert.notEqual(alteredCss, theme)
  assert.throws(() => verifyApprovedZip3Client(emitted.replace(JSON.stringify(theme), JSON.stringify(alteredCss)), source), /approved theme differs/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const norm = source.replace(/\r\n/g, '\n')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const begin = norm.indexOf('function installSidebarCompatibility(')
const end = norm.indexOf('\ntype SearchTabId', begin)
const compatibility = norm.slice(begin, end)
const emitted = [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(theme) + ';',
].join('\n')

test('native session context menus retain Harness order and appearance', () => {
  assert.ok(begin >= 0 && end > begin)
  for (const forbidden of [
    'setMenuNodeOrder(', 'getSessionMenuOrder(', 'sortContainerChildrenByOrder(',
    'createSepNode(', 'syncMenus', 'syncSettingsNav', 'data-dtd-menu-order', 'dtd-injected-sep',
  ]) {
    assert.equal(compatibility.includes(forbidden), false, 'native menu takeover remains: ' + forbidden)
  }
  assert.doesNotMatch(compatibility, /dtd-menu-danger|classList\.add\(['"]dtd-menu-danger/)
  assert.match(compatibility, /onMenuClickCapture/)
  assert.match(compatibility, /LOCKED_MUTATION_LABELS/)
  assert.match(compatibility, /hiddenSoleWorkspaceNodes/)
  assert.equal(theme.includes('Context & View-Options Menu Dynamic Reordering'), false)
})

test('release guard rejects unapproved session DOM mutation and CSS rule', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted, source))
  const marker = 'const sync = (): void => {'
  assert.ok(source.includes(marker))
  const tampered = source.replace(marker, marker + '\n    document.querySelector("[role=menu]")?.appendChild(document.createElement("div"))')
  assert.notEqual(tampered, source)
  assert.throws(() => verifyApprovedZip3Client(emitted, tampered), /approved compatibility adapter changed/)
  const alteredCss = theme.replace(
    '.dtd-context-menu-item[data-danger="1"]',
    '.dtd-context-menu-item[data-dtd-menu-order="10"]',
  )
  assert.notEqual(alteredCss, theme)
  assert.throws(() => verifyApprovedZip3Client(emitted.replace(JSON.stringify(theme), JSON.stringify(alteredCss)), source), /approved theme differs/)
})

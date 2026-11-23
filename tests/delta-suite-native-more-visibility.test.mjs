import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const begin = normalized.indexOf('function installSidebarCompatibility(')
const end = normalized.indexOf('\ntype SearchTabId', begin)
const css = read('packages/delta-suite/src/theme.css')
const emitted = (style = css) => [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search',
  'const OWNED_CSS = ' + JSON.stringify(style) + ';',
].join('\n')

test('native More stays Host-owned; Delta does not rearrange the sidebar DOM', () => {
  for (const retired of [
    "mark(moreRow, 'more')", "unmark(moreRow, 'more')",
    "mark(button, 'primary-unpin')", 'data-dtd-live-more',
    'installLiveNativePresentation',
  ]) assert.equal(source.includes(retired), false, 'Host More takeover: ' + retired)
  assert.doesNotMatch(css, /\[class\*="wtg9ga_moreMenu"\]/)
  assert.match(css, /6\.2 Navigation Rows: Harness retains the native More action/)
  assert.match(source, /function installSidebarCompatibility\(/)
})

test('release guard accepts reviewed More restoration and rejects unreviewed client/theme changes', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const anchor = 'const sync = (): void => {\n    if (isDisposed || isSyncing) return'
  const anchorOffset = normalized.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned sidebar region')
  const mutatedClient = normalized.slice(0, anchorOffset) +
    normalized.slice(anchorOffset).replace(anchor,
      anchor + '\n    document.querySelector("button")?.style?.setProperty("display", "none")')
  assert.notEqual(mutatedClient, normalized)
  assert.throws(() => verifyApprovedZip3Client(emitted(), mutatedClient), /approved compatibility adapter changed/)
  const mutatedTheme = css.replace(
    '/* 6.2 Navigation Rows: Harness retains the native More action. */',
    '/* More should not be removed */',
  )
  assert.notEqual(mutatedTheme, css)
  assert.throws(() => verifyApprovedZip3Client(emitted(mutatedTheme), source), /approved theme differs/)
})

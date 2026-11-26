import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-ui-release.mjs'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const source = read('packages/delta-ui/src/client.ts')
const normalized = source.replace(/\r\n/g, '\n')
const begin = normalized.indexOf('function installHostSearch(')
const end = normalized.indexOf('\nwindow.__ModuleLoader__.load(', begin)
const css = read('packages/delta-ui/src/theme.css')
const emitted = (style = css) => [
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
  assert.doesNotMatch(source, /function installSidebarCompatibility\(/)
})

test('release guard accepts reviewed More restoration and rejects unreviewed client/theme changes', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const anchor = 'const initialCopy = DICTIONARIES[language()] ?? DICTIONARIES.en'
  const anchorOffset = normalized.indexOf(anchor, begin)
  assert.ok(begin >= 0 && end > begin && anchorOffset >= begin && anchorOffset < end,
    'mutation fixture must target the pinned public Search region')
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

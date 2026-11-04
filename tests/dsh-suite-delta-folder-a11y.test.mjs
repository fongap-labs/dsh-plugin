import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const stylesheet = client.slice(client.indexOf('const STYLESHEET = `'), client.indexOf('\n`;', client.indexOf('const STYLESHEET = `')))
const browserStart = client.indexOf('function FolderBrowserPanel()')
const browserEnd = client.indexOf("ctx.effect(() => ctx.slots.inject('main'", browserStart)
const browser = client.slice(browserStart, browserEnd)

test('folder navigation has explicit focus-visible styles in both themes', () => {
  assert.match(stylesheet, /\.ens-folder-browser-group-head:focus-visible/)
  assert.match(stylesheet, /\.ens-folder-browser-open:focus-visible/)
  assert.match(stylesheet, /outline: 2px solid var\(--ens-color-ring\)/)
  assert.match(client, /'--ens-color-primary': \{ light: '#286F78', dark: '#60B4BF' \}/)
  assert.match(stylesheet, /@media \(max-width: 720px\)/)
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)/)
})

test('drag cancellations and nested dragleave keep drop targets synchronized', () => {
  assert.match(browser, /onDragEnd: \(\) => setActiveDrop\(''\)/)
  assert.match(browser, /onDragLeave: \(event: \{ currentTarget: HTMLElement; relatedTarget: EventTarget \| null \}\) => \{/)
  assert.match(browser, /related instanceof Node && event\.currentTarget\.contains\(related\)/)
  assert.match(browser, /onDrop: \(event: \{ dataTransfer: DataTransfer; preventDefault\(\): void \}\) => \{/)
  assert.match(browser, /setActiveDrop\(''\)/)
  assert.match(client, /const DRAG_TYPE = 'application\/x-delta-session-id'/)
  assert.match(browser, /if \(!knownIds\.has\(sessionId\)\) return/)
  assert.match(browser, /'aria-expanded': !isCollapsed/)
  assert.match(browser, /node\('select', \{/)
  assert.doesNotMatch(browser, /appendChild\(.*wnFoaW_sessionRow|insertBefore\(.*wnFoaW_sessionRow/)
})

function luminance(color) {
  const values = color.match(/[a-f0-9]{2}/gi)
  assert.equal(values?.length, 3)
  const [r, g, b] = values.map(x => parseInt(x, 16) / 255)
  const linear = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('text-bearing semantic theme pairs retain WCAG AA 4.5:1 contrast', () => {
  const pairs = [
    ['#286F78', '#FFFFFF'], ['#60B4BF', '#0E1A1C'],
    ['#6B7079', '#F5F6F7'], ['#9AA1AA', '#131417'],
    ['#286F78', '#E7F0F2'], ['#60B4BF', '#1C3B40'],
  ]
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5,
      `Contrast below WCAG AA: ${foreground} on ${background}`)
  }
})

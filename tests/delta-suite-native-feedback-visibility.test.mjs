import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const source = read('packages/dsh-delta-suite/src/client.ts')
const theme = read('packages/dsh-delta-suite/src/theme.css')
const emitted = (css = theme) => [
  'function installSidebarCompatibility() {}',
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(css) + ';',
].join('\n')

test('native Feedback entry is no longer hidden; other protections remain', () => {
  for (const term of ['hiddenFeedbackNodes', 'FEEDBACK_MENU_LABELS', 'data-dtd-hidden-feedback']) {
    assert.equal(source.includes(term), false, 'Feedback DOM suppression remains: ' + term)
    assert.equal(theme.includes(term), false, 'Feedback theme suppression remains: ' + term)
  }
  assert.doesNotMatch(source, /syncMenus|Harness owns native Feedback menu entries/)
  assert.match(source, /BLOCKED_COMMAND_RE/, 'slash command policy remains separate')
  assert.match(source, /hiddenSessionLogNodes/, 'session log privacy remains')
  assert.match(source, /hiddenSoleWorkspaceNodes/, 'sole workspace guard remains')
  assert.match(theme, /\[data-dtd-hidden-session-log="1"\]/)
  assert.match(theme, /\[data-dtd-hidden-sole-workspace="1"\]/)
})

test('ZIP3 client and theme pins reject an unapproved Feedback hide', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  const marker = 'const cmdContainers = document.querySelectorAll'
  assert.ok(source.includes(marker))
  const changed = source.replace(marker, 'document.querySelector("[role=menuitem]")?.setAttribute("hidden", "")\n    ' + marker)
  assert.notEqual(changed, source)
  assert.throws(() => verifyApprovedZip3Client(emitted(), changed), /approved compatibility adapter changed/)
  const changedCss = theme.replace('[data-dtd-hidden-session-log="1"]', '[data-dtd-hidden-feedback="1"]')
  assert.notEqual(changedCss, theme)
  assert.throws(() => verifyApprovedZip3Client(emitted(changedCss), source), /approved theme differs/)
})

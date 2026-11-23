import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { verifyApprovedZip3Client } from '../scripts/verify-delta-suite-release.mjs'

const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')
const source = read('packages/delta-suite/src/client.ts')
const theme = read('packages/delta-suite/src/theme.css')
const emitted = (css = theme) => [
  'function installHostSearch() {}',
  'dtd-host-search data-delta-compat',
  'const OWNED_CSS = ' + JSON.stringify(css) + ';',
].join('\n')

test('native Feedback and Session Log menus are never intercepted by Suite', () => {
  for (const token of ['hiddenFeedbackNodes', 'FEEDBACK_MENU_LABELS',
    'data-dtd-hidden-feedback', 'BLOCKED_COMMAND_RE', 'hiddenSessionLogNodes',
    'hiddenSoleWorkspaceNodes']) assert.doesNotMatch(source, new RegExp(token))
  assert.doesNotMatch(theme, /data-dtd-hidden-feedback|dtd-footer-avatar-box/)
  assert.match(source, /function installHostSearch\(/)
})

test('ZIP3 client and theme pins reject an unapproved Feedback hide', () => {
  assert.doesNotThrow(() => verifyApprovedZip3Client(emitted(), source))
  assert.throws(() => verifyApprovedZip3Client(emitted() + '\nfunction installSidebarCompatibility() {}', source),
    /retired native Sidebar DOM interception/)
  const changedCss = theme.replace('[data-dtd-hidden-session-log="1"]', '[data-dtd-hidden-feedback="1"]')
  assert.notEqual(changedCss, theme)
  assert.throws(() => verifyApprovedZip3Client(emitted(changedCss), source), /approved theme differs/)
})

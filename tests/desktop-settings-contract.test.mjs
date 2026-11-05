import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')
const locale = read('../packages/dsh-desktop-delta/src/locales/zh-CN.ts')
const proposal = read('../packages/dsh-desktop-delta/SETTINGS_API_PROPOSAL.md')

test('settings UI separates local launch options from unavailable Harness settings', () => {
  assert.match(app, /zhCN\.localSettingsScope/)
  assert.match(app, /zhCN\.harnessRuntimeSettingsUnavailable/)
  assert.match(app, /zhCN\.sensitiveCredentialsUnavailable/)
  assert.match(app, /zhCN\.modelProviderSettingsScope/)
  assert.match(locale, /Provider \u548c\u6a21\u578b\u53ea\u5728\u8fde\u63a5\u65f6\u5e94\u7528/)
  assert.match(locale, /SDK stdio \u63a5\u53e3\u6ca1\u6709\u516c\u5f00\u7684\u8bbe\u7f6e\u8bfb\u53d6\u6216\u4fee\u6539\u65b9\u6cd5/)
  assert.match(locale, /\u5f53\u524d SDK \u8fde\u63a5\u6ca1\u6709\u5b89\u5168\u7684\u51ed\u636e\u8bfb\u5199\u63a5\u53e3/)
  assert.match(proposal, /Delta \u53ea\u5c55\u793a\u4e0d\u53ef\u7528\u8bf4\u660e/)
})

test('Host does not advertise or call unavailable settings and credential APIs', () => {
  assert.doesNotMatch(rust, /"settings\.(?:read|write)"/)
  assert.doesNotMatch(rust, /"credentials\./)
  assert.doesNotMatch(rust, /fn (?:get|update)_settings/)
  assert.doesNotMatch(client, /getSettings|updateSettings|setCredential|unsetCredential/)
})

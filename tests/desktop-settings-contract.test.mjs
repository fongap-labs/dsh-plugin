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
  assert.match(locale, /Provider 和模型只在连接时应用/)
  assert.match(locale, /SDK stdio 接口没有公开的设置读取或修改方法/)
  assert.match(locale, /当前 SDK 连接没有安全的凭据读写接口/)
  assert.match(proposal, /Delta 只展示不可用说明/)
})

test('Host does not advertise or call unavailable settings and credential APIs', () => {
  assert.doesNotMatch(rust, /"settings\.(?:read|write)"/)
  assert.doesNotMatch(rust, /"credentials\./)
  assert.doesNotMatch(rust, /fn (?:get|update)_settings/)
  assert.doesNotMatch(client, /getSettings|updateSettings|setCredential|unsetCredential/)
})

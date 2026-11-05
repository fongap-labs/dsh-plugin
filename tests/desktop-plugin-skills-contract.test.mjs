import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const rust = read('../packages/dsh-desktop-delta/src-tauri/src/lib.rs')
const client = read('../packages/dsh-desktop-delta/src/lib/desktop-host-client.ts')
const app = read('../packages/dsh-desktop-delta/src/App.tsx')
const locale = read('../packages/dsh-desktop-delta/src/locales/zh-CN.ts')
const proposal = read('../packages/dsh-desktop-delta/PLUGIN_SKILLS_API_PROPOSAL.md')

test('plugin and skill UI reports the current SDK stdio limits', () => {
  assert.match(app, /zhCN\.pluginsUnavailable/)
  assert.match(app, /zhCN\.pluginAgentToolHint/)
  assert.match(app, /zhCN\.skillsUnavailable/)
  assert.match(locale, /SDK stdio \u6ca1\u6709\u6309\u4f1a\u8bdd\u8bfb\u53d6\u6280\u80fd\u76ee\u5f55\u7684\u63a5\u53e3/)
  assert.match(proposal, /SDK stdio/)
})

test('Host and client do not advertise structured plugin or skill management methods', () => {
  assert.doesNotMatch(rust, /plugins\.list|plugins\.manage|skills\.manage|pluginManager|plugin_manager/)
  assert.doesNotMatch(client, /listPlugins|listSkills|installPlugin|removePlugin|updatePlugin/)
})

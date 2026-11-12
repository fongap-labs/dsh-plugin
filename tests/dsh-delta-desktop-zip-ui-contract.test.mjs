import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..')
const file = path => readFileSync(join(root, 'packages/dsh-delta-desktop', path), 'utf8')
const client = file('src/client.ts')
const css = file('src/theme.css')
const zh = JSON.parse(file('locale/zh.json'))
const en = JSON.parse(file('locale/en.json'))

describe('Authoritative ZIP3 Desktop UI and additive feature integration', () => {
  it('retains the exact ZIP theme, without replacing it with legacy main styles', () => {
    const b = Buffer.from(css)
    const sha = createHash('sha1').update('blob ' + b.length + '\0').update(b).digest('hex')
    assert.equal(sha, '8d893d7ecfe4a82703aa17ed4935ecdf4b773773')
  })
  it('retains the seven-tab SearchPalette and its explicit keyboard invocation', () => {
    for (const term of ['SearchTabId', 'tabAll', 'tabSession', 'tabWorkspace',
      'tabPlugin', 'tabSkill', 'tabShortcut', 'tabAction',
      'isCmdK', 'installHostSearch', 'searchPalette.sidebarPlaceholder']) {
      assert.ok(client.includes(term), 'ZIP feature missing: ' + term)
    }
    assert.doesNotMatch(client, /dtd-search-dialog-backdrop/)
    assert.doesNotMatch(client, /openSearchDialog\(/)
  })
  it('keeps ZIP TOTP, session menus, modal chrome and Host privacy', () => {
    for (const term of ['encodeQrMatrix', 'syncModalChromeOverlay',
      'data-delta-modal-open', 'setup-begin', 'session-delete-ungrouped',
      'installClientPrivacyGuards']) {
      assert.ok(client.includes(term), 'ZIP behavior missing: ' + term)
    }
  })
  it('registers repository feature slots without a second sidebar/search adapter', () => {
    for (const id of ['delta.advanced-features', 'delta.mcp.add-server',
      'delta.context.assistant-actions', 'delta.context.compaction-activity',
      'deltaContextCompactionStatus']) {
      assert.ok(client.includes(id), 'feature missing: ' + id)
    }
    assert.equal((client.match(/window\.__ModuleLoader__\.load\(/g) ?? []).length, 1)
    assert.equal((client.match(/function installHostSearch\(/g) ?? []).length, 1)
  })
  it('retains ZIP translations but adds main-only context, MCP and Vision labels', () => {
    for (const dictionary of [zh, en]) {
      assert.ok(dictionary.searchPalette.tabAll)
      assert.ok(dictionary.searchPalette.tabAction)
      for (const id of ['contextFeatures', 'mcpAddAction', 'privacyVisionTitle',
        'visionSave', 'discussTask', 'compactionCompleted']) {
        assert.equal(typeof dictionary.ui[id], 'string', id)
      }
    }
  })
})

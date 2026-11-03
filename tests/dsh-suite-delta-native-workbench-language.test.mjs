import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const client = readFileSync(new URL('../packages/dsh-suite-delta/src/client.ts', import.meta.url), 'utf8')
const host = readFileSync(new URL('../packages/dsh-suite-delta/src/index.ts', import.meta.url), 'utf8')

describe('native file references and Workbench ownership', () => {
  it('does not expose duplicate disabled settings controls', () => {
    assert.doesNotMatch(client, /id: 'fileReference'/)
    assert.doesNotMatch(client, /id: 'workbench'/)
  })

  it('leaves optional third-party sidebar integration out of Delta UI', () => {
    assert.doesNotMatch(client, /betterSidebar|nArs4W_|openWorkbench|ICON_WORKBENCH/)
  })
})

describe('reply language follows the saved Harness language', () => {
  it('uses official Host settings and prompt services, not chat interception', () => {
    assert.match(host, /\['systemPrompt', 'settings'\]/)
    assert.match(host, /name: 'delta:reply-language'/)
    assert.match(host, /item\.ns === 'locale'/)
    assert.match(host, /text: \(\) =>/)
    assert.doesNotMatch(client, /conversation\.composer[^\n]*language/)
  })

  it('handles Chinese and English independently, leaving other/default locales unchanged', () => {
    assert.match(host, /\^zh\(\?:-\|\$\)/)
    assert.match(host, /\^en\(\?:-\|\$\)/)
    assert.match(host, /if \(typeof locale !== 'string'\) return ''/)
    assert.match(host, /return ''/)
    assert.match(host, /explicitly requested output languages/)
  })
})

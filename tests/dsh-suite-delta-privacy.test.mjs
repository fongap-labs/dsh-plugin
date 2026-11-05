import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertOutboundTextSafe } from '../packages/dsh-suite-delta/lib/host/privacy.js'

const bundle = readFileSync(new URL('../packages/dsh-suite-delta/cordis.patch.yml', import.meta.url), 'utf8')
const host = readFileSync(new URL('../packages/dsh-suite-delta/src/index.ts', import.meta.url), 'utf8')

describe('Delta Suite data exit privacy safeguards', () => {
  it('never mounts Session Log upload or its upstream settings form', () => {
    assert.match(bundle, /- id: session-log-deepseek\r?\n\s+disabled: true/)
    assert.match(host, /registerExclusion\(\(\) => true\)/)
  })

  it('fails closed on credentials without echoing them', () => {
    const sensitive = [
      'sk-' + 'A'.repeat(24),
      'ghp_' + 'x'.repeat(36),
      'github_pat_' + 'A'.repeat(40),
      '-----BEGIN ' + 'PRIVATE KEY-----',
      'authorization: Bearer secret-123',
      'password=secret-password',
      'postgresql://admin:secret@host.example/db',
    ]
    for (const item of sensitive) {
      assert.throws(() => assertOutboundTextSafe(item, 'query', 500), error =>
        error instanceof Error && error.message.includes('Privacy guard') &&
        !error.message.includes(item))
    }
  })

  it('blocks obvious personal data and private file paths', () => {
    for (const item of [
      'contact person@example.com',
      'C:\\\\Users\\\\Alice\\\\confidential.txt',
      '/home/alice/secret.env',
      '/Users/alice/Documents',
      'call +1 415 555 0199',
    ]) {
      assert.throws(() => assertOutboundTextSafe(item, 'query', 500), /Privacy guard/)
    }
  })

  it('preserves clean requests and refuses oversize or ambiguous input', () => {
    assert.equal(assertOutboundTextSafe('  search for aspirin studies  ', 'search', 500), 'search for aspirin studies')
    assert.throws(() => assertOutboundTextSafe('x'.repeat(501), 'search', 500), /Privacy guard/)
    assert.throws(() => assertOutboundTextSafe('', 'search', 500), /Privacy guard/)
    assert.throws(() => assertOutboundTextSafe({ query: 'safe' }, 'search', 500), /Privacy guard/)
    assert.throws(() => assertOutboundTextSafe('hello' + String.fromCharCode(0) + 'world', 'search', 500), /Privacy guard/)
  })
})

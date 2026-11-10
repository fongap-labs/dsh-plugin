import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redactKnownTokens } from '../packages/dsh-delta-code/lib/tools/verify.js'
import { normalizeConfig } from '../packages/dsh-delta-code/lib/runtime.js'

test('verification output redacts GitHub credential patterns without known account mapping', () => {
  const classic = 'ghp_' + 'a'.repeat(36)
  const fineGrained = 'github_pat_' + 'b'.repeat(22)
  const output = redactKnownTokens('start ' + classic + ' and ' + fineGrained + ' end',
    normalizeConfig({}))
  assert.equal(output, 'start [REDACTED] and [REDACTED] end')
})

test('verification output redacts a configured secret from the environment', () => {
  const key = 'DSH_DELTA_CODE_REDACT_TEST'
  const secret = 'example_secret_that_must_not_escape'
  const previous = process.env[key]
  try {
    process.env[key] = secret
    const settings = normalizeConfig({ github: {
      accounts: [{ owner: 'example', tokenEnv: key }],
    } })
    assert.equal(redactKnownTokens('before ' + secret + ' after', settings), 'before [REDACTED] after')
  } finally {
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
})

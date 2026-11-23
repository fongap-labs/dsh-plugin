import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findRetiredIdentifiers } from '../scripts/verify-delta-suite-naming.mjs'

test('All Delta plugins use only canonical package, Cordis and release identities', () => {
  assert.deepEqual(findRetiredIdentifiers(), [])
})

test('Legacy plugin names fail the audit; historical changelog is not a compatibility shim', () => {
  const dir = mkdtempSync(join(tmpdir(), 'delta-plugin-names-'))
  const retired = ['dsh', 'delta', 'suite'].join('-')
  try {
    writeFileSync(join(dir, retired + '.md'), 'old plugin id')
    writeFileSync(join(dir, 'CHANGELOG.md'), retired)
    const failures = findRetiredIdentifiers(dir)
    assert.ok(failures.some(issue => issue.includes('legacy plugin path')))
    assert.ok(failures.every(issue => !issue.startsWith('CHANGELOG.md')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

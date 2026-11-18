import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findRetiredIdentifiers } from '../scripts/verify-delta-suite-naming.mjs'

test('Delta Suite source and file paths contain no retired product names', () => {
  assert.deepEqual(findRetiredIdentifiers(), [])
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as legacy from '../packages/delta-code/lib/runtime.js'
import * as adapter from '../packages/delta-code/lib/delta-code-adapter/workspace-files.js'

const exportedFunctions = [
  'resolveRoot', 'validateWriteTargetSafe', 'readTextSafe', 'writeTextSafe',
  'readLocalTextAnchored', 'writeLocalTextAnchored',
  'readLocalTextVerified', 'writeLocalTextVerified', 'writeLocalTextNoFollow',
]

describe('Delta Code file adapter boundary', () => {
  it('preserves all existing filesystem function references for consumers', () => {
    for (const name of exportedFunctions) {
      assert.equal(typeof legacy[name], 'function', name)
      assert.equal(legacy[name], adapter[name], name + ' legacy re-export mismatch')
    }
  })

  it('keeps Host and local I/O implementation out of config normalization', () => {
    const source = readFileSync(
      new URL('../packages/delta-code/src/runtime.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from ['"]node:fs/)
    assert.doesNotMatch(source, /from ['"]node:path/)
    assert.doesNotMatch(source, /lookupDshHostFs|requireHostFs|lookupDshWorkingDirectory/)
    const adapterSource = readFileSync(
      new URL('../packages/delta-code/src/delta-code-adapter/workspace-files.ts', import.meta.url), 'utf8')
    assert.match(adapterSource, /requireHostFs/)
    assert.match(adapterSource, /writeLocalTextAnchored/)
    assert.match(adapterSource, /writeTextSafe/)
  })
})

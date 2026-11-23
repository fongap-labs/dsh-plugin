import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createVerifyTool as legacyVerifyTool, prepareVerify as legacyPrepare,
  runPreparedVerify as legacyRun, redactKnownTokens as legacyRedact,
} from '../packages/delta-code/lib/tools/verify.js'
import { createVerifySuiteTool as legacySuiteTool } from '../packages/delta-code/lib/tools/verify-suite.js'
import {
  createVerifyTool as qualityVerifyTool, prepareVerify as qualityPrepare,
  runPreparedVerify as qualityRun, redactKnownTokens as qualityRedact,
} from '../packages/delta-code/lib/delta-code-quality/verify.js'
import { createVerifySuiteTool as qualitySuiteTool } from '../packages/delta-code/lib/delta-code-quality/verify-suite.js'
import {
  createVerifyTool as adapterVerifyTool, prepareVerify as adapterPrepare,
  runPreparedVerify as adapterRun, redactKnownTokens as adapterRedact,
} from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/verify.js'
import { createVerifySuiteTool as adapterSuiteTool } from '../packages/delta-code/lib/delta-code-adapter/providers/dsh/verify-suite.js'

describe('Delta Code DSH Quality execution adapter boundary', () => {
  it('preserves compatibility imports and function identity', () => {
    assert.strictEqual(legacyVerifyTool, adapterVerifyTool)
    assert.strictEqual(qualityVerifyTool, adapterVerifyTool)
    assert.strictEqual(legacyPrepare, adapterPrepare)
    assert.strictEqual(qualityPrepare, adapterPrepare)
    assert.strictEqual(legacyRun, adapterRun)
    assert.strictEqual(qualityRun, adapterRun)
    assert.strictEqual(legacyRedact, adapterRedact)
    assert.strictEqual(qualityRedact, adapterRedact)
    assert.strictEqual(legacySuiteTool, adapterSuiteTool)
    assert.strictEqual(qualitySuiteTool, adapterSuiteTool)
  })

  it('leaves Host SDK, execution and environment access only in the DSH adapter', () => {
    const src = new URL('../packages/delta-code/src/', import.meta.url)
    for (const path of ['delta-code-quality/verify.ts', 'delta-code-quality/verify-suite.ts']) {
      const contents = readFileSync(new URL(path, src), 'utf8')
      for (const forbidden of ['@deepseek-ai', 'runCommand(', 'defineTool(', 'process.env', 'requireHostFs(', 'node:fs']) {
        assert.equal(contents.includes(forbidden), false, path + ' contains ' + forbidden)
      }
      assert.ok(contents.includes("from '../delta-code-adapter/providers/dsh/"))
    }
    const adapterVerify = readFileSync(new URL('delta-code-adapter/providers/dsh/verify.ts', src), 'utf8')
    const adapterSuite = readFileSync(new URL('delta-code-adapter/providers/dsh/verify-suite.ts', src), 'utf8')
    const provider = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', src), 'utf8')
    assert.ok(adapterVerify.includes('runCommand(ctx,'))
    assert.ok(adapterVerify.includes('requireHostFs(ctx,'))
    assert.ok(adapterVerify.includes('outcome unconfirmed'))
    assert.ok(adapterSuite.includes('await prepareVerify('))
    assert.ok(provider.includes("from './verify.js'"))
    assert.ok(provider.includes("from './verify-suite.js'"))
  })
})

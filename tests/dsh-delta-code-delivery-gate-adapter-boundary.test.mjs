import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDeliveryGateTool as legacyTool,
  remainingDeliveryTasks as legacyRemaining,
  validateTaskAcceptance as legacyAcceptance,
} from '../packages/dsh-delta-code/lib/tools/delivery-gate.js'
import { createDeliveryGateTool as qualityTool } from '../packages/dsh-delta-code/lib/delta-code-quality/delivery-gate.js'
import {
  createDeliveryGateTool as adapterTool,
  remainingDeliveryTasks as adapterRemaining,
  validateTaskAcceptance as adapterAcceptance,
} from '../packages/dsh-delta-code/lib/delta-code-adapter/providers/dsh/delivery-gate.js'
import {
  remainingDeliveryTasks as pureRemaining,
  validateTaskAcceptance as pureAcceptance,
} from '../packages/dsh-delta-code/lib/delta-code-quality/delivery-policy.js'

describe('Delta Code delivery gate Adapter boundary', () => {
  it('keeps tool identity and pure task acceptance exports intact', () => {
    assert.strictEqual(legacyTool, adapterTool)
    assert.strictEqual(qualityTool, adapterTool)
    assert.strictEqual(legacyRemaining, pureRemaining)
    assert.strictEqual(adapterRemaining, pureRemaining)
    assert.strictEqual(legacyAcceptance, pureAcceptance)
    assert.strictEqual(adapterAcceptance, pureAcceptance)
  })

  it('places Host subprocess calls in DSH Adapter without weakening fail-closed rules', () => {
    const src = new URL('../packages/dsh-delta-code/src/', import.meta.url)
    const facade = readFileSync(new URL('delta-code-quality/delivery-gate.ts', src), 'utf8')
    const adapter = readFileSync(new URL('delta-code-adapter/providers/dsh/delivery-gate.ts', src), 'utf8')
    const registry = readFileSync(new URL('delta-code-adapter/providers/dsh/feature-tools.ts', src), 'utf8')
    for (const forbidden of ['@deepseek-ai', 'runCommand(', 'Context', 'defineTool(', 'process.env', 'node:fs']) {
      assert.equal(facade.includes(forbidden), false, forbidden)
    }
    assert.ok(adapter.includes('hostOnly: true'))
    assert.ok(adapter.includes('hasCompleteGitEvidence(result)'))
    assert.ok(adapter.includes('validateTaskAcceptance(tasks, scripts, args.taskAcceptance)'))
    assert.ok(adapter.includes('native Todo changed during verification'))
    assert.ok(adapter.includes('resolveAuthorizedGitCwd(ctx, root, args.cwd, exec)'))
    assert.ok(registry.includes("from './delivery-gate.js'"))
  })
})

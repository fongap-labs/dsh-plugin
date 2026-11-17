import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = path => readFileSync(fileURLToPath(new URL('../' + path, import.meta.url)), 'utf8')
const base = 'packages/dsh-delta-desktop/src/'

test('Suite composition, kernel and adapter are separate modules', () => {
  const entry = read(base + 'index.ts')
  const composition = read(base + 'delta-suite-composition.ts')
  const kernel = read(base + 'delta-suite-kernel/feature-lifecycle-registry.ts')
  const adapter = read(base + 'delta-suite-adapter/host-capability-contract.ts')
  assert.match(entry, /export \{ apply \} from '\.\/delta-suite-composition\.js'/)
  assert.match(composition, /new DeltaFeatureRegistry<PrivacyHostContext>/)
  assert.match(composition, /registry\.mount\(ctx, new Set<string>\(\)\)/)
  assert.match(kernel, /class DeltaFeatureRegistry/)
  assert.match(kernel, /for \(let index = this\.cleanups\.length - 1; index >= 0; index--\)/)
  assert.doesNotMatch(kernel, /@deepseek-ai\//)
  assert.match(adapter, /function negotiateHostCapabilities/)
  assert.doesNotMatch(adapter, /window\.|document\.|_core|_host|\.prototype\./)
})

test('Legacy import paths remain re-exports, never duplicate implementations', () => {
  assert.match(read(base + 'feature-registry.ts'), /export \* from '\.\/delta-suite-kernel\/feature-lifecycle-registry\.js'/)
  assert.match(read(base + 'host-capabilities.ts'), /export \* from '\.\/delta-suite-adapter\/host-capability-contract\.js'/)
  const entry = read(base + 'index.ts')
  assert.match(entry, /export const name = '@fongap-labs\/dsh-delta-desktop'/)
  assert.match(entry, /export const inject: string\[\] = \[\]/)
})

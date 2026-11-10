import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { routeCodingTask as coreRoute } from '../packages/dsh-delta-code/lib/core/coding-intent.js'
import { routeCodingTask as dshRoute } from '../packages/dsh-delta-code/lib/auto-routing.js'
import { decideCodingWorkflow as coreWorkflow } from '../packages/dsh-delta-code/lib/core/workflow-policy.js'
import { decideCodingWorkflow as dshWorkflow } from '../packages/dsh-delta-code/lib/workflow-route.js'

test('coding route decisions are shared by the DSH adapter without behavior changes', () => {
  assert.strictEqual(dshRoute, coreRoute)
  const examples = [
    ['修复 GitHub CI 失败', undefined, 'code-ci-repair'],
    ['修复 TypeScript bug', undefined, 'code-root-cause-debugging'],
    ['请优化代码', undefined, 'code-feature-delivery'],
    ['继续', 'code-feature-delivery', 'code-feature-delivery'],
    ['不要使用 code worker', 'code-feature-delivery', undefined],
  ]
  for (const [input, previous, expected] of examples) {
    assert.equal(dshRoute(input, previous), expected, input)
  }
})

test('workflow policy is shared by the DSH tool without behavior changes', () => {
  assert.strictEqual(dshWorkflow, coreWorkflow)
  for (const input of [
    { taskKind: 'feature', scope: 'small', risk: 'low' },
    { taskKind: 'bugfix', scope: 'medium', risk: 'high' },
    { taskKind: 'feature', scope: 'large', risk: 'high', nativeSubagents: true, independentTasks: 3 },
    { taskKind: 'ci', scope: 'small', risk: 'high' },
  ]) {
    assert.deepEqual(dshWorkflow(input), coreWorkflow(input))
  }
})

test('core decision modules have no DSH or host-runtime dependencies', async () => {
  for (const name of ['coding-intent.ts', 'workflow-policy.ts']) {
    const source = await readFile(new URL('../packages/dsh-delta-code/src/core/' + name, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /@deepseek-ai\/|@fongap-labs\/shared|\.\.\/runtime|ctx\.get\(/, name)
  }
})

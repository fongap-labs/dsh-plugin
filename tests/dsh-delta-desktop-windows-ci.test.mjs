import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
test('Action Worker must run both Linux and Windows CI for Delta Desktop', () => {
  const manifest = JSON.parse(readFileSync(join(root, '.github/execution-manifest.json'), 'utf8'))
  const jobs = manifest.operations.ci.jobs
  assert.deepEqual(jobs.map(job => job.runner_profile).sort(), ['linux-standard', 'windows-build'])
  const windows = jobs.find(job => job.runner_profile === 'windows-build')
  assert.deepEqual(windows.command, [
    'node', '{target_root}/scripts/central-ci-windows.mjs', '{target_root}',
  ])
  assert.deepEqual(windows.capability_requests, ['source.read'])
  assert.ok(windows.timeout_minutes <= 45)
})
test('Windows CI uses pinned installation and runs full cross-platform tests', () => {
  const windows = readFileSync(join(root, 'scripts/central-ci-windows.mjs'), 'utf8')
  assert.match(windows, /packageManager/)
  assert.match(windows, /--frozen-lockfile/)
  assert.match(windows, /tsconfig\.client\.json/)
  assert.match(windows, /finalize-client\.mjs/)
  assert.match(windows, /--test/)
  assert.match(windows, /pack-bundles\.mjs/)
  assert.doesNotMatch(windows, /AW_CONTROL_TOKEN|AW_ADMIN_TOKEN|GITHUB_TOKEN/)
})

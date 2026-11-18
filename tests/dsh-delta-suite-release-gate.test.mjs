import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
test('Delta Desktop release is operator controlled; incomplete features are diagnostic only', () => {
  const readiness = JSON.parse(readFileSync(join(root, 'projects/dsh-delta-desktop/feature-readiness.json'), 'utf8'))
  assert.equal(readiness.schema_version, 1)
  assert.ok(Object.keys(readiness.required).length >= 8)
  assert.ok(Object.values(readiness.required).every(value => typeof value === 'boolean'))

  const wrapper = readFileSync(join(root, 'packages/dsh-delta-desktop/build-release.mjs'), 'utf8')
  assert.doesNotMatch(wrapper, /process\.exit\(65\)|release blocked|readiness\.required|feature-readiness\.json/,
    'the release entry must not veto an operator because of feature readiness')
  assert.match(wrapper, /scripts\/build-release\.mjs/, 'release still delegates to the packaging pipeline')

  // Invalid arguments must fail in ordinary packaging validation, not the
  // previous feature-readiness veto; no archive is built by this probe.
  const runner = spawnSync(process.execPath, [join(root, 'packages/dsh-delta-desktop/build-release.mjs')], {
    cwd: root, encoding: 'utf8',
  })
  assert.equal(runner.status, 1)
  assert.notEqual(runner.status, 65)
  assert.doesNotMatch(runner.stderr, /Delta Desktop release blocked/)
  assert.match(runner.stderr, /Invalid release arguments|Expected --package/)
})

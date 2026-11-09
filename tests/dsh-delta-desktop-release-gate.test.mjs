import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
test('Delta Desktop cannot publish while required UI features are incomplete', () => {
  const readiness = JSON.parse(readFileSync(join(root, 'projects/dsh-delta-desktop/feature-readiness.json'), 'utf8'))
  assert.equal(readiness.schema_version, 1)
  assert.ok(Object.keys(readiness.required).length >= 8)
  assert.ok(Object.values(readiness.required).every(value => typeof value === 'boolean'))
  const runner = spawnSync(process.execPath, [join(root, 'packages/dsh-delta-desktop/build-release.mjs')], {
    cwd: root, encoding: 'utf8',
  })
  const ready = Object.values(readiness.required).every(Boolean)
  if (ready) {
    assert.doesNotMatch(runner.stderr, /Delta Desktop release blocked/)
  } else {
    assert.equal(runner.status, 65)
    assert.match(runner.stderr, /Delta Desktop release blocked: incomplete required capabilities/)
  }
})

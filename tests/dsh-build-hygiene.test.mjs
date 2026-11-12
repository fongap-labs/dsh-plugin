import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

describe('Generated compiler output must be reproducible', () => {
  it('does not track any packages/*/lib files', () => {
    const files = execFileSync('git', [
      'ls-files', '--', ':(glob)packages/*/lib/**',
    ], { cwd: root, encoding: 'utf8' }).trim()
    assert.equal(files, '', 'generated files must not be committed to Git')
  })

  it('regenerates lib only after the tracked-file guard and clean step', () => {
    const ci = readFileSync(resolve(root, '.github/scripts/central-ci.sh'), 'utf8')
    const guard = ci.indexOf("git ls-files -- ':(glob)packages/*/lib/**'")
    const clean = ci.indexOf('rm -rf -- "$output_dir"')
    const compile = ci.indexOf('phase_begin typecheck')
    assert.ok(guard >= 0, 'CI must reject tracked lib output')
    assert.ok(clean > guard, 'CI must clear stale lib only after the guard')
    assert.ok(compile > clean, 'CI must clear stale lib before the first compiler')
  })

  it('does not compile retired plugin templates in any supported build route', () => {
    const paths = ['package.json', '.github/scripts/central-ci.sh',
      'scripts/central-ci-windows.mjs']
    for (const path of paths) {
      const source = readFileSync(resolve(root, path), 'utf8')
      assert.doesNotMatch(source, /packages\/plugin-template\//, path)
    }
    const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8')
    assert.doesNotMatch(lockfile, /^\\s+packages\/plugin-template:/m)
  })

  it('retains the ignore rule for future generated output', () => {
    const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8')
    assert.match(ignore, /^packages\/\*\/lib\/$/m)
  })
})

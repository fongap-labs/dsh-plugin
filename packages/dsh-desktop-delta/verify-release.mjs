#!/usr/bin/env node
// Product-owned, Linux portable release acceptance. Checks the actual built ZIP and npm tarball.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { resolve, join } from 'node:path'

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false })
  if (result.error || result.status !== 0) {
    throw new Error(command + ' failed: ' + (result.error?.message ?? result.stderr))
  }
  return result.stdout
}

function args(values) {
  const map = new Map()
  for (let i = 0; i < values.length; i += 2) {
    if (!['--target', '--version', '--output-dir'].includes(values[i]) || !values[i + 1] || map.has(values[i])) {
      throw new Error('Invalid release acceptance arguments')
    }
    map.set(values[i], values[i + 1])
  }
  if (map.size !== 3 || map.get('--target') !== 'portable' ||
    !/^\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/.test(map.get('--version'))) {
    throw new Error('Delta Desktop accepts only a versioned portable build')
  }
  return { version: map.get('--version'), output: resolve(map.get('--output-dir')) }
}

const { version, output } = args(process.argv.slice(2))
const zip = join(output, 'fongap-labs-dsh-desktop-delta.zip')
const tgz = join(output, 'fongap-labs-dsh-desktop-delta.tgz')
for (const file of [zip, tgz]) assert.ok(statSync(file).size > 100, 'Empty build asset: ' + file)

// Verify compressed contents (not merely that the two files exist).
run('unzip', ['-tqq', zip])
const zipFiles = run('unzip', ['-Z1', zip]).split('\n').filter(Boolean)
assert.ok(zipFiles.some(name => name.endsWith('.js')), 'ZIP missing compiled JavaScript')
const tarFiles = run('tar', ['-tzf', tgz]).split('\n').filter(Boolean)
assert.ok(tarFiles.includes('package/package.json'), 'TGZ missing package metadata')
assert.ok(tarFiles.includes('package/lib/index.js'), 'TGZ missing plugin entry')
const metadata = JSON.parse(run('tar', ['-xOzf', tgz, 'package/package.json']))
assert.equal(metadata.name, '@fongap-labs/dsh-desktop-delta')
assert.equal(metadata.version, version)
assert.equal(metadata.dsh?.manifestVersion, 1)
assert.equal(metadata.dsh?.client?.platform, 'web')
console.log('Delta Desktop portable artifact acceptance passed: ' + version)

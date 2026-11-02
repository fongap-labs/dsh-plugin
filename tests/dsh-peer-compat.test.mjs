import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareVersions, isVersionCompatible, parseBoundedPeerRange } from '../scripts/dsh-peer-compat.mjs'

const root = join(import.meta.dirname, '..')
const manifest = (name) => JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'))
const toolsPeer = (name) => manifest(name).peerDependencies['@deepseek-ai/dsh-tools']

describe('DSH tools plugin compatibility', () => {
  it('supports existing RC.3 and current RC.5 without a per-RC special case', () => {
    for (const name of ['dsh-code-worker', 'plugin-template']) {
      const peer = toolsPeer(name)
      assert.equal(isVersionCompatible(peer, '0.2.1-rc.3'), true)
      assert.equal(isVersionCompatible(peer, '0.2.1-rc.5'), true)
      assert.equal(isVersionCompatible(peer, '0.2.1-rc.999'), true)
      assert.equal(isVersionCompatible(peer, '0.2.1'), true)
    }
  })

  it('rejects older and future unverified host release lines', () => {
    for (const name of ['dsh-code-worker', 'plugin-template']) {
      const peer = toolsPeer(name)
      for (const version of ['0.2.1-rc.2', '0.2.0', '0.2.2-rc.1', '0.2.2', '0.3.0', '1.0.0']) {
        assert.equal(isVersionCompatible(peer, version), false, `${name} unexpectedly accepts ${version}`)
      }
    }
  })

  it('rejects exact pins, wildcards, and unbounded prerelease compatibility', () => {
    for (const invalid of [
      '0.2.1-rc.3', '*', '^0.2.1-rc.3', '>=0.2.1-rc.3',
      '>=0.2.1-rc.3 <0.3.0-0', '>=0.2.1-rc.3 <1.0.0',
      '>=0.2.1-rc.3 <0.2.2', '>=0.2.2-rc.1 <0.2.1-0',
    ]) {
      assert.throws(() => parseBoundedPeerRange(invalid), undefined, `must reject ${invalid}`)
    }
  })

  it('orders prerelease identifiers by semver rules', () => {
    assert.ok(compareVersions('0.2.1-rc.3', '0.2.1-rc.5') < 0)
    assert.ok(compareVersions('0.2.1-rc.10', '0.2.1-rc.9') > 0)
    assert.ok(compareVersions('0.2.1-rc.5', '0.2.1') < 0)
    assert.ok(compareVersions('0.2.1-rc.5.1', '0.2.1-rc.5') > 0)
    assert.ok(compareVersions('0.2.1-0', '0.2.1-rc.5') < 0)
  })

  it('keeps build-toolchain pin separate from the published compatibility range', () => {
    const build = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const pinnedBuildTool = build.devDependencies['@deepseek-ai/dsh-tools']
    assert.match(pinnedBuildTool, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/)
    assert.equal(isVersionCompatible(toolsPeer('dsh-code-worker'), pinnedBuildTool), true)
  })
})

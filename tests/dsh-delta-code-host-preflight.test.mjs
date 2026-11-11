import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preflight, parseArgs } from '../scripts/code-worker-host-preflight.mjs'

async function withFakeHost(callback) {
  const scratch = await mkdtemp(join(tmpdir(), 'dsh-fake-host-cli-'))
  const dir = join(scratch, 'bundle')
  const bin = join(scratch, 'dsh-mock.mjs')
  await mkdir(join(dir, 'lib'), { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: '@fongap-labs/dsh-delta-code' }))
  await writeFile(join(dir, 'lib/index.js'), 'export function apply() {}')
  await writeFile(bin, `#!/usr/bin/env node
const args = process.argv.slice(2)
if (args[0] === '--version') { console.log('0.2.2-rc.1'); process.exit(0) }
if (args.includes('--dump-default-config')) { console.log('configured: true'); process.exit(0) }
if (args[0] === 'plugin') { console.log('linked'); process.exit(0) }
if (args.includes('--dump-config')) {
  if (process.env.DSH_MOCK_OMIT_PLUGIN === 'true') console.log('configured: true')
  else console.log('id: dsh-delta-code; secret=DO_NOT_ECHO_MOCK')
  process.exit(0)
}
process.stderr.write('DO_NOT_ECHO_MOCK\\n')
setInterval(() => {}, 1000)
`)
  await chmod(bin, 0o755)
  try { return await callback({ dir, bin }) } finally { await rm(scratch, { recursive: true, force: true }) }
}

describe('Code Worker actual-CLI host preflight contract (fake CLI only)', () => {
  it('accepts a booted isolated profile without marking H01-H10 complete', async () => {
    await withFakeHost(async ({ dir, bin }) => {
      const report = await preflight({ dsh: bin, pluginDir: dir, bootMs: 350 })
      assert.equal(report.status, 'preflight-pass')
      assert.equal(report.profile, 'sdk')
      assert.equal(report.nativeProfileProcessObserved, true)
      assert.equal(report.h01Complete, false)
      assert.equal(report.h02ToH10Complete, false)
      assert.deepEqual(report.stages, [
        'plugin-build-present', 'dsh-version', 'isolated-profile-initialized',
        'plugin-linked-in-isolated-profile', 'effective-profile-includes-plugin',
        'native-sdk-process-alive',
      ])
      assert.doesNotMatch(JSON.stringify(report), /DO_NOT_ECHO_MOCK/)
    })
  })

  it('rejects a Host that exits before the observation window', async () => {
    await withFakeHost(async ({ dir, bin }) => {
      const source = await readFile(bin, 'utf8')
      await writeFile(bin, source.replace('setInterval(() => {}, 1000)', 'process.exit(0)'))
      const report = await preflight({ dsh: bin, pluginDir: dir, bootMs: 350 })
      assert.equal(report.status, 'blocked')
      assert.equal(report.nativeProfileProcessObserved, false)
      assert.match(report.reason, /boot-native-host: Host exited before boot observation window/)
      assert.equal(report.stages.includes('native-sdk-process-alive'), false)
    })
  })

  it('fails closed when effective Host configuration omits the plugin', async () => {
    await withFakeHost(async ({ dir, bin }) => {
      const source = await readFile(bin, 'utf8')
      await writeFile(bin, source.replace("if (process.env.DSH_MOCK_OMIT_PLUGIN === 'true')", 'if (true)'))
      const report = await preflight({ dsh: bin, pluginDir: dir, bootMs: 350 })
      assert.equal(report.status, 'blocked')
      assert.equal(report.nativeProfileProcessObserved, false)
      assert.match(report.reason, /inspect-composition: plugin absent/)
      assert.equal(report.stages.includes('native-sdk-process-alive'), false)
    })
  })

  it('blocks an invalid plugin build before attempting Host commands', async () => {
    await withFakeHost(async ({ dir, bin }) => {
      const report = await preflight({ dsh: bin, pluginDir: join(dir, 'missing'), bootMs: 350 })
      assert.equal(report.status, 'blocked')
      assert.equal(report.nativeProfileProcessObserved, false)
      assert.match(report.reason, /validate-plugin:/)
    })
  })

  it('blocks a missing executable with a bounded, sanitized error', async () => {
    await withFakeHost(async ({ dir }) => {
      const report = await preflight({ dsh: join(dir, 'missing-bin'), pluginDir: dir, bootMs: 350 })
      assert.equal(report.status, 'blocked')
      assert.equal(report.nativeProfileProcessObserved, false)
      assert.match(report.reason, /version: CLI execution failed: ENOENT/)
      assert.doesNotMatch(JSON.stringify(report), /DO_NOT_ECHO_MOCK/)
    })
  })

  it('supports an explicitly selected minimal profile without claiming full Host services', async () => {
    await withFakeHost(async ({ dir, bin }) => {
      const report = await preflight({ dsh: bin, pluginDir: dir, profile: 'sdk-minimal', bootMs: 350 })
      assert.equal(report.status, 'preflight-pass')
      assert.equal(report.profile, 'sdk-minimal')
      assert.ok(report.stages.includes('native-sdk-minimal-process-alive'))
      assert.equal(report.h01Complete, false)
      assert.equal(report.h02ToH10Complete, false)
    })
  })

  it('rejects unknown flags and unreasonable observation periods', () => {
    assert.throws(() => parseArgs(['--unexpected', 'x']), /expected --dsh/)
    assert.throws(() => parseArgs(['--boot-ms', '5']), /between 250 and 30000/)
    assert.equal(parseArgs(['--boot-ms', '500']).bootMs, 500)
    assert.equal(parseArgs([]).profile, 'sdk')
    assert.equal(parseArgs(['--profile', 'sdk-minimal']).profile, 'sdk-minimal')
    assert.throws(() => parseArgs(['--profile', 'desktop']), /--profile must be sdk or sdk-minimal/)
  })
})

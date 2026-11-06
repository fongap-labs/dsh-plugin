import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('../scripts/run-delta-poc-isolated.mjs', import.meta.url))
const source = readFileSync(script, 'utf8')
function call(args) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', timeout: 8000,
    env: { ...process.env, DSH_HOME: 'SENTINEL_NEVER_TOUCH_THIS_PATH' },
  })
}

test('isolated P0 launcher has a read-only no-side-effect preview', () => {
  for (const args of [['--help'], ['--dry-run'], ['--port', '3085', '--dry-run']]) {
    const result = call(args)
    assert.equal(result.status, 0)
    assert.match(result.stdout, /temporary DSH_HOME/)
    assert.match(result.stdout, /no files, downloads, or Host processes|Usage:/)
    assert.doesNotMatch(result.stderr, /Isolated Host could not start/)
  }
})

test('isolated P0 launcher rejects unexpected flags and invalid ports before mutation', () => {
  for (const args of [
    ['--profile', 'desktop'], ['--home', 'C:\\Users\\me\\.dsh'],
    ['--port'], ['--port', '0'], ['--port', '1024'],
    ['--port', '65536'], ['--port', 'invalid'], ['--port', '3080;rm'],
    ['--port', '3080.5'], ['--port', '3080', '--port', '3081'],
  ]) {
    const result = call(args)
    assert.equal(result.status, 2, JSON.stringify(args))
    assert.doesNotMatch(result.stdout + result.stderr, /Preparing a disposable Delta Suite P0 Host/)
  }
})

test('isolated P0 launcher stays pinned to verified release and cannot access normal profiles', () => {
  assert.match(source, /dsh-suite-delta-v0\.1\.0-beta\.1\/fongap-labs-dsh-suite-delta\.tgz/)
  assert.match(source, /--from-default-profile', 'web'/)
  assert.match(source, /'--profile', PROFILE, 'add', RELEASE_URL/)
  assert.match(source, /DSH_HOME: home/)
  assert.match(source, /mkdtempSync\(join\(tmpdir\(\)/)
  assert.match(source, /standalonePoc: true/)
  assert.match(source, /--port', String\(options\.port\)/)
  assert.match(source, /rmSync\(home, \{ recursive: true, force: true \}\)/)
  assert.match(source, /taskkill/)
  assert.doesNotMatch(source, /--allow-agent|--send-text|approval\/request/)
})

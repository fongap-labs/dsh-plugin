import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../scripts/verify-delta-poc-host.mjs', import.meta.url))
const source = readFileSync(path, 'utf8')
const script = args => spawnSync(process.execPath, [path, ...args], {
  encoding: 'utf8', timeout: 6000, env: { ...process.env },
})

test('real-host acceptance documents explicit local-only authenticated browser prerequisites', () => {
  const result = script(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /--cdp/)
  assert.match(result.stdout, /already running local Harness/)
  assert.match(result.stdout, /playwright-core/)
  assert.match(result.stdout, /--create-session/)
  assert.match(result.stdout, /--allow-agent/)
  assert.match(result.stdout, /signed Cookie/)
})

test('real-host acceptance refuses remote hosts or credentials before browser tooling is loaded', () => {
  for (const url of [
    'https://github.com',
    'https://example.com',
    'http://192.168.1.15:3080',
    'http://localhost:3080/?token=private',
    'http://127.0.0.1:3080/other',
    'file:///tmp/probe.html',
    'http://user:pass@localhost:3080',
  ]) {
    const result = script(['--url', url, '--cdp', 'http://127.0.0.1:9222'])
    assert.equal(result.status, 2, 'remote or credentialed target must fail')
    assert.doesNotMatch(result.stdout + result.stderr, /playwright-core is required/)
  }
  for (const cdp of ['http://example.org', 'http://localhost:9222?token=secret']) {
    const result = script(['--url', 'http://127.0.0.1:3080', '--cdp', cdp])
    assert.equal(result.status, 2, 'remote or credentialed CDP must fail')
  }
})

test('real-host acceptance never automatically sends an Agent prompt', () => {
  const base = ['--url', 'http://127.0.0.1:3080', '--cdp', 'http://127.0.0.1:9222']
  assert.equal(script([...base, '--send-text', 'test']).status, 2)
  assert.equal(script([...base, '--send-text', 'test', '--allow-agent']).status, 2)
  assert.equal(script([...base, '--send-text', 'test', '--create-session']).status, 2)
  assert.equal(script([...base, '--create-session', '--session', 'a']).status, 2)
  assert.equal(script([...base, '--create-session', '--create-session']).status, 2)
  assert.match(source, /--send-text requires both --allow-agent and --create-session/)
  assert.match(source, /await page\.locator\('#create'\)\.click\(\)/)
  assert.match(source, /await page\.locator\('#send'\)\.click\(\)/)
  assert.match(source, /record\('tool-approval', 'SKIP'\)/)
})

test('real-host runner demands a real, current-Session snapshot after reload', () => {
  assert.match(source, /locator\('#snapshot'\)\.getAttribute\('data-state'\)/)
  assert.match(source, /session-follow-snapshot/)
  assert.match(source, /reload-reconnect-snapshot/)
  assert.match(source, /context = browser\.contexts\(\)\[0\]/)
  assert.doesNotMatch(source, /context\.request\.(?:post|patch|put|delete)\(/)
  assert.doesNotMatch(source, /console\.log\(.*(?:args\['--send-text'\]|cookie|token)/i)
  assert.match(source, /flag: 'wx'/)
  assert.match(source, /chmodSync\(file, 0o600\)/)
})

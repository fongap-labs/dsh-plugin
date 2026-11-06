import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const entry = readFileSync(new URL('../packages/dsh-desktop-delta/src/client-entry.ts', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../packages/dsh-desktop-delta/package.json', import.meta.url), 'utf8'))

test('Delta-first entry is eagerly discovered without native slot overrides', () => {
  assert.equal(manifest.dsh.client.immediately, true)
  assert.deepEqual(manifest.dsh.client.inject, [])
  assert.match(entry, /id: '@fongap-labs\/dsh-desktop-delta'/)
  assert.doesNotMatch(entry, /slots\.(inject|register)/)
})

test('native chat stays hidden pending authenticated Delta verification', () => {
  assert.match(entry, /root\.style\.visibility = 'hidden'/)
  assert.match(entry, /const fallback = \(\) =>/)
  assert.match(entry, /root\.style\.visibility = previousVisibility/)
  assert.match(entry, /credentials: 'same-origin'/)
  assert.match(entry, /status\.status !== 200/)
  assert.match(entry, /authenticated.*=== true/)
  assert.match(entry, /method: 'HEAD'/)
  assert.match(entry, /page\.status === 200/)
  assert.match(entry, /location\.replace\(new URL\(DESKTOP_PATH, url\.href\)\.href\)/)
})

test('official launch and unrelated surfaces are never intercepted', () => {
  assert.match(entry, /url\.searchParams\.has\('token'\)/)
  assert.match(entry, /isOfficialLaunch/)
  assert.match(entry, /referrerPolicy: 'no-referrer'/)
  assert.match(entry, /url\.pathname !== '\/'/)
  assert.match(entry, /window\.self !== window\.top/)
  assert.match(entry, /controller\.abort\(\)/)
})

test('Electron dsh-app desktop origin is an authorized bootstrap source', () => {
  assert.match(entry, /url\.protocol === 'dsh-app:' && url\.hostname === 'app'/)
  assert.match(entry, /new URL\(DESKTOP_PATH, url\.href\)/)
  assert.equal(new URL('/dsh-ui-delta/app', 'dsh-app://app/').href,
    'dsh-app://app/dsh-ui-delta/app')
  assert.equal(new URL('dsh-app://app/').origin, 'null',
    'custom protocol must not be passed as URL.origin to the redirect')
})

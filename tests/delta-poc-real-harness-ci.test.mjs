import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync,
  rmSync, existsSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'

const REPO = resolve(import.meta.dirname, '..')
const HARNESS_VERSION = '0.2.1-rc.5'
const WS_VERSION = '8.18.3'
const NAME = '@fongap-labs/dsh-suite-delta'
const PROFILE = 'delta-poc-ci'
const IS_CI = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true'

const limit = (promise, ms, name) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(name + '-timeout')), ms)),
])
const safe = (message) => String(message || '')
  .replace(/([?&]token=)[^&\s]+/g, '$1[REDACTED]')
  .replace(/[A-Za-z0-9_-]{80,}/g, '[REDACTED]')
  .slice(-400)

const testCase = IS_CI ? test : test.skip

testCase('real installed Harness: Delta standalone page authenticates and streams a Session over Gateway', {
  timeout: 190_000,
}, async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'delta-real-host-ci-'))
  const runtime = join(home, 'runtime')
  const dshHome = join(home, 'home')
  const workspace = join(home, 'workspace')
  mkdirSync(workspace, { recursive: true })
  const profileDir = join(dshHome, 'profiles', PROFILE)
  let child
  let ws
  let childOutput = ''
  let childExit
  const marks = []

  const closeChild = async () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    child.kill('SIGTERM')
    try { await limit(childExit, 5000, 'harness-stop') } catch {
      child.kill('SIGKILL')
      await limit(childExit, 5000, 'harness-kill').catch(() => {})
    }
  }

  try {
    // No user or GitHub secrets are used: the child receives only safe
    // process metadata and a disposable DSH_HOME. The npm package is pinned.
    const npm = spawnSync('npm', [
      'install', '--prefix', runtime, '--no-audit', '--no-fund',
      '--ignore-scripts', '--loglevel=error',
      '@deepseek-ai/dsh@' + HARNESS_VERSION, 'ws@' + WS_VERSION,
    ], { encoding: 'utf8', timeout: 110_000, maxBuffer: 1024 * 1024 })
    assert.equal(npm.status, 0, 'Harness installation failed: ' + safe(npm.stderr))
    const cli = join(runtime, 'node_modules', '.bin', 'dsh')
    assert.ok(existsSync(cli), 'Harness launcher missing after pinned npm install')
    marks.push('installed-real-harness')

    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DSH_HOME: dshHome,
      NO_COLOR: '1',
      CI: 'true',
    }

    const initialized = spawnSync(cli, [
      '--profile', PROFILE, '--from-default-profile', 'web', '--dump-config',
    ], { encoding: 'utf8', env, timeout: 25_000, maxBuffer: 1024 * 1024 })
    assert.equal(initialized.status, 0, 'Could not create real Harness web profile: ' + safe(initialized.stderr))
    const manifestPath = join(profileDir, 'package.json')
    assert.ok(existsSync(manifestPath), 'Official Web template did not initialize a profile')

    const pluginDir = join(REPO, 'packages', 'dsh-suite-delta')
    assert.ok(existsSync(join(pluginDir, 'lib', 'index.js')), 'Compiled Delta host is missing')
    const scope = join(profileDir, 'node_modules', '@fongap-labs')
    mkdirSync(scope, { recursive: true })
    symlinkSync(pluginDir, join(scope, 'dsh-suite-delta'), 'dir')

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.ok(Array.isArray(manifest.dsh?.profile?.bundles), 'Official profile manifest shape changed')
    if (!manifest.dsh.profile.bundles.includes(NAME)) manifest.dsh.profile.bundles.push(NAME)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    writeFileSync(join(profileDir, 'cordis.patch.yml'),
      '- id: dsh-suite-delta\n  config:\n    standalonePoc: true\n')
    marks.push('installed-source-plugin-in-isolated-profile')

    // Pick an OS-assigned loopback port: fixed ports collide on shared runners.
    const { createServer } = await import('node:net')
    const port = await new Promise((done, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        server.close(() => done(address.port))
      })
    })
    const origin = 'http://127.0.0.1:' + String(port)

    child = spawn(cli, ['--profile', PROFILE, '--no-open', '--port', String(port)], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    childExit = new Promise((done) => child.once('exit', (code, signal) => done({ code, signal })))
    child.on('error', () => {})
    child.stdout.on('data', (chunk) => { childOutput = (childOutput + String(chunk)).slice(-32768) })
    child.stderr.on('data', (chunk) => { childOutput = (childOutput + String(chunk)).slice(-32768) })

    const launchUrl = await limit(new Promise((done, reject) => {
      const interval = setInterval(() => {
        const match = childOutput.match(/dsh web:\s*(https?:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/)
        if (match) {
          clearInterval(interval)
          done(match[1])
        }
      }, 100)
      childExit.then(({ code, signal }) => {
        clearInterval(interval)
        reject(new Error('Harness exited before ready: ' + safe(childOutput) + ' (' + code + '/' + signal + ')'))
      })
    }), 30_000, 'harness-boot')
    assert.equal(new URL(launchUrl).origin, origin)
    marks.push('real-host-boot')

    const withoutCookie = await fetch(origin + '/dsh-ui-delta/poc', { redirect: 'manual' })
    assert.equal(withoutCookie.status, 401, 'Unauthenticated P0 page must be denied')
    const login = await fetch(launchUrl, { redirect: 'manual' })
    assert.equal(login.status, 303, 'Official launch-token exchange failed')
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie && cookie.includes('='), 'Official signed browser cookie missing')
    const headers = { Cookie: cookie, Origin: origin }

    const page = await fetch(origin + '/dsh-ui-delta/poc', { headers })
    assert.equal(page.status, 200, 'Authenticated standalone page not served')
    const html = await page.text()
    assert.ok(html.includes('id="snapshot"'), 'Expected standalone page not mounted')
    assert.ok(html.includes('id="interaction"'), 'Standalone approval controls are missing')
    const status = await fetch(origin + '/dsh-ui-delta/poc/status', { headers })
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), { poc: 'P0-B', authenticated: true })
    marks.push('signed-cookie-and-independent-page')

    const rpc = async (method, request) => {
      const rpcId = randomUUID()
      const response = await fetch(origin + '/api/' + method, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request', rpcId, method, payload: { args: method === 'session/list' ? { _request: request } : { request } },
        }),
        signal: AbortSignal.timeout(15_000),
      })
      assert.equal(response.status, 200, 'HTTP RPC ' + method + ' failed: ' + response.status)
      const result = await response.json()
      assert.equal(result.type, 'server-response', 'RPC response envelope mismatch')
      assert.equal(result.rpcId, rpcId, 'RPC identifier mismatch')
      assert.equal(result.result?.ok, true,
        'RPC ' + method + ' failed with ' + safe(JSON.stringify(result.result?.error)))
      return result.result.value
    }
    const listing = await rpc('session/list', {})
    assert.ok(Array.isArray(listing.items), 'Real Session list did not return an items array')
    marks.push('real-session-list-rpc')

    const created = await rpc('session/create', { cwd: workspace })
    assert.ok(typeof created.sessionId === 'string' && created.sessionId.length > 0)
    const sessionId = created.sessionId
    marks.push('real-disposable-session-created')

    // Use an actual WebSocket carrier and the official Remote mux wire.
    const WS = createRequire(join(runtime, 'package.json'))('ws')
    assert.ok(typeof WS === 'function')
    const packets = []
    ws = new WS(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
      headers: { ...headers },
      handshakeTimeout: 10_000,
    })
    await limit(new Promise((done, reject) => {
      ws.once('open', done)
      ws.once('error', reject)
    }), 12_000, 'real-websocket')
    ws.on('message', (raw) => {
      try { packets.push(JSON.parse(String(raw))) } catch {}
    })
    const waitPacket = async (matches, description) => limit(new Promise((done) => {
      const handle = setInterval(() => {
        const found = packets.find(matches)
        if (found) {
          clearInterval(handle)
          done(found)
        }
      }, 40)
    }), 12_000, description)

    const eventStreamId = randomUUID()
    ws.send(JSON.stringify({
      type: 'open', streamId: eventStreamId, endpoint: '$events',
      payload: { args: {} },
    }))
    const ready = await waitPacket(p => p.type === 'item' &&
      p.streamId === eventStreamId && p.value?.type === 'ready', 'events-ready')
    assert.ok(typeof ready.value.clientId === 'string')
    marks.push('real-gateway-event-stream-ready')

    const followStreamId = randomUUID()
    ws.send(JSON.stringify({
      type: 'open', streamId: followStreamId, endpoint: 'session/follow',
      payload: { args: {
        request: {
          address: { kind: 'session', sessionId },
          assistantStream: true,
          maxMessages: 50,
        },
      } },
    }))
    const snapshot = await waitPacket(p => p.type === 'item' &&
      p.streamId === followStreamId && p.value?.type === 'snapshot', 'session-snapshot')
    assert.equal(snapshot.value.header?.id, sessionId)
    assert.ok(Array.isArray(snapshot.value.records))
    marks.push('real-session-follow-snapshot')

    ws.close(1000)
    await limit(new Promise(done => ws.once('close', done)), 5000, 'socket-close')
    ws = new WS(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
      headers: { ...headers }, handshakeTimeout: 10_000,
    })
    await limit(new Promise((done, reject) => {
      ws.once('open', done)
      ws.once('error', reject)
    }), 12_000, 'resume-socket')
    const resumePackets = []
    ws.on('message', (raw) => {
      try { resumePackets.push(JSON.parse(String(raw))) } catch {}
    })
    const resumeStream = randomUUID()
    ws.send(JSON.stringify({
      type: 'open', streamId: resumeStream, endpoint: 'session/follow',
      payload: { args: { request: {
        address: { kind: 'session', sessionId },
        assistantStream: true, maxMessages: 50,
      } } },
    }))
    await limit(new Promise(done => {
      const interval = setInterval(() => {
        const received = resumePackets.find(p => p.type === 'item' &&
          p.streamId === resumeStream && p.value?.type === 'snapshot' &&
          p.value.header?.id === sessionId)
        if (received) { clearInterval(interval); done(received) }
      }, 40)
    }), 12_000, 'resume-snapshot')
    marks.push('real-reconnect-session-snapshot')

    // No model API keys are connected. Prompt/tool approval is not simulated
    // as a "real" result; existing unit tests cover decision safety only.
    assert.deepEqual(marks, [
      'installed-real-harness',
      'installed-source-plugin-in-isolated-profile',
      'real-host-boot',
      'signed-cookie-and-independent-page',
      'real-session-list-rpc',
      'real-disposable-session-created',
      'real-gateway-event-stream-ready',
      'real-session-follow-snapshot',
      'real-reconnect-session-snapshot',
    ])
    t.diagnostic('LIVE HOST PASS: ' + marks.join(', '))
    t.diagnostic('LIVE HOST NOT TESTED: model stream, tool approval, browser DOM, uninstall under load')
  } catch (error) {
    t.diagnostic('LIVE HOST completed stages: ' + marks.join(', '))
    throw error
  } finally {
    if (ws && ws.readyState === 1) ws.close(1000)
    if (ws && ws.readyState !== 3) ws.terminate()
    await closeChild()
    rmSync(home, { recursive: true, force: true })
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { registerIndependentApp } from '../packages/dsh-desktop-delta/lib/host/standalone-app.js'
import { standaloneDesktopBrowser } from '../packages/dsh-desktop-delta/lib/host/standalone-desktop-browser.js'

const entry = readFileSync(new URL('../packages/dsh-desktop-delta/src/client-entry.ts', import.meta.url), 'utf8')
const adapter = readFileSync(new URL('../packages/dsh-desktop-delta/src/host/harness-adapter.ts', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../packages/dsh-desktop-delta/package.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../packages/dsh-desktop-delta/cordis.patch.yml', import.meta.url), 'utf8')

test('Delta remains an installable Harness plugin with an isolated gateway adapter', () => {
  assert.equal(manifest.name, '@fongap-labs/dsh-desktop-delta')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.match(entry, /url.searchParams.get\('delta-native-fallback'\) === '1'/)
  assert.match(adapter, /\['connection', 'webServer'\]/)
  assert.doesNotMatch(entry, /slots\.(inject|register)/)
  assert.match(patch, /- id: session-log-deepseek\s+disabled: true/)
  assert.match(patch, /- id: product-analytics\s+config:\s+enabled: false/)
})

test('independent document remains authenticated and its host routes are disposable', () => {
  const routes = new Map()
  const disposers = []
  registerIndependentApp({
    inject(deps, callback) {
      assert.deepEqual(deps, ['connection', 'webServer'])
      callback({
        webServer: { register(route) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        } },
        connection: { admit(req) {
          return req.headers?.cookie === 'signed' ? { peer: {} } : { rejection: 401 }
        } },
        effect(register) { disposers.push(register()) },
      })
    },
  })
  const response = (path, method, cookie) => {
    let status, headers, body
    routes.get(path).handler({ method, headers: { cookie } }, {
      writeHead(s, h) { status = s; headers = h },
      end(content) { body = content },
    })
    return { status, headers, body }
  }
  assert.deepEqual([...routes.keys()].sort(), ['/dsh-ui-delta/app', '/dsh-ui-delta/app/status'].sort())
  assert.equal(response('/dsh-ui-delta/app', 'GET', '').status, 401)
  assert.equal(response('/dsh-ui-delta/app/status', 'GET', '').status, 401)
  const ok = response('/dsh-ui-delta/app', 'HEAD', 'signed')
  assert.equal(ok.status, 200)
  assert.match(ok.headers['content-type'], /text\/html/)
  assert.equal(response('/dsh-ui-delta/app/status', 'GET', 'signed').status, 200)
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(routes.size, 0)
})

function bootstrap(statusValid) {
  const ids = ['auth', 'socket', 'gateway', 'snapshot', 'sessions', 'messages',
    'interaction', 'message', 'send', 'create', 'refresh', 'current', 'diagnostic']
  const nodes = new Map(ids.map(id => [id, {
    dataset: {}, value: '', textContent: '', disabled: false,
    addEventListener() {}, replaceChildren() {},
  }]))
  let timeout
  let navigated = ''
  const location = new URL('http://127.0.0.1:3080/dsh-ui-delta/app')
  location.replace = undefined
  const locator = {
    href: location.href, protocol: location.protocol,
    replace(href) { navigated = href },
  }
  runInNewContext(standaloneDesktopBrowser, {
    document: { getElementById: id => nodes.get(id) },
    location: locator,
    URL,
    fetch: async () => ({
      ok: statusValid,
      json: async () => statusValid
        ? { authenticated: true, desktop: 'Delta Desktop' }
        : { authenticated: false },
    }),
    setTimeout(callback) { timeout = callback; return 1 },
    clearTimeout() {}, setInterval() { return 2 }, clearInterval() {},
    addEventListener() {},
    WebSocket: class {
      constructor() { this.readyState = 0 }
      addEventListener() {}
      close() {}
    },
  }, { timeout: 1000 })
  return { navigate: () => navigated, timer: () => timeout, nodes }
}

test('initial admission failure falls back to native with a loop guard', async () => {
  const app = bootstrap(false)
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.equal(app.navigate(), 'http://127.0.0.1:3080/?delta-native-fallback=1')
  assert.equal(app.nodes.get('send').disabled, true)
})

test('startup watchdog restores native if Gateway never becomes ready', async () => {
  const app = bootstrap(true)
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.equal(app.navigate(), '')
  app.timer()()
  assert.equal(app.navigate(), 'http://127.0.0.1:3080/?delta-native-fallback=1')
})

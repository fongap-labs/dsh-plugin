import assert from 'node:assert/strict'
import test from 'node:test'
import { Script } from 'node:vm'
import { standalonePocBrowser } from '../packages/dsh-desktop-delta/lib/host/standalone-poc-browser.js'
import { registerStandalonePoc, POC_PAGE_PATH, POC_STATUS_PATH } from '../packages/dsh-desktop-delta/lib/host/standalone-poc.js'

new Script(standalonePocBrowser, { filename: 'standalone-poc-browser.js' })

function setup({ available = true } = {}) {
  const routes = new Map()
  const effects = []
  const webServer = {
    register(route) {
      if (routes.has(route.path)) throw new Error('duplicate route')
      routes.set(route.path, route)
      return () => { routes.delete(route.path) }
    },
  }
  const connection = {
    admit(req) {
      if (req.headers?.host !== '127.0.0.1:3080') return { rejection: 403 }
      if (req.headers?.cookie !== 'test-authenticated') return { rejection: 401 }
      return { peer: { principal: 'owner' } }
    },
  }
  const ctx = {
    inject(names, run) {
      assert.deepEqual(names, ['connection', 'webServer'])
      if (available) run({
        webServer,
        connection,
        effect(register) {
          effects.push(register())
        },
      })
    },
  }
  registerStandalonePoc(ctx)
  function request(path, method = 'GET', headers = { host: '127.0.0.1:3080', cookie: 'test-authenticated' }) {
    let status, responseHeaders, body
    const req = { method, headers, url: path }
    const res = {
      writeHead(code, receivedHeaders) { status = code; responseHeaders = receivedHeaders },
      end(value) { body = value },
    }
    const route = routes.get(path)
    assert.ok(route, 'probe route must be registered')
    route.handler(req, res)
    return { status, responseHeaders, body }
  }
  return {
    routes, effects, request,
    dispose: () => { for (const dispose of effects.reverse()) dispose() },
  }
}

test('P0-A: no service means no probe routes', () => {
  const host = setup({ available: false })
  assert.equal(host.routes.size, 0)
})

test('P0-A: same-origin authenticated probe is read-only and independently served', () => {
  const host = setup()
  assert.deepEqual([...host.routes.keys()].sort(), [POC_PAGE_PATH, POC_STATUS_PATH].sort())
  const page = host.request(POC_PAGE_PATH)
  assert.equal(page.status, 200)
  assert.match(page.body, /P0 Gateway/)
  assert.match(page.body, /api\/remote\.mux/)
  assert.match(page.body, /Session RPC/)
  assert.ok(page.body.includes('approval/request'))
  assert.ok(page.body.includes('session/follow'))
  assert.ok(page.body.includes('session/prompt'))
  assert.doesNotMatch(page.body, /__DSH_BOOT__/)
  assert.match(page.responseHeaders['content-security-policy'], /frame-ancestors 'none'/)
  assert.match(page.responseHeaders['cache-control'], /no-store/)
  const status = host.request(POC_STATUS_PATH)
  assert.deepEqual(JSON.parse(status.body), { poc: 'P0-B', authenticated: true })
  const head = host.request(POC_PAGE_PATH, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined)
  host.dispose()
  assert.equal(host.routes.size, 0)
})

test('P0-A: denies unauthenticated and untrusted requests before HTML delivery', () => {
  const host = setup()
  const unauthenticated = host.request(POC_PAGE_PATH, 'GET', { host: '127.0.0.1:3080' })
  assert.equal(unauthenticated.status, 401)
  assert.equal(unauthenticated.body, 'unauthorized')
  const badAuthority = host.request(POC_PAGE_PATH, 'GET', { host: 'attacker.invalid', cookie: 'test-authenticated' })
  assert.equal(badAuthority.status, 403)
  assert.equal(badAuthority.body, 'forbidden')
  assert.equal(host.request(POC_STATUS_PATH, 'POST').status, 405)
  host.dispose()
})

test('P0-A: repeated unloads remove only own routes', () => {
  const host = setup()
  host.dispose()
  host.dispose()
  assert.equal(host.routes.size, 0)
})

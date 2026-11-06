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

test('successful Gateway and Session bootstrap does not activate native fallback after a later disconnect', async () => {
  const ids = ['auth', 'socket', 'gateway', 'snapshot', 'sessions', 'messages',
    'interaction', 'message', 'send', 'create', 'refresh', 'current', 'diagnostic']
  const nodes = new Map(ids.map(id => [id, {
    dataset: {}, value: '', textContent: '', childNodes: [],
    addEventListener() {}, replaceChildren(...items) { this.childNodes = items },
  }]))
  let socket
  let navigated = ''
  let clearedStartup = false
  const startupTimerId = 17
  let nextId = 0
  class Socket {
    static OPEN = 1
    constructor() { socket = this; this.readyState = 0; this.sent = []; this.listeners = new Map() }
    addEventListener(name, handler) { this.listeners.set(name, handler) }
    send(raw) { this.sent.push(JSON.parse(raw)) }
    close() { this.readyState = 3 }
    emit(name, value) { this.listeners.get(name)?.(value) }
  }
  runInNewContext(standaloneDesktopBrowser, {
    document: { getElementById: id => nodes.get(id) },
    location: {
      href: 'http://127.0.0.1:3080/dsh-ui-delta/app',
      protocol: 'http:', replace(value) { navigated = value },
    },
    URL,
    crypto: { randomUUID: () => 'test-id-' + ++nextId },
    fetch: async (path, options) => path === '/dsh-ui-delta/app/status'
      ? { ok: true, json: async () => ({ desktop: 'Delta Desktop', authenticated: true }) }
      : { ok: true, json: async () => {
        const request = JSON.parse(options.body)
        assert.equal(request.method, 'session/list')
        return { type: 'server-response', rpcId: request.rpcId, result: { ok: true, value: { items: [] } } }
      } },
    WebSocket: Socket,
    setTimeout(callback, delay) { return delay === 15000 ? startupTimerId : 19 },
    clearTimeout(id) { if (id === startupTimerId) clearedStartup = true },
    setInterval() { return 3 }, clearInterval() {},
    addEventListener() {},
  }, { timeout: 1000 })
  // Cross-context async jobs are not guaranteed to complete after a fixed
  // number of Promise.resolve() turns. Wait for observable startup state.
  const waitUntil = async (predicate, description) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (predicate()) return
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.fail(description)
  }
  await waitUntil(() => socket, 'authenticated startup must create Gateway WebSocket')
  socket.readyState = 1
  socket.emit('open')
  await waitUntil(() => nodes.get('gateway').dataset.state === 'pass',
    'session/list RPC must complete before the events ready frame')
  assert.equal(clearedStartup, false, 'Session RPC alone is insufficient')
  const events = socket.sent.find(item => item.endpoint === '$events')
  assert.ok(events)
  socket.emit('message', { data: JSON.stringify({
    type: 'item', streamId: events.streamId, value: { type: 'ready', clientId: 'host-client' },
  }) })
  assert.equal(clearedStartup, true, 'both Gateway and Session must be ready')
  socket.emit('close')
  assert.equal(navigated, '', 'a later disconnect should reconnect inside Delta')
})

test('Electron standalone Delta connects to desktop-owned Host rather than ws://app', async () => {
  const ids = ['auth', 'socket', 'gateway', 'snapshot', 'sessions', 'messages',
    'interaction', 'message', 'send', 'create', 'refresh', 'current', 'diagnostic']
  const nodes = new Map(ids.map(id => [id, {
    dataset: {}, value: '', textContent: '', disabled: false,
    addEventListener() {}, replaceChildren() {},
  }]))
  const urls = []
  let bootCalls = 0
  let navigated = ''
  runInNewContext(standaloneDesktopBrowser, {
    document: { getElementById: id => nodes.get(id) },
    location: {
      href: 'dsh-app://app/dsh-ui-delta/app', protocol: 'dsh-app:',
      replace(value) { navigated = value },
    },
    dshDesktopBoot: {
      async ready() {
        bootCalls++
        return { streamBaseUrl: 'http://127.0.0.1:43021' }
      },
    },
    URL, crypto: { randomUUID: () => 'electron-test' },
    fetch: async (path) => ({
      ok: path === '/dsh-ui-delta/app/status',
      json: async () => ({ authenticated: true, desktop: 'Delta Desktop' }),
    }),
    WebSocket: class {
      static OPEN = 1
      constructor(url) { urls.push(url); this.readyState = 0 }
      addEventListener() {}
      close() {}
    },
    setTimeout() { return 1 }, clearTimeout() {},
    setInterval() { return 1 }, clearInterval() {},
    addEventListener() {},
  }, { timeout: 1000 })
  for (let i = 0; i < 40 && !urls.length; i++)
    await new Promise(resolve => setImmediate(resolve))
  assert.equal(bootCalls, 1)
  assert.equal(urls[0], 'ws://127.0.0.1:43021/api/remote.mux')
  assert.equal(navigated, '')
})


test('Delta desktop sends a prompt and surfaces a terminal model error instead of a blank chat', async () => {
  const ids = ['auth', 'socket', 'gateway', 'snapshot', 'sessions', 'messages',
    'interaction', 'message', 'send', 'create', 'refresh', 'current', 'diagnostic',
    'welcome', 'conversation']
  const node = () => ({
    dataset: {}, value: '', textContent: '', childNodes: [], listeners: {},
    addEventListener(name, fn) { this.listeners[name] = fn },
    replaceChildren(...elements) {
      this.childNodes = elements.flatMap(element => element.isFragment ? element.childNodes : [element])
    },
    appendChild(element) { this.childNodes.push(element) },
  })
  const nodes = new Map(ids.map(id => [id, node()]))
  const sent = []
  let socket
  let requestId
  let counter = 0
  class Socket {
    static OPEN = 1
    constructor() { socket = this; this.readyState = 0; this.listeners = new Map() }
    addEventListener(name, fn) { this.listeners.set(name, fn) }
    send(raw) { sent.push(JSON.parse(raw)) }
    close() {}
    emit(name, value) { this.listeners.get(name)?.(value) }
  }
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (predicate()) return
      await new Promise(resolve => setImmediate(resolve))
    }
    assert.fail('condition not reached')
  }
  runInNewContext(standaloneDesktopBrowser, {
    document: {
      getElementById: id => nodes.get(id),
      createElement: () => node(),
      createDocumentFragment: () => ({ ...node(), isFragment: true }),
    },
    location: {
      href: 'http://127.0.0.1:3080/dsh-ui-delta/app?session=session-test',
      protocol: 'http:', replace() {},
    },
    URL, crypto: { randomUUID: () => 'request-' + ++counter },
    fetch: async (path, options) => {
      if (path === '/dsh-ui-delta/app/status') {
        return { ok: true, json: async () => ({ authenticated: true, desktop: 'Delta Desktop' }) }
      }
      const body = JSON.parse(options.body)
      if (body.method === 'session/list') {
        return { ok: true, json: async () => ({
          type: 'server-response', rpcId: body.rpcId,
          result: { ok: true, value: { items: [{ sessionId: 'session-test' }] } },
        }) }
      }
      assert.equal(body.method, 'session/prompt')
      requestId = body.payload.args.request.requestId
      assert.equal(body.payload.args.request.content[0].text, 'hello')
      return { ok: true, json: async () => ({
        type: 'server-response', rpcId: body.rpcId, result: { ok: true, value: { accepted: true } },
      }) }
    },
    WebSocket: Socket,
    setTimeout() { return 1 }, clearTimeout() {},
    setInterval() { return 1 }, clearInterval() {},
    addEventListener() {},
  }, { timeout: 1000 })
  await waitFor(() => socket)
  socket.readyState = 1
  socket.emit('open')
  await waitFor(() => typeof nodes.get('send').listeners.click === 'function')
  nodes.get('message').value = 'hello'
  nodes.get('send').listeners.click()
  await waitFor(() => nodes.get('message').value === '' && requestId)
  assert.match(nodes.get('messages').childNodes.map(x => x.textContent).join(' '), /hello/)
  assert.match(nodes.get('diagnostic').textContent, /队列/)
  const follow = sent.find(x => x.endpoint === 'session/follow')
  assert.ok(follow)
  socket.emit('message', { data: JSON.stringify({
    type: 'item', streamId: follow.streamId, value: {
      type: 'event', event: {
        type: 'user/message', seq: 3,
        data: { source: { kind: 'user', rpcId: requestId }, content: [{ type: 'text', text: 'hello' }] },
      },
    },
  }) })
  socket.emit('message', { data: JSON.stringify({
    type: 'item', streamId: follow.streamId, value: {
      type: 'event', event: {
        type: 'turn/end', seq: 4,
        data: { reason: { kind: 'error', error: {
          code: 'INVALID_REQUEST', message: "Invalid 'tools[0].name'",
        } } },
      },
    },
  }) })
  const messages = nodes.get('messages').childNodes.map(x => x.textContent)
  assert.equal(messages.filter(x => x === 'hello').length, 1, 'durable message replaces pending echo')
  assert.match(messages.join(' '), /模型执行失败/)
  assert.match(messages.join(' '), /tools\[0\]\.name/)
})

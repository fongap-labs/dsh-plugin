import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { standalonePocBrowser } from '../packages/dsh-desktop-delta/lib/host/standalone-poc-browser.js'

function createNode(id) {
  return {
    id,
    value: '',
    textContent: '',
    childNodes: [],
    dataset: {},
    disabled: false,
    handlers: new Map(),
    addEventListener(event, listener) { this.handlers.set(event, listener) },
    async click() { await this.handlers.get('click')?.() },
    replaceChildren(...children) { this.childNodes = [...children] },
    appendChild(child) { this.childNodes.push(child) },
    querySelectorAll(name) { return this.childNodes.flatMap(node => node.childNodes || []).filter(node => name === 'button' && node.tag === name) },
  }
}

test('P0-B: authenticated document uses official RPC and event stream without automatic tool approval', async () => {
  const ids = [
    'auth', 'socket', 'gateway', 'snapshot', 'sessions', 'messages', 'interaction',
    'message', 'send', 'create', 'refresh', 'current', 'diagnostic',
  ]
  const nodes = new Map(ids.map(id => [id, createNode(id)]))
  const calls = []
  const sockets = []
  const listeners = new Map()
  const doc = {
    getElementById: id => nodes.get(id),
    createElement: tag => Object.assign(createNode(tag), { tag }),
    createDocumentFragment: () => createNode('fragment'),
  }
  let nextId = 0
  let leaseCheck
  let statusAvailable = true
  class FakeSocket {
    static OPEN = 1
    constructor(url) { this.url = url; this.readyState = 0; this.handlers = new Map(); this.sent = []; sockets.push(this) }
    addEventListener(event, callback) { this.handlers.set(event, callback) }
    send(value) { this.sent.push(JSON.parse(value)) }
    close() { this.readyState = 3 }
    emit(event, value) { this.handlers.get(event)?.(value) }
    open() { this.readyState = 1; this.emit('open') }
  }
  const fetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url === '/dsh-ui-delta/poc/status') return {
      ok: statusAvailable,
      json: async () => statusAvailable
        ? ({ authenticated: true, poc: 'P0-B' }) : ({ authenticated: false }),
    }
    const frame = JSON.parse(options.body)
    let value
    if (frame.method === 'session/list') value = { items: [] }
    else if (frame.method === 'session/create') value = { sessionId: 'test-session' }
    else if (frame.method === 'session/prompt') value = { accepted: true }
    else if (frame.method === '$events/result') value = { accepted: true }
    else throw new Error('Unexpected endpoint ' + frame.method)
    return {
      ok: true,
      json: async () => ({ type: 'server-response', rpcId: frame.rpcId, result: { ok: true, value } }),
    }
  }
  const page = new URL('http://127.0.0.1:3080/dsh-ui-delta/poc?session=test-session')
  const sandbox = {
    document: doc,
    location: page,
    URL,
    WebSocket: FakeSocket,
    fetch,
    crypto: { randomUUID: () => 'probe-id-' + ++nextId },
    history: { replaceState() {} },
    addEventListener: (name, listener) => listeners.set(name, listener),
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: callback => { leaseCheck = callback; return 55 },
    clearInterval() {},
  }
  runInNewContext(standalonePocBrowser, sandbox, { timeout: 1000 })
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
  await flush()
  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].url, 'ws://127.0.0.1:3080/api/remote.mux')
  sockets[0].open()
  await flush()
  assert.equal(sockets[0].sent.some(frame => frame.type === 'open' && frame.endpoint === '$events'), true)
  assert.equal(sockets[0].sent.some(frame => frame.type === 'open' && frame.endpoint === 'session/follow' &&
    frame.payload.args.request.address.sessionId === 'test-session'), true)
  assert.equal(calls.some(call => call.url === '/api/session/list'), true)
  const listing = calls.find(call => call.url === '/api/session/list')
  const listEnvelope = JSON.parse(listing.options.body)
  assert.deepEqual(Object.keys(listEnvelope.payload.args), ['_request'])
  assert.equal(calls.some(call => call.url === '/api/session/prompt'), false)
  assert.equal(calls.some(call => call.url === '/api/$events/result'), false)

  assert.equal(typeof leaseCheck, 'function')
  const events = sockets[0].sent.find(frame => frame.endpoint === '$events')
  sockets[0].emit('message', { data: JSON.stringify({
    type: 'item', streamId: events.streamId,
    value: { type: 'ready', clientId: 'generation-test', host: { home: '/tmp/test' } },
  }) })
  const sessionStream = sockets[0].sent.find(frame => frame.endpoint === 'session/follow')
  sockets[0].emit('message', { data: JSON.stringify({
    type: 'item', streamId: sessionStream.streamId,
    value: { type: 'snapshot', header: { id: 'test-session' }, cursor: 0, records: [] },
  }) })
  assert.equal(nodes.get('snapshot').dataset.state, 'pass')
  nodes.get('message').value = 'test hello'
  await nodes.get('send').click()
  await flush()
  const prompt = calls.find(call => call.url === '/api/session/prompt')
  assert.ok(prompt)
  const submitted = JSON.parse(prompt.options.body)
  assert.equal(submitted.type, 'client-request')
  assert.equal(submitted.method, 'session/prompt')
  assert.equal(submitted.payload.args.request.mode, 'queue')
  assert.equal(submitted.payload.args.request.content[0].text, 'test hello')
  assert.equal(submitted.payload.args.request.sessionId, 'test-session')

  sockets[0].emit('message', { data: JSON.stringify({
    type: 'item', streamId: events.streamId,
    value: {
      type: 'waterfall', event: 'approval/request', eventId: 'approval-test',
      agentId: 'test-session', request: { toolName: 'read_only_test' },
    },
  }) })
  assert.equal(calls.some(call => call.url === '/api/$events/result'), false)
  const allow = nodes.get('interaction').childNodes[0].childNodes.find(node => node.textContent === '允许一次')
  assert.ok(allow)
  await allow.click()
  await flush()
  const reply = calls.find(call => call.url === '/api/$events/result')
  assert.ok(reply)
  const answer = JSON.parse(reply.options.body)
  assert.equal(answer.payload.args.clientId, 'generation-test')
  assert.equal(answer.payload.args.eventId, 'approval-test')
  assert.equal(answer.payload.args.outcome.kind, 'result')
  assert.equal(answer.payload.args.outcome.value, 'allowed-once')
  const unanswered = {
    type: 'waterfall', event: 'user-questions/request', eventId: 'unknown-interaction',
    agentId: 'test-session', request: { questions: [] },
  }
  sockets[0].emit('message', { data: JSON.stringify({
    type: 'item', streamId: events.streamId, value: unanswered,
  }) })
  await flush()
  const delegate = calls.find(call => call.url === '/api/$events/result' &&
    JSON.parse(call.options.body).payload.args.eventId === 'unknown-interaction')
  assert.ok(delegate, 'unknown waterfalls must be delegated rather than held')
  assert.equal(JSON.parse(delegate.options.body).payload.args.outcome.kind, 'next')

  const otherSession = {
    type: 'waterfall', event: 'approval/request', eventId: 'other-session',
    agentId: 'not-selected', request: { toolName: 'another_tool' },
  }
  sockets[0].emit('message', { data: JSON.stringify({
    type: 'item', streamId: events.streamId, value: otherSession,
  }) })
  await flush()
  assert.equal(calls.some(call => call.url === '/api/$events/result' &&
    JSON.parse(call.options.body).payload.args.eventId === 'other-session'), true)

  statusAvailable = false
  leaseCheck()
  await flush()
  assert.equal(sockets[0].readyState, 3)
  assert.equal(nodes.get('send').disabled, true)
  assert.equal(nodes.get('create').disabled, true)
  const before = calls.length
  nodes.get('message').value = 'should not send after unload'
  await nodes.get('send').click()
  assert.equal(calls.length, before, 'must not send after plugin lease expires')
  listeners.get('pagehide')()
  assert.equal(sockets[0].readyState, 3)
})

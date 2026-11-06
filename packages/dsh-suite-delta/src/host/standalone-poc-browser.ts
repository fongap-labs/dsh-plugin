/**
 * Temporary browser protocol explorer for the independent Delta document.
 *
 * Intentionally self-contained so P0 can test the documented Web Gateway wire
 * without stealing Harness's UI slots or copying its client boot graph.
 * This is not a production SDK; delete when a supported standalone client
 * composition is identified. All mutations require explicit button actions.
 */
export const standalonePocBrowser = String.raw`
(() => {
  'use strict';
  const nodes = {
    auth: document.getElementById('auth'),
    socket: document.getElementById('socket'),
    gateway: document.getElementById('gateway'),
    sessions: document.getElementById('sessions'),
    messages: document.getElementById('messages'),
    interaction: document.getElementById('interaction'),
    message: document.getElementById('message'),
    send: document.getElementById('send'),
    create: document.getElementById('create'),
    refresh: document.getElementById('refresh'),
    current: document.getElementById('current'),
    diagnostic: document.getElementById('diagnostic'),
  };
  if (Object.values(nodes).some(node => !node)) return;
  const maxEvents = 120;
  const entries = [];
  let ws;
  let attempt = 0;
  let reconnect;
  let pending = null;
  let currentSession = new URL(location.href).searchParams.get('session') || '';
  const streams = new Map();
  const sessionEvents = new Map();
  let gatewayClientId = '';
  const safeError = (error) => {
    if (error && typeof error === 'object' && typeof error.code === 'string') return error.code;
    return error instanceof TypeError ? 'protocol/type-error' : 'transport-or-business-error';
  };
  function state(node, status, text) {
    node.dataset.state = status;
    node.textContent = text;
  }
  function diagnostic(text) { nodes.diagnostic.textContent = text; }
  function limitEvents(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(-maxEvents).filter(item => item && typeof item === 'object');
  }
  function describe(event) {
    const name = String(event.type || 'unknown');
    if (name === 'assistant-stream') {
      const frame = event.frame || {};
      return 'assistant-stream/' + String(frame.type || 'unknown');
    }
    const record = event.event || event;
    return String(record.type || name) + (typeof record.seq === 'number' ? ' #' + record.seq : '');
  }
  function renderEvents() {
    nodes.messages.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const event of entries) {
      const row = document.createElement('li');
      row.textContent = describe(event);
      fragment.appendChild(row);
    }
    nodes.messages.appendChild(fragment);
  }
  function pushEvent(item) {
    entries.push(item);
    if (entries.length > maxEvents) entries.splice(0, entries.length - maxEvents);
    renderEvents();
  }
  async function rpc(endpoint, args) {
    const rpcId = crypto.randomUUID();
    const response = await fetch('/api/' + endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request', rpcId, method: endpoint, payload: { args }
      }),
    });
    if (!response.ok) throw new Error('transport/' + response.status);
    const frame = await response.json();
    if (!frame || frame.type !== 'server-response' || frame.rpcId !== rpcId ||
        !frame.result || typeof frame.result.ok !== 'boolean') {
      throw new TypeError('invalid gateway response');
    }
    if (!frame.result.ok) {
      const failure = frame.result.error || {};
      throw { code: typeof failure.code === 'string' ? failure.code : 'rpc/unknown' };
    }
    return frame.result.value;
  }
  async function list() {
    state(nodes.sessions, 'pending', '\u8bfb\u53d6\u4e2d');
    try {
      const value = await rpc('session/list', { request: {} });
      const items = value && Array.isArray(value.items) ? value.items : null;
      if (items === null) throw new TypeError('invalid session list');
      nodes.sessions.replaceChildren();
      for (const item of items.slice(0, 30)) {
        if (!item || typeof item.sessionId !== 'string') continue;
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'session-option';
        option.textContent = item.sessionId === currentSession ? '● ' + (item.title || item.sessionId) : (item.title || item.sessionId);
        option.addEventListener('click', () => selectSession(item.sessionId));
        nodes.sessions.appendChild(option);
      }
      if (!nodes.sessions.childNodes.length) state(nodes.sessions, 'pass', '\u6ca1\u6709\u4f1a\u8bdd');
      state(nodes.gateway, 'pass', 'Session RPC \u53ef\u7528');
    } catch (error) {
      state(nodes.sessions, 'fail', '\u8bfb\u53d6\u5931\u8d25');
      state(nodes.gateway, 'fail', safeError(error));
    }
  }
  async function createSession() {
    nodes.create.disabled = true;
    try {
      const value = await rpc('session/create', { request: {} });
      if (!value || typeof value.sessionId !== 'string') throw new TypeError('invalid session create');
      selectSession(value.sessionId);
      await list();
    } catch (error) {
      diagnostic('\u521b\u5efa\u4f1a\u8bdd\u5931\u8d25：' + safeError(error));
    } finally {
      nodes.create.disabled = false;
    }
  }
  function selectSession(id) {
    if (!id || !/^[A-Za-z0-9._:-]{1,150}$/.test(id)) {
      diagnostic('\u4f1a\u8bdd\u6807\u8bc6\u4e0d\u7b26\u5408\u63a2\u9488\u7ea6\u675f');
      return;
    }
    currentSession = id;
    const url = new URL(location.href);
    url.searchParams.set('session', id);
    history.replaceState(null, '', url);
    state(nodes.current, 'pass', id);
    entries.length = 0;
    renderEvents();
    for (const stream of streams.values()) {
      if (stream.kind === 'session') cancelStream(stream.id);
    }
    if (ws && ws.readyState === WebSocket.OPEN) openSessionStream(id);
  }
  async function send() {
    const value = nodes.message.value.trim();
    if (!currentSession || !value) {
      diagnostic('\u5148\u9009\u62e9\u4f1a\u8bdd\u5e76\u8f93\u5165\u6d88\u606f');
      return;
    }
    nodes.send.disabled = true;
    try {
      const result = await rpc('session/prompt', {
        request: {
          requestId: crypto.randomUUID(),
          sessionId: currentSession,
          mode: 'queue',
          content: [{ type: 'text', text: value }],
        },
      });
      if (!result || result.accepted !== true) throw new TypeError('prompt not accepted');
      nodes.message.value = '';
      diagnostic('\u6d88\u606f\u5df2\u8fdb\u5165 Harness \u961f\u5217，\u7b49\u5f85\u4e8b\u4ef6\u6d41');
    } catch (error) {
      diagnostic('\u53d1\u9001\u5931\u8d25：' + safeError(error));
    } finally {
      nodes.send.disabled = false;
    }
  }
  function openStream(kind, endpoint, request) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const id = crypto.randomUUID();
    streams.set(id, { id, kind, endpoint });
    ws.send(JSON.stringify({
      type: 'open',
      streamId: id,
      endpoint,
      payload: { args: request },
    }));
    return id;
  }
  function cancelStream(id) {
    if (!streams.has(id)) return;
    streams.delete(id);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'cancel', streamId: id }));
    }
  }
  function openSessionStream(sessionId) {
    openStream('session', 'session/follow', {
      request: {
        address: { kind: 'session', sessionId },
        assistantStream: true,
      },
    });
  }
  function clearApproval(reason) {
    pending = null;
    nodes.interaction.replaceChildren();
    if (reason) diagnostic(reason);
  }
  function receiveApproval(frame) {
    if (!gatewayClientId || !currentSession || frame.agentId !== currentSession || pending) return;
    if (!frame.eventId || !frame.request || typeof frame.request.toolName !== 'string') return;
    pending = frame;
    const card = document.createElement('div');
    const detail = document.createElement('p');
    detail.textContent = '\u5de5\u5177 ' + frame.request.toolName + ' \u8bf7\u6c42\u6279\u51c6';
    card.appendChild(detail);
    for (const [title, value] of [['\u5141\u8bb8\u4e00\u6b21', 'allowed-once'], ['\u62d2\u7edd', 'rejected']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = title;
      button.addEventListener('click', () => { void answerApproval(frame, value); });
      card.appendChild(button);
    }
    nodes.interaction.replaceChildren(card);
  }
  async function answerApproval(frame, decision) {
    if (!pending || pending.eventId !== frame.eventId || !gatewayClientId) return;
    for (const button of nodes.interaction.querySelectorAll('button')) button.disabled = true;
    try {
      await rpc('$events/result', {
        clientId: gatewayClientId,
        eventId: frame.eventId,
        outcome: { kind: 'result', value: decision },
      });
      clearApproval('\u5ba1\u6279\u7ed3\u679c\u5df2\u63d0\u4ea4\u81f3 Host');
    } catch (error) {
      diagnostic('\u5ba1\u6279\u63d0\u4ea4\u5931\u8d25：' + safeError(error));
      clearApproval();
    }
  }
  function handleEvent(value) {
    if (!value || typeof value !== 'object') return;
    if (!gatewayClientId) {
      if (value.type === 'ready' && typeof value.clientId === 'string') {
        gatewayClientId = value.clientId;
        state(nodes.socket, 'pass', 'Gateway \u4e8b\u4ef6\u6d41\u5c31\u7eea');
      } else {
        state(nodes.socket, 'fail', '\u65e0\u6548\u4e8b\u4ef6\u6d41\u9996\u5e27');
      }
      return;
    }
    if (value.type === 'cancel') {
      if (pending && pending.eventId === value.eventId) clearApproval('\u8bf7\u6c42\u5df2\u7531 Host \u53d6\u6d88');
    } else if (value.type === 'waterfall' && value.event === 'approval/request') {
      receiveApproval(value);
    } else if (value.type === 'waterfall') {
      diagnostic('\u5b58\u5728\u672a\u652f\u6301\u7684\u4ea4\u4e92：' + String(value.event || 'unknown'));
      // Never automatically accept unknown permissions or questions.
    }
  }
  function handleFrame(frame) {
    if (!frame || typeof frame.streamId !== 'string') return;
    const target = streams.get(frame.streamId);
    if (!target) return;
    if (frame.type === 'error' || frame.type === 'end') {
      streams.delete(frame.streamId);
      if (target.kind === 'session') diagnostic('Session \u6d41\u7ed3\u675f：' + (frame.error?.code || frame.type));
      if (target.kind === 'events') {
        state(nodes.socket, 'fail', '\u4e8b\u4ef6\u6d41\u4e2d\u65ad');
      }
      return;
    }
    if (frame.type !== 'item') return;
    if (target.kind === 'events') {
      handleEvent(frame.value);
    } else if (target.kind === 'session') {
      const value = frame.value;
      if (!value || typeof value !== 'object') return;
      if (value.type === 'snapshot') {
        entries.length = 0;
        entries.push(...limitEvents(value.records));
        renderEvents();
        diagnostic('Session \u5feb\u7167\u5df2\u6062\u590d，\u5386\u53f2\u4e8b\u4ef6 ' + entries.length + ' \u6761');
      } else {
        pushEvent(value);
      }
    }
  }
  function connect() {
    const current = ++attempt;
    clearTimeout(reconnect);
    if (ws) { try { ws.close(); } catch {} }
    gatewayClientId = '';
    streams.clear();
    clearApproval();
    state(nodes.socket, 'pending', '\u8fde\u63a5\u4e2d');
    const url = new URL('/api/remote.mux', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(url.href);
    ws.addEventListener('open', () => {
      if (attempt !== current) return;
      state(nodes.socket, 'pending', 'Gateway \u63e1\u624b\u4e2d');
      openStream('events', '$events', {});
      if (currentSession) openSessionStream(currentSession);
      void list();
    });
    ws.addEventListener('message', ({data}) => {
      if (attempt !== current || typeof data !== 'string') return;
      try { handleFrame(JSON.parse(data)); }
      catch { diagnostic('Gateway \u5e27\u65e0\u6cd5\u89e3\u6790'); }
    });
    ws.addEventListener('close', () => {
      if (attempt !== current) return;
      gatewayClientId = '';
      clearApproval('\u8fde\u63a5\u65ad\u5f00；\u5f85\u5904\u7406\u5ba1\u6279\u4e0d\u4f5c\u4efb\u4f55\u81ea\u52a8\u51b3\u5b9a');
      state(nodes.socket, 'fail', '\u8fde\u63a5\u65ad\u5f00');
      reconnect = setTimeout(connect, 2400);
    });
    ws.addEventListener('error', () => {
      if (attempt === current) state(nodes.socket, 'fail', 'WebSocket \u9519\u8bef');
    });
  }
  async function start() {
    state(nodes.auth, 'pending', '\u6821\u9a8c\u4e2d');
    try {
      const response = await fetch('/dsh-ui-delta/poc/status', {
        cache: 'no-store', credentials: 'same-origin',
      });
      const value = await response.json();
      if (!response.ok || value.authenticated !== true) throw new Error('unauthorized');
      state(nodes.auth, 'pass', '\u901a\u8fc7');
      if (currentSession) state(nodes.current, 'pass', currentSession);
      connect();
    } catch {
      state(nodes.auth, 'fail', '\u8ba4\u8bc1\u5931\u8d25');
      diagnostic('\u8bf7\u5148\u4f7f\u7528\u5b98\u65b9 Harness \u542f\u52a8\u9875\u9762\u5b8c\u6210 Cookie \u4ea4\u6362');
    }
  }
  nodes.create.addEventListener('click', () => { void createSession(); });
  nodes.refresh.addEventListener('click', () => { void list(); });
  nodes.send.addEventListener('click', () => { void send(); });
  addEventListener('pagehide', () => {
    ++attempt;
    clearTimeout(reconnect);
    for (const id of [...streams.keys()]) cancelStream(id);
    if (ws) ws.close();
    clearApproval();
  }, { once: true });
  void start();
})();
`;
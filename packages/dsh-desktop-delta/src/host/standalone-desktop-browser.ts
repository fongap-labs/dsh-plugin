/**
 * Temporary browser protocol explorer for the independent Delta document.
 *
 * Intentionally self-contained so P0 can test the documented Web Gateway wire
 * without stealing Harness's UI slots or copying its client boot graph.
 * This is not a production SDK; delete when a supported standalone client
 * composition is identified. All mutations require explicit button actions.
 */
export const standaloneDesktopBrowser = String.raw`
(() => {
  'use strict';
  const nodes = {
    auth: document.getElementById('auth'),
    socket: document.getElementById('socket'),
    gateway: document.getElementById('gateway'),
    snapshot: document.getElementById('snapshot'),
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
  // Keep a visible user echo until the Host confirms durable admission through
  // session/follow. Failed submissions remain editable instead of disappearing.
  const pendingMessages = new Map();
  let ws;
  let attempt = 0;
  let reconnect;
  let pending = null;
  let currentSession = new URL(location.href).searchParams.get('session') || '';
  const streams = new Map();
  let isActive = true;
  let leaseTimer;
  let reconnectAttempts = 0;
  let isApprovalSettling = false;
  // The native UI is a startup-only fallback, not a second running frontend.
  let isBootstrapReady = false;
  let isSessionListReady = false;
  let isEventStreamReady = false;
  let startupTimer;
  let gatewayBaseUrl = location.href;
  async function resolveGatewayBaseUrl() {
    if (location.protocol !== 'dsh-app:') return location.href;
    // On Electron the document origin is dsh-app://app, not the WebSocket
    // Host. The owned desktop preload supplies its loopback Host origin.
    const boot = globalThis.dshDesktopBoot;
    if (typeof boot?.ready !== 'function') throw new Error('Desktop Host bridge is unavailable');
    const result = await boot.ready();
    const raw = result?.streamBaseUrl;
    if (typeof raw !== 'string') throw new Error('Desktop Host stream origin is unavailable');
    const target = new URL(raw);
    if (!['http:', 'https:'].includes(target.protocol) ||
        !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
        target.username || target.password || target.origin !== raw) {
      throw new Error('Invalid Desktop Host stream origin');
    }
    return target.origin;
  }
  function fallbackToNative() {
    if (isBootstrapReady) return;
    stop('Delta Desktop failed to start; restoring native Harness');
    // The one-shot query guard prevents the native launcher redirecting back.
    location.replace(new URL('/?delta-native-fallback=1', location.href).href);
  }
  function markReady() {
    if (!isActive || isBootstrapReady || !isSessionListReady || !isEventStreamReady) return;
    isBootstrapReady = true;
    clearTimeout(startupTimer);
  }
  const validSessionId = (id) => typeof id === 'string' && /^[A-Za-z0-9._:-]{1,150}$/.test(id);
  if (!validSessionId(currentSession)) currentSession = '';
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
      if (frame.type === 'chunk' && frame.chunk?.type === 'text-delta' &&
          typeof frame.chunk.text === 'string') {
        return 'assistant-stream/text-delta: ' + frame.chunk.text.slice(0, 600);
      }
      return 'assistant-stream/' + String(frame.type || 'unknown');
    }
    const record = event.event || event;
    return String(record.type || name) + (typeof record.seq === 'number' ? ' #' + record.seq : '');
  }
  function extractContent(value) {
    const parts = Array.isArray(value) ? value : [];
    return parts.filter(piece => piece && piece.type === 'text' && typeof piece.text === 'string')
      .map(piece => piece.text).join('');
  }
  function textFor(event) {
    if (!event || typeof event !== 'object') return null;
    const raw = event.type === 'event' ? event.event : event;
    if (!raw || typeof raw !== 'object') return null;
    if (raw.type === 'user/message') {
      if (raw.data?.source?.kind !== 'user') return null;
      return { role: 'user', text: extractContent(raw.data?.content) || '[Attachment]' };
    }
    if (raw.type === 'assistant/message') {
      return { role: 'assistant', text: extractContent(raw.data?.message?.content) || '[Non-text response]' };
    }
    if (raw.type === 'assistant-stream' && raw.frame?.type === 'chunk') {
      const ch = raw.frame.chunk;
      if (ch?.type === 'text-delta' && typeof ch.text === 'string') {
        return { role: 'assistant', text: ch.text, transient: true };
      }
    }
    if (raw.type === 'turn/end') {
      const reason = raw.data?.reason;
      if (reason?.kind === 'error') {
        const failure = reason.error || {};
        const code = typeof failure.code === 'string' ? failure.code.slice(0, 80) : '';
        const message = typeof failure.message === 'string'
          ? failure.message.slice(0, 500) : 'Harness model execution failed';
        return { role: 'event', text: '\u6a21\u578b\u6267\u884c\u5931\u8d25' + (code ? ' [' + code + ']' : '') + ': ' + message };
      }
      if (reason?.kind === 'interrupted') {
        return { role: 'event', text: '\u6a21\u578b\u6267\u884c\u4e2d\u65ad\uff1aHarness \u8fdb\u7a0b\u5728\u56de\u590d\u5b8c\u6210\u524d\u9000\u51fa' };
      }
    }
    if (raw.type === 'tool/call') {
      const name = typeof raw.data?.name === 'string' ? raw.data.name :
        typeof raw.data?.toolName === 'string' ? raw.data.toolName : 'Tool';
      return { role: 'event', text: 'Tool requested: ' + name };
    }
    return null;
  }
  function renderEvents() {
    nodes.messages.replaceChildren();
    const fragment = document.createDocumentFragment();
    let assistantDraft = '';
    let count = 0;
    for (const event of entries) {
      const raw = event?.type === 'event' ? event.event : event;
      if (raw?.type === 'user/message' && raw.data?.source?.kind === 'user' &&
          typeof raw.data.source.rpcId === 'string') {
        pendingMessages.delete(raw.data.source.rpcId);
      }
      const item = textFor(event);
      if (!item) continue;
      if (item.transient) { assistantDraft += item.text; continue; }
      if (item.role === 'assistant') assistantDraft = '';
      const row = document.createElement('li');
      row.dataset.role = item.role;
      row.textContent = item.text;
      fragment.appendChild(row);
      count++;
    }
    for (const pending of pendingMessages.values()) {
      const row = document.createElement('li');
      row.dataset.role = 'user';
      row.textContent = pending.text + (pending.status === 'sending' ? ' (\u53d1\u9001\u4e2d)' : ' (\u6392\u961f\u4e2d)');
      fragment.appendChild(row);
      count++;
    }
    if (assistantDraft) {
      const row = document.createElement('li');
      row.dataset.role = 'assistant';
      row.textContent = assistantDraft;
      fragment.appendChild(row);
      count++;
    }
    nodes.messages.appendChild(fragment);
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.hidden = count > 0;
    const conversation = document.getElementById('conversation');
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
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
    if (!isActive) return;
    state(nodes.sessions, 'pending', '\u8bfb\u53d6\u4e2d');
    try {
      const value = await rpc('session/list', { _request: {} });
      if (!isActive) return;
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
      isSessionListReady = true;
      markReady();
    } catch (error) {
      state(nodes.sessions, 'fail', '\u8bfb\u53d6\u5931\u8d25');
      state(nodes.gateway, 'fail', safeError(error));
    }
  }
  async function createSession() {
    if (!isActive) return;
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
    if (!isActive || !validSessionId(id)) {
      diagnostic('\u4f1a\u8bdd\u6807\u8bc6\u4e0d\u7b26\u5408\u63a2\u9488\u7ea6\u675f');
      return;
    }
    currentSession = id;
    pendingMessages.clear();
    const url = new URL(location.href);
    url.searchParams.set('session', id);
    history.replaceState(null, '', url);
    state(nodes.current, 'pass', id);
    state(nodes.snapshot, 'pending', 'Waiting for Session snapshot');
    entries.length = 0;
    renderEvents();
    for (const stream of streams.values()) {
      if (stream.kind === 'session') cancelStream(stream.id);
    }
    if (ws && ws.readyState === WebSocket.OPEN) openSessionStream(id);
  }
  async function send() {
    if (!isActive) return;
    const value = nodes.message.value.trim();
    if (!currentSession || !value) {
      diagnostic('\u5148\u9009\u62e9\u4f1a\u8bdd\u5e76\u8f93\u5165\u6d88\u606f');
      return;
    }
    const requestId = crypto.randomUUID();
    pendingMessages.set(requestId, { text: value, status: 'sending' });
    renderEvents();
    diagnostic('\u6b63\u5728\u5411 Harness \u53d1\u9001\u6d88\u606f\u2026');
    nodes.send.disabled = true;
    try {
      const result = await rpc('session/prompt', {
        request: {
          requestId,
          sessionId: currentSession,
          mode: 'queue',
          content: [{ type: 'text', text: value }],
        },
      });
      if (!result || result.accepted !== true) throw new TypeError('prompt not accepted');
      nodes.message.value = '';
      const pending = pendingMessages.get(requestId);
      if (pending) pending.status = 'queued';
      renderEvents();
      diagnostic('\u6d88\u606f\u5df2\u8fdb\u5165 Harness \u961f\u5217，\u7b49\u5f85\u4e8b\u4ef6\u6d41');
    } catch (error) {
      pendingMessages.delete(requestId);
      renderEvents();
      diagnostic('\u53d1\u9001\u5931\u8d25：' + safeError(error));
    } finally {
      nodes.send.disabled = false;
    }
  }
  function openStream(kind, endpoint, request) {
    if (!isActive || !ws || ws.readyState !== WebSocket.OPEN) return;
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
        maxMessages: 50,
      },
    });
  }
  function clearApproval(reason) {
    pending = null;
    isApprovalSettling = false;
    nodes.interaction.replaceChildren();
    if (reason) diagnostic(reason);
  }
  function delegateUnclaimed(frame) {
    if (!isActive || !gatewayClientId || typeof frame.eventId !== 'string') return;
    void rpc('$events/result', {
      clientId: gatewayClientId,
      eventId: frame.eventId,
      outcome: { kind: 'next' },
    }).catch(() => { diagnostic('Unable to delegate an unsupported interaction'); });
  }
  function receiveApproval(frame) {
    if (!isActive || !gatewayClientId || !currentSession || frame.agentId !== currentSession ||
        pending || !frame.eventId || !frame.request || typeof frame.request.toolName !== 'string') {
      delegateUnclaimed(frame);
      return;
    }
    pending = frame;
    const card = document.createElement('div');
    const detail = document.createElement('p');
    detail.textContent = '\u5de5\u5177 ' + frame.request.toolName + ' \u8bf7\u6c42\u6279\u51c6';
    card.appendChild(detail);
    const reason = frame.request.displayReason?.zh || frame.request.displayReason?.en || frame.request.reason;
    if (typeof reason === 'string' && reason.trim()) {
      const reasonText = document.createElement('p');
      reasonText.textContent = reason.slice(0, 1000);
      card.appendChild(reasonText);
    }
    if (typeof frame.request.callId === 'string' && frame.request.callId) {
      const call = document.createElement('p');
      call.textContent = 'Tool call: ' + frame.request.callId.slice(0, 150);
      card.appendChild(call);
    }
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
    if (!isActive || !pending || isApprovalSettling ||
        pending.eventId !== frame.eventId || frame.agentId !== currentSession ||
        !gatewayClientId) return;
    isApprovalSettling = true;
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
    } finally {
      isApprovalSettling = false;
    }
  }
  function handleEvent(value) {
    if (!value || typeof value !== 'object') return;
    if (!gatewayClientId) {
      if (value.type === 'ready' && typeof value.clientId === 'string') {
        gatewayClientId = value.clientId;
        state(nodes.socket, 'pass', 'Gateway \u4e8b\u4ef6\u6d41\u5c31\u7eea');
        isEventStreamReady = true;
        markReady();
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
      delegateUnclaimed(value);
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
      if (target.kind === 'session') state(nodes.snapshot, 'fail', 'Session stream ended');
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
        if (!Array.isArray(value.records) || typeof value.cursor !== 'number' ||
            !value.header || typeof value.header.id !== 'string' ||
            value.header.id !== currentSession) {
          state(nodes.snapshot, 'fail', 'Invalid Session snapshot');
          diagnostic('Invalid Session snapshot');
          return;
        }
        state(nodes.snapshot, 'pass', 'Snapshot received');
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
    if (!isActive) return;
    const current = ++attempt;
    clearTimeout(reconnect);
    if (ws) { try { ws.close(); } catch {} }
    gatewayClientId = '';
    streams.clear();
    clearApproval();
    state(nodes.socket, 'pending', '\u8fde\u63a5\u4e2d');
    const url = new URL('/api/remote.mux', gatewayBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(url.href);
    ws.addEventListener('open', () => {
      if (attempt !== current) return;
      state(nodes.socket, 'pending', 'Gateway \u63e1\u624b\u4e2d');
      reconnectAttempts = 0;
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
      reconnect = setTimeout(connect, Math.min(2000 * 2 ** reconnectAttempts++, 12000));
    });
    ws.addEventListener('error', () => {
      if (attempt === current) state(nodes.socket, 'fail', 'WebSocket \u9519\u8bef');
    });
  }
  async function checkLease() {
    if (!isActive) return false;
    try {
      const response = await fetch('/dsh-ui-delta/app/status', {
        cache: 'no-store', credentials: 'same-origin',
      });
      if (!response.ok) return false;
      const value = await response.json();
      return value?.authenticated === true && value?.desktop === 'Delta Desktop';
    } catch {
      return false;
    }
  }
  function stop(reason) {
    if (!isActive) return;
    isActive = false;
    ++attempt;
    clearTimeout(reconnect);
    clearTimeout(startupTimer);
    clearInterval(leaseTimer);
    streams.clear();
    gatewayClientId = '';
    if (ws) ws.close();
    clearApproval();
    nodes.create.disabled = true;
    nodes.refresh.disabled = true;
    nodes.send.disabled = true;
    state(nodes.socket, 'fail', 'Disconnected');
    if (reason) diagnostic(reason);
  }
  async function start() {
    state(nodes.auth, 'pending', 'Checking');
    startupTimer = setTimeout(fallbackToNative, 15000);
    if (!(await checkLease())) {
      state(nodes.auth, 'fail', 'Not authenticated');
      fallbackToNative();
      return;
    }
    state(nodes.auth, 'pass', 'Authenticated');
    try {
      gatewayBaseUrl = await resolveGatewayBaseUrl();
    } catch {
      state(nodes.gateway, 'fail', 'Desktop Host unavailable');
      fallbackToNative();
      return;
    }
    if (!isActive) return;
    if (currentSession) {
      state(nodes.current, 'pass', currentSession);
      state(nodes.snapshot, 'pending', 'Waiting for Session snapshot');
    }
    leaseTimer = setInterval(() => {
      void checkLease().then(valid => {
        if (isActive && !valid) stop('Delta Desktop lost authorization');
      });
    }, 5000);
    connect();
  }
  nodes.create.addEventListener('click', () => { void createSession(); });
  nodes.refresh.addEventListener('click', () => { void list(); });
  nodes.send.addEventListener('click', () => { void send(); });
  nodes.message.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send();
    }
  });
  addEventListener('pagehide', () => { stop(); }, { once: true });
  void start();
})();
`;
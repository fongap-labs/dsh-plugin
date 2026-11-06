import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../packages/dsh-suite-delta/lib/client.js', import.meta.url), 'utf8');
const start = source.indexOf('const searchMessageText =');
const end = source.indexOf('let isStatusTicking = false;', start);
assert.ok(start >= 0 && end > start, 'compiled content search must exist');
const code = `${source.slice(start, end)} globalThis.install = installContentSearch; globalThis.dispose = () => restoreContentSearch?.();`;

function fixture({ failingIndex = false, read } = {}) {
  const calls = [];
  const notices = [];
  const original = async () => failingIndex
    ? { ok: false, error: { message: 'index unavailable' } }
    : { ok: true, value: { items: [{ sessionId: 'native', snippet: 'native match' }], hasMore: false } };
  const service = {
    search: original,
    searchResultLimit: 20,
    list: { getSnapshot: () => ({ ids: ['native', 'chinese', 'tool', 'assistant', 'child'], byId: {
      native: {}, chinese: {}, tool: {}, assistant: {}, child: { origin: 'subagent' },
    } }) },
  };
  const remote = { session: { events: async (request, signal) => {
    calls.push(request);
    if (read) return read(request, signal);
    const id = request.address.sessionId;
    if (id === 'chinese' && request.beforeSeq === undefined) return {
      ok: true, value: { records: [{ event: { seq: 100, type: 'user/message', data: { content: [{ type: 'text', text: '其他内容' }] } } }], hasMore: true },
    };
    if (id === 'chinese') return {
      ok: true, value: { records: [{ event: { seq: 99, type: 'user/message', data: { content: [{ type: 'text', text: '如何处理后台任务的状态' }] } } }], hasMore: false },
    };
    if (id === 'assistant') return {
      ok: true, value: { records: [{ event: { seq: 1, type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '后台任务运行中' }] } } } }], hasMore: false },
    };
    return { ok: true, value: { records: [{ event: { seq: 1, type: 'tool/result', data: { content: '后台任务' } } }], hasMore: false } };
  } } };
  const context = {
    ctx: { get: name => name === 'sessions' ? service : name === 'remote' ? remote : undefined },
    AbortController, setTimeout, clearTimeout,
    showNotice: (...args) => notices.push(args), t: (zh) => zh,
  };
  runInNewContext(code, context);
  context.install();
  return { service, original, calls, notices, dispose: context.dispose };
}

describe('conversation content search', () => {
  it('adds Chinese substring matches from authorized history and keeps native matches', async () => {
    const h = fixture();
    const result = await h.service.search('后台任务', new AbortController().signal);
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.value.items, item => item.sessionId), ['native', 'chinese', 'tool', 'assistant']);
    assert.ok(result.value.items[1].snippet.includes('后台任务'));
    assert.ok(result.value.items.find(item => item.sessionId === 'tool').snippet.includes('后台任务'));
    assert.ok(h.calls.some(call => call.address.sessionId === 'chinese' && call.beforeSeq === 100));
    assert.ok(!h.calls.some(call => call.address.sessionId === 'child' || call.address.sessionId === 'native'));
    h.dispose();
    assert.equal(h.service.search, h.original);
  });

  it('falls back when the native index fails and preserves errors for unmatched queries', async () => {
    const h = fixture({ failingIndex: true });
    const result = await h.service.search('后台任务', new AbortController().signal);
    assert.equal(result.ok, true);
    assert.ok(result.value.items.some(item => item.sessionId === 'chinese'));
    const count = h.calls.length;
    const english = await h.service.search('background', new AbortController().signal);
    assert.equal(english.ok, false);
    assert.ok(h.calls.length > count);
    h.dispose();
  });


  it('finds English message text without dropping native search matches', async () => {
    const h = fixture({ read: async (request) => ({
      ok: true,
      value: { records: [{ event: {
        seq: 1, type: 'user/message',
        data: { content: [{ type: 'text', text: request.address.sessionId === 'chinese'
          ? 'Keep the background job running.' : 'unrelated content' }] },
      } }], hasMore: false },
    }) });
    const result = await h.service.search('background', new AbortController().signal);
    assert.equal(result.ok, true);
    assert.ok(result.value.items.some(item => item.sessionId === 'chinese'));
    assert.ok(result.value.items.some(item => item.sessionId === 'native'));
    h.dispose();
  });

  it('cancels pending history reads and restores the host service on unload', async () => {
    let signalObserved;
    let notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const h = fixture({ read: (_request, signal) => new Promise((_resolve, reject) => {
      signalObserved = signal;
      notifyStarted();
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }) });
    const search = h.service.search('后台任务', new AbortController().signal);
    await started;
    h.dispose();
    await search;
    assert.equal(signalObserved.aborted, true);
    assert.equal(h.service.search, h.original);
    assert.equal(h.notices.length, 0);
  });
});

/**
 * Opt-in, read-only P0-A probe: a genuinely separate HTML document served by
 * the Delta Suite plugin, not by the Harness React root or Slot tree.
 *
 * This deliberately does NOT claim to prove Session, approval, or resume RPC.
 * It proves authenticated page routing + a same-origin authenticated request
 * + the official WebSocket carrier upgrade without copying the Web boot graph.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

export const POC_PAGE_PATH = '/dsh-ui-delta/poc'
export const POC_STATUS_PATH = '/dsh-ui-delta/poc/status'

interface POCWebServer {
  register(route: {
    name: string
    kind: 'exact'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): Promise<void> | void
  }): () => void
}

interface POCConnection {
  /** Same trust and signed-Cookie admission as official /api RPC routes. */
  admit(request: IncomingMessage): { peer: unknown } | { rejection: 401 | 403 }
}

interface POCHost {
  webServer?: POCWebServer
  connection?: POCConnection
  effect?(register: () => () => void, label?: string): unknown
  get?(key: string): unknown
}

const html = (nonce: string): string => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delta Suite · 独立网页验证</title>
<style nonce="${nonce}">
:root { color-scheme: light dark; font: 14px/1.55 system-ui, sans-serif; }
body { margin: 0; min-height: 100dvh; background: #f5f6f7; color: #1c2529; }
main { max-width: 780px; margin: min(9vh, 76px) auto; padding: 28px; }
h1 { font-size: 24px; letter-spacing: -.03em; margin: 0 0 10px; }
p { color: #55636a; margin: 0 0 22px; }
section { background: white; border: 1px solid #d9e1e2; border-radius: 14px; padding: 18px; }
ol { padding-left: 20px; }
li { padding: 8px 0; }
strong { font-weight: 600; }
[data-state] { font-variant-numeric: tabular-nums; margin-left: 8px; color: #52656c; }
[data-state="pass"] { color: #286f78; }
[data-state="fail"] { color: #b32828; }
button { color: white; background: #286f78; border: 0; border-radius: 9px; padding: 10px 15px; cursor: pointer; }
button:focus-visible { outline: 3px solid #60b4bf; outline-offset: 3px; }
small { display: block; margin-top: 20px; color: #59666b; }
@media(prefers-color-scheme:dark) {
  body { background: #131417; color: #eef2f4; }
  section { background: #1c1e22; border-color: #36444a; }
  p, small { color: #afc1c7; }
  [data-state] { color: #a6b9c0; }
  [data-state="pass"] { color: #60b4bf; }
  [data-state="fail"] { color: #fa8f8f; }
  button { background: #60b4bf; color: #131417; }
}
</style>
</head>
<body>
<main>
<h1>Delta Suite · P0-A 最小验证</h1>
<p>这是插件独立提供的文档页面。没有加载 Harness 原生 React 布局，也没有复制 Harness 运行内核。</p>
<section>
<ol>
<li>独立页面与签名 Cookie 认证 <strong data-state="pass">通过</strong></li>
<li>同源认证请求 <strong id="auth" data-state="pending">待检测</strong></li>
<li>Harness 官方 WebSocket 连接升级 <strong id="socket" data-state="pending">待检测</strong></li>
<li>Session RPC、流式消息和恢复 <strong data-state="pending">未验证</strong></li>
<li>工具审批与用户提问 <strong data-state="pending">未验证</strong></li>
</ol>
<button type="button" id="retry">重新检测</button>
<small>只检查协议连通性，不发送模型消息、不执行工具、不读取会话、不记录凭据。WebSocket 握手成功不代表 Session API 已兼容。</small>
</section>
</main>
<script nonce="${nonce}">
(() => {
  const status = (id, state, text) => {
    const node = document.getElementById(id);
    node.dataset.state = state;
    node.textContent = text;
  };
  let generation = 0;
  async function run() {
    const current = ++generation;
    status('auth','pending','检测中');
    status('socket','pending','检测中');
    try {
      const res = await fetch('/dsh-ui-delta/poc/status', {
        credentials: 'same-origin', headers: { accept: 'application/json' }, cache: 'no-store'
      });
      const body = await res.json();
      if (current !== generation) return;
      if (res.ok && body.authenticated === true && body.poc === 'P0-A') {
        status('auth','pass','通过');
      } else {
        status('auth','fail',res.status === 401 ? '未认证' : '失败');
      }
    } catch {
      if (current === generation) status('auth','fail','请求失败');
    }
    if (current !== generation) return;
    const address = new URL('/api/remote.mux', location.href);
    address.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let settled = false;
    let ws;
    let timeout;
    const finish = (state, text) => {
      if (settled || current !== generation) return;
      settled = true;
      clearTimeout(timeout);
      status('socket',state,text);
      try { ws?.close(1000); } catch { /* diagnostic only */ }
    };
    try {
      ws = new WebSocket(address.href);
      ws.addEventListener('open', () => finish('pass','握手通过'));
      ws.addEventListener('error', () => finish('fail','握手失败'));
      ws.addEventListener('close', () => finish('fail','连接关闭'));
      timeout = setTimeout(() => finish('fail','连接超时'), 6000);
    } catch {
      finish('fail','无法连接');
    }
  }
  document.getElementById('retry').addEventListener('click', run);
  run();
})();
</script>
</body>
</html>`

/** Opt-in route owner. Register only if the official Connection service exists. */
export function registerStandalonePoc(ctx: Context): void {
  const host = ctx as unknown as POCHost & {
    inject?: (deps: string[], callback: (child: unknown) => void) => unknown
  }
  host.inject?.(['connection'], (child: unknown) => {
    const scope = child as POCHost
    const webServer = scope.webServer ?? (scope.get?.('webServer') as POCWebServer | undefined)
    const connection = scope.connection ?? (scope.get?.('connection') as POCConnection | undefined)
    if (!webServer || !connection || !scope.effect) return

    const send = (req: IncomingMessage, res: ServerResponse, isPage: boolean): void => {
      const admitted = connection.admit(req)
      if ('rejection' in admitted) {
        res.writeHead(admitted.rejection, {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
        })
        res.end(admitted.rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
        res.end()
        return
      }
      const nonce = randomBytes(18).toString('base64')
      const body = isPage ? html(nonce) : JSON.stringify({ poc: 'P0-A', authenticated: true })
      res.writeHead(200, {
        'content-type': isPage ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        ...(isPage ? {
          'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        } : {}),
      })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    scope.effect(() => {
      // Never replace or interfere with the Host's root SPA fallback.
      const disposeStatus = webServer.register({
        name: 'dsh-suite-delta:poc-status',
        kind: 'exact',
        path: POC_STATUS_PATH,
        handler: (req, res) => send(req, res, false),
      })
      try {
        const disposePage = webServer.register({
          name: 'dsh-suite-delta:poc-page',
          kind: 'exact',
          path: POC_PAGE_PATH,
          handler: (req, res) => send(req, res, true),
        })
        return () => { disposePage(); disposeStatus() }
      } catch (error) {
        disposeStatus()
        throw error
      }
    }, 'dsh-suite-delta: standalone P0-A probe')
  })
}

/**
 * Opt-in, read-only P0-A probe: a genuinely separate HTML document served by
 * the Delta Suite plugin, not by the Harness React root or Slot tree.
 *
 * This deliberately does NOT claim to prove Session, approval, or resume RPC.
 * It proves authenticated page routing + a same-origin authenticated request
 * + the official WebSocket carrier upgrade without copying the Web boot graph.
 */
import { randomBytes } from 'node:crypto'
import { standalonePocBrowser } from './standalone-poc-browser.js'
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
section { background: white; border: 1px solid #d9e1e2; border-radius: 14px; padding: 18px; margin: 12px 0; }
h2 { margin: 0 0 10px; font-size: 16px; }
.actions { display:flex; gap:8px; flex-wrap:wrap; margin: 12px 0; }
input { flex: 1 1 160px; border:1px solid #bccdd1; border-radius: 8px; padding: 10px; }
.session-option { margin:4px; background:#e4f0f1; color:#183b42; font-size:12px; }
#messages {max-height: 240px; overflow:auto; word-break:break-all;}
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
<h1>Delta Suite · P0 Gateway 最小验证</h1>
<p>独立文档、独立交互，不挂载 Harness 原生 AppFrame。仅在隔离测试环境使用。</p>
<section>
<h2>连接状态</h2>
<ol>
<li>宿主认证 <strong id="auth" data-state="pending">待检测</strong></li>
<li>Gateway 事件流 <strong id="socket" data-state="pending">待检测</strong></li>
<li>Session RPC <strong id="gateway" data-state="pending">待检测</strong></li>
<li>当前会话 <strong id="current" data-state="pending">未选择</strong></li>
</ol>
<div class="actions"><button type="button" id="create">创建测试会话</button><button type="button" id="refresh">刷新会话目录</button></div>
<div id="sessions" aria-label="Harness 会话目录"></div>
</section>
<section>
<h2>Session / 流式事件</h2>
<p>先选择隔离的测试会话。发消息将真实调用 Harness Agent，可能产生模型费用或工具操作。</p>
<div class="actions"><input type="text" id="message" aria-label="测试消息" placeholder="输入测试消息"><button id="send" type="button">发送消息</button></div>
<ol id="messages" aria-label="最近的 Session 事件"></ol>
</section>
<section>
<h2>审批（手动决定）</h2>
<p>只有本页收到当前会话的审批请求时才显示按钮；不会自动允许工具执行。</p>
<div id="interaction"></div>
</section>
<p role="status" id="diagnostic" aria-live="polite">等待连接</p>
<small>原型只验证当前协议。不要把本页用于生产操作；协议细节可能随 Harness 更新而变更。</small>
</main>
<script nonce="${nonce}">
${standalonePocBrowser}
</script>
</body>
</html>`

/** Opt-in route owner. Register only if the official Connection service exists. */
export function registerStandalonePoc(ctx: Context): void {
  const host = ctx as unknown as POCHost & {
    inject?: (deps: string[], callback: (child: unknown) => void) => unknown
  }
  host.inject?.(['connection', 'webServer'], (child: unknown) => {
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
      const body = isPage ? html(nonce) : JSON.stringify({ poc: 'P0-B', authenticated: true })
      res.writeHead(200, {
        'content-type': isPage ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        ...(isPage ? {
          'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
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

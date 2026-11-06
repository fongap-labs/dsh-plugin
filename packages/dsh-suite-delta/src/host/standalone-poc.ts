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
<title>Delta Suite · \u72ec\u7acb\u7f51\u9875\u9a8c\u8bc1</title>
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
<h1>Delta Suite · P0 Gateway \u6700\u5c0f\u9a8c\u8bc1</h1>
<p>\u72ec\u7acb\u6587\u6863、\u72ec\u7acb\u4ea4\u4e92，\u4e0d\u6302\u8f7d Harness \u539f\u751f AppFrame。\u4ec5\u5728\u9694\u79bb\u6d4b\u8bd5\u73af\u5883\u4f7f\u7528。</p>
<section>
<h2>\u8fde\u63a5\u72b6\u6001</h2>
<ol>
<li>\u5bbf\u4e3b\u8ba4\u8bc1 <strong id="auth" data-state="pending">\u5f85\u68c0\u6d4b</strong></li>
<li>Gateway \u4e8b\u4ef6\u6d41 <strong id="socket" data-state="pending">\u5f85\u68c0\u6d4b</strong></li>
<li>Session RPC <strong id="gateway" data-state="pending">\u5f85\u68c0\u6d4b</strong></li>
<li>Session follow <strong id="snapshot" data-state="pending">Not connected</strong></li>
<li>\u5f53\u524d\u4f1a\u8bdd <strong id="current" data-state="pending">\u672a\u9009\u62e9</strong></li>
</ol>
<div class="actions"><button type="button" id="create">\u521b\u5efa\u6d4b\u8bd5\u4f1a\u8bdd</button><button type="button" id="refresh">\u5237\u65b0\u4f1a\u8bdd\u76ee\u5f55</button></div>
<div id="sessions" aria-label="Harness \u4f1a\u8bdd\u76ee\u5f55"></div>
</section>
<section>
<h2>Session / \u6d41\u5f0f\u4e8b\u4ef6</h2>
<p>\u5148\u9009\u62e9\u9694\u79bb\u7684\u6d4b\u8bd5\u4f1a\u8bdd。\u53d1\u6d88\u606f\u5c06\u771f\u5b9e\u8c03\u7528 Harness Agent，\u53ef\u80fd\u4ea7\u751f\u6a21\u578b\u8d39\u7528\u6216\u5de5\u5177\u64cd\u4f5c。</p>
<div class="actions"><input type="text" id="message" aria-label="\u6d4b\u8bd5\u6d88\u606f" placeholder="\u8f93\u5165\u6d4b\u8bd5\u6d88\u606f"><button id="send" type="button">\u53d1\u9001\u6d88\u606f</button></div>
<ol id="messages" aria-label="\u6700\u8fd1\u7684 Session \u4e8b\u4ef6"></ol>
</section>
<section>
<h2>\u5ba1\u6279（\u624b\u52a8\u51b3\u5b9a）</h2>
<p>\u53ea\u6709\u672c\u9875\u6536\u5230\u5f53\u524d\u4f1a\u8bdd\u7684\u5ba1\u6279\u8bf7\u6c42\u65f6\u624d\u663e\u793a\u6309\u94ae；\u4e0d\u4f1a\u81ea\u52a8\u5141\u8bb8\u5de5\u5177\u6267\u884c。</p>
<div id="interaction"></div>
</section>
<p role="status" id="diagnostic" aria-live="polite">\u7b49\u5f85\u8fde\u63a5</p>
<small>\u539f\u578b\u53ea\u9a8c\u8bc1\u5f53\u524d\u534f\u8bae。\u4e0d\u8981\u628a\u672c\u9875\u7528\u4e8e\u751f\u4ea7\u64cd\u4f5c；\u534f\u8bae\u7ec6\u8282\u53ef\u80fd\u968f Harness \u66f4\u65b0\u800c\u53d8\u66f4。</small>
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

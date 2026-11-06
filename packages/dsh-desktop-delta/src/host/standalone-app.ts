/**
 * Authenticated independent chat document using the existing Harness Gateway
 * connection adapter. This route never replaces native AppFrame or Session.
 */
import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { standaloneDesktopBrowser } from './standalone-desktop-browser.js'

export const INDEPENDENT_APP_PATH = '/dsh-ui-delta/app'
export const INDEPENDENT_STATUS_PATH = '/dsh-ui-delta/app/status'

interface Web {
  register(route: {
    name: string
    kind: 'exact'
    path: string
    handler(req: IncomingMessage, res: ServerResponse): void | Promise<void>
  }): () => void
}
interface Connection {
  admit(request: IncomingMessage): { peer: unknown } | { rejection: 401 | 403 }
}
interface Host {
  webServer?: Web
  connection?: Connection
  effect?(register: () => () => void, label?: string): unknown
  get?(key: string): unknown
}
const template = "<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>Delta Desktop</title>\n<style nonce=\"__NONCE__\">\n:root{color-scheme:light dark;font:14px/1.6 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;--bg:#fff;--side:#f7f8f8;--ink:#252c2e;--muted:#697578;--line:#e1e7e8;--accent:#286f78;--hover:#eaf0f1;--bubble:#f2f4f4;--focus:#60b4bf}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink)}button,input,textarea{font:inherit}button{border:0;background:none;color:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,textarea:focus-visible,a:focus-visible{outline:1px solid var(--focus);outline-offset:2px}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}\n.layout{display:grid;grid-template-columns:265px minmax(0,1fr);height:100dvh}.sidebar{display:flex;flex-direction:column;min-height:0;background:var(--side);border-right:1px solid var(--line);padding:22px 12px 14px}.brand{font-size:17px;font-weight:650;padding:0 12px 20px;display:flex;align-items:center;gap:10px}.brand-mark{display:grid;place-items:center;width:29px;height:29px;background:var(--accent);color:white;border-radius:9px}.side-action,.session-option{display:block;width:100%;text-align:left;border-radius:9px;padding:10px 12px;font-size:13px}.side-action:hover,.session-option:hover{background:var(--hover)}.side-label{padding:24px 12px 10px;font-size:11px;font-weight:650;color:var(--muted)}#sessions{flex:1;min-height:0;overflow:auto}.session-option{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#sessions[data-state]{padding:10px 12px;font-size:12px}.side-footer{border-top:1px solid var(--line);padding:12px;font-size:12px;color:var(--muted)}.side-footer a{display:block;padding:4px 0}\n.main{display:flex;flex-direction:column;min-width:0;min-height:0}.topbar{height:61px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:0 28px}.top-title{font-weight:650}.top-status{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:12px}#socket{width:8px;height:8px;border-radius:50%;background:#d1ab5d;overflow:hidden;white-space:nowrap;text-indent:-999px}#socket[data-state=pass]{background:#37a174}#socket[data-state=fail]{background:#bf6060}\n.conversation{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column}.welcome{max-width:790px;margin:auto;padding:24px;text-align:center}.welcome h1{font-size:28px;letter-spacing:-.045em;font-weight:550}.welcome p{color:var(--muted);font-size:13px}#messages{list-style:none;width:min(100%,810px);margin:0 auto;padding:26px 26px 12px;flex:1;white-space:pre-wrap;overflow-wrap:anywhere}#messages li{margin:13px 0;padding:12px 15px;max-width:94%;border-radius:15px;line-height:1.75}#messages li[data-role=user]{margin-left:auto;max-width:78%;background:var(--bubble)}#messages li[data-role=assistant]{margin-right:auto;padding-left:2px}#messages li[data-role=event]{border-left:2px solid var(--line);padding:7px 10px;border-radius:0;color:var(--muted);font-size:12px}\n.composer-wrap{padding:8px 24px 24px}.composer{max-width:790px;margin:0 auto;border:1px solid #c6d6d9;border-radius:18px;padding:9px 12px;background:var(--bg)}.composer:focus-within{border-color:var(--focus);box-shadow:0 0 0 1px rgba(96,180,191,.15)}#message{resize:vertical;display:block;width:100%;min-height:56px;max-height:220px;border:0;outline:0!important;background:transparent;color:var(--ink);padding:9px;font-size:14px}#message::placeholder{color:var(--muted)}.compose-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.hint{color:var(--muted);font-size:11px;padding-left:8px}#send{background:var(--accent);color:white;border-radius:11px;padding:8px 18px;font-weight:650}\n#interaction{width:min(100%,790px);margin:0 auto}#interaction:not(:empty){padding:14px;border:1px solid #e0be84;border-radius:12px;background:#fff8ed}#interaction button{background:var(--accent);color:#fff;padding:8px 12px;border-radius:9px;margin:7px 7px 0 0}#diagnostic{text-align:center;font-size:11px;color:var(--muted);max-width:790px;margin:0 auto}.details{max-width:790px;margin:5px auto 0;color:var(--muted);font-size:12px}.details summary{cursor:pointer}.details span{display:block;padding:3px 0}[data-state=fail]:not(#socket){color:#b73737}\n@media(max-width:720px){.layout{display:flex;flex-direction:column}.sidebar{height:158px;padding:9px;border-right:0;border-bottom:1px solid var(--line)}.brand{padding:0 8px 6px}.side-footer,.side-label{display:none}#sessions{display:flex;gap:6px;flex:1}.session-option{flex:0 0 160px}.main{flex:1;min-height:0}.topbar{height:50px;padding:0 15px}.composer-wrap{padding:7px 11px 12px}#messages{padding:14px}}\n@media(prefers-color-scheme:dark){:root{--bg:#191c1e;--side:#151819;--ink:#e9eded;--muted:#a1afb1;--line:#333c3e;--accent:#60b4bf;--hover:#242b2c;--bubble:#2b3334;--focus:#60b4bf}.composer{border-color:#46585c}#send{color:#122629}#interaction:not(:empty){background:#302920;border-color:#856d43}}\n</style></head><body>\n<div class=\"layout\"><aside class=\"sidebar\" aria-label=\"会话导航\">\n<div class=\"brand\"><span class=\"brand-mark\">Δ</span>Delta</div>\n<button id=\"create\" class=\"side-action\" type=\"button\">＋ 新建对话</button>\n<button id=\"refresh\" class=\"side-action\" type=\"button\">↻ 刷新会话</button>\n<div class=\"side-label\">最近对话</div><nav id=\"sessions\" aria-label=\"最近会话\"></nav>\n<div class=\"side-footer\"><a href=\"/\">关闭 Delta 桌面</a></div>\n</aside><main class=\"main\">\n<header class=\"topbar\"><div class=\"top-title\">Delta · 独立对话</div><div class=\"top-status\"><span id=\"socket\" data-state=\"pending\">连接中</span>Harness Agent</div></header>\n<div class=\"conversation\" id=\"conversation\"><div id=\"welcome\" class=\"welcome\"><h1>有什么可以帮你？</h1><p>由 Harness 提供模型、会话和工具权限。</p></div><ol id=\"messages\" data-view=\"conversation\" aria-label=\"对话内容\"></ol></div>\n<div id=\"interaction\" role=\"region\" aria-label=\"待处理审批\"></div>\n<div class=\"composer-wrap\"><div class=\"composer\"><textarea id=\"message\" rows=\"2\" aria-label=\"发送消息\" placeholder=\"向 Delta 发送消息，Enter 发送，Shift+Enter 换行\"></textarea><div class=\"compose-actions\"><span class=\"hint\">使用当前 Harness 模型与工作区</span><button id=\"send\" type=\"button\">发送</button></div></div>\n<div id=\"diagnostic\" role=\"status\" aria-live=\"polite\"></div><details class=\"details\"><summary>连接详情</summary><span>认证 <strong id=\"auth\" data-state=\"pending\">检查中</strong></span><span>Session RPC <strong id=\"gateway\" data-state=\"pending\">等待中</strong></span><span>会话快照 <strong id=\"snapshot\" data-state=\"pending\">等待中</strong></span><span>会话标识 <strong id=\"current\" data-state=\"pending\">未选择</strong></span></details></div>\n</main></div><script nonce=\"__NONCE__\">__SCRIPT__</script></body></html>";
function document(nonce: string): string {
  return template.replaceAll('__NONCE__', nonce).replace('__SCRIPT__', standaloneDesktopBrowser)
}
export function registerIndependentApp(ctx: Context): void {
  const host = ctx as unknown as Host & {
    inject?: (deps: string[], callback: (child: unknown) => void) => unknown
  }
  host.inject?.(['connection', 'webServer'], (child: unknown) => {
    const scope = child as Host
    const web = scope.webServer ?? scope.get?.('webServer') as Web | undefined
    const connection = scope.connection ?? scope.get?.('connection') as Connection | undefined
    if (!web || !connection || !scope.effect) return
    scope.effect(() => {
      const disposeStatus = web.register({
        name: 'dsh-desktop-delta:app-status',
        kind: 'exact',
        path: INDEPENDENT_STATUS_PATH,
        handler(req, res) {
          const admitted = connection.admit(req)
          if ('rejection' in admitted) {
            res.writeHead(admitted.rejection, { 'cache-control': 'no-store' })
            res.end()
            return
          }
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
            res.end()
            return
          }
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
          res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ desktop: 'Delta Desktop', authenticated: true }))
        },
      })
      try {
        const disposeApp = web.register({
      name: 'dsh-desktop-delta:app',
      kind: 'exact',
      path: INDEPENDENT_APP_PATH,
      handler(req, res) {
        const admission = connection.admit(req)
        if ('rejection' in admission) {
          res.writeHead(admission.rejection, { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' })
          res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD', 'cache-control': 'no-store' })
          res.end()
          return
        }
        const nonce = randomBytes(18).toString('base64')
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
          'content-security-policy': "default-src 'none'; script-src 'nonce-" + nonce + "'; style-src 'nonce-" + nonce + "'; connect-src 'self' ws: wss:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        })
        res.end(req.method === 'HEAD' ? undefined : document(nonce))
      },
        })
        return () => { disposeApp(); disposeStatus() }
      } catch (error) {
        disposeStatus()
        throw error
      }
    }, 'dsh-desktop-delta: independent chat route')
  })
}

/**
 * Host-side network proxy controller for DeepSeek Harness.
 * Supports 3 explicit modes:
 * - 'system': Follows launch proxy environment or Windows Internet Settings proxy.
 * - 'direct': Clears proxy dispatchers/env for direct outbound requests.
 * - 'manual': Applies user-configured HTTP/HTTPS proxy + loopback-safe no_proxy.
 *
 * Installs dynamically via Node `undici` global dispatcher + process.env so all
 * Host LLM API, `web_fetch`, and plugin outbound fetch requests follow the active mode.
 */
import { loadNodeModule, makeJsonResponse, readRequestJson } from './host-state.js'
import type { HostStateStore, ProxyMode, ProxySettings } from './host-state.js'

export const DELTA_PROXY_PATH = '/api/delta-desktop/proxy'

const PROXY_ENV_KEYS = [
  'http_proxy',
  'HTTP_PROXY',
  'https_proxy',
  'HTTPS_PROXY',
  'all_proxy',
  'ALL_PROXY',
  'no_proxy',
  'NO_PROXY',
] as const

const LOOPBACK_ENTRIES = ['localhost', '127.0.0.1', '::1', '[::1]']

export interface EffectiveProxyState {
  mode: ProxyMode
  source: 'system-env' | 'system-registry' | 'direct' | 'manual'
  httpProxy?: string
  httpsProxy?: string
  noProxy: string
}

interface ProxyHostContext {
  get?(name: string): unknown
  inject?(deps: string[], cb: (scope: any) => void | (() => void)): () => void
}

type GlobalUrlCtor = new (raw: string) => { protocol: string; hostname: string; toString(): string }

function getUrlCtor(): GlobalUrlCtor {
  return (globalThis as unknown as { URL: GlobalUrlCtor }).URL
}

function getProc(): { platform?: string; env: Record<string, string | undefined> } | undefined {
  return (globalThis as unknown as { process?: { platform?: string; env: Record<string, string | undefined> } }).process
}

export function validateProxyUrl(raw: string): { ok: true; normalized: string } | { ok: false; reason: 'invalid' | 'socks' | 'scheme' } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, normalized: '' }
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    const UrlCtor = getUrlCtor()
    const parsed = new UrlCtor(withScheme)
    const proto = parsed.protocol.toLowerCase()
    if (proto.startsWith('socks')) return { ok: false, reason: 'socks' }
    if (proto !== 'http:' && proto !== 'https:') return { ok: false, reason: 'scheme' }
    return { ok: true, normalized: parsed.toString().replace(/\/$/, '') }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

export function mergeLoopbackNoProxy(rawNoProxy: string): string {
  const items = rawNoProxy
    .split(/[;,\s]+/)
    .map(s => s.trim())
    .filter(s => s && s !== '<local>')
  const out: string[] = []
  const seen = new Set<string>()
  for (const entry of [...items, ...LOOPBACK_ENTRIES]) {
    const k = entry.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(entry)
  }
  return out.join(',')
}

export function parseWindowsProxyServer(rawServer: string, overrideStr = ''): { httpProxy?: string; httpsProxy?: string; noProxy: string } {
  const trimmed = rawServer.trim()
  if (!trimmed) return { noProxy: mergeLoopbackNoProxy(overrideStr) }
  let httpProxy: string | undefined
  let httpsProxy: string | undefined
  if (trimmed.includes('=')) {
    for (const part of trimmed.split(';')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const key = part.slice(0, eq).trim().toLowerCase()
      const val = part.slice(eq + 1).trim()
      const checked = validateProxyUrl(val)
      if (!checked.ok || !checked.normalized) continue
      if (key === 'http') httpProxy = checked.normalized
      else if (key === 'https') httpsProxy = checked.normalized
    }
  } else {
    const checked = validateProxyUrl(trimmed)
    if (checked.ok && checked.normalized) {
      httpProxy = checked.normalized
      httpsProxy = checked.normalized
    }
  }
  return {
    ...(httpProxy ? { httpProxy } : {}),
    ...(httpsProxy ? { httpsProxy } : {}),
    noProxy: mergeLoopbackNoProxy(overrideStr),
  }
}

async function queryWindowsInternetProxy(): Promise<{ httpProxy?: string; httpsProxy?: string; noProxy: string } | undefined> {
  const proc = getProc()
  if (proc?.platform !== 'win32') return undefined
  try {
    const cp = await loadNodeModule<any>('node:child_process')
    const output: string = await new Promise((resolvePromise) => {
      cp.execFile(
        'reg',
        ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'],
        { timeout: 1500, windowsHide: true },
        (err: unknown, stdout: string) => {
          resolvePromise(err ? '' : String(stdout ?? ''))
        },
      )
    })
    if (!output) return undefined
    const enabledMatch = /^\s*ProxyEnable\s+REG_DWORD\s+0x([0-9a-fA-F]+)/m.exec(output)
    const enabled = enabledMatch ? Number.parseInt(enabledMatch[1], 16) !== 0 : false
    if (!enabled) return undefined
    const serverMatch = /^\s*ProxyServer\s+REG_SZ\s+(.+)$/m.exec(output)
    if (!serverMatch?.[1]) return undefined
    const overrideMatch = /^\s*ProxyOverride\s+REG_SZ\s+(.+)$/m.exec(output)
    return parseWindowsProxyServer(serverMatch[1], overrideMatch?.[1] ?? '')
  } catch {
    return undefined
  }
}

function readSnapshotEnvProxy(snap: Record<string, string | undefined>): { httpProxy?: string; httpsProxy?: string; noProxy: string } | undefined {
  const pick = (k: string): string | undefined => {
    const a = snap[k.toLowerCase()]?.trim()
    const b = snap[k.toUpperCase()]?.trim()
    return a || b || undefined
  }
  const all = pick('all_proxy')
  const rawHttp = pick('http_proxy') ?? all
  const rawHttps = pick('https_proxy') ?? all ?? rawHttp
  const noProxy = pick('no_proxy') ?? ''
  const vHttp = rawHttp ? validateProxyUrl(rawHttp) : { ok: true as const, normalized: '' }
  const vHttps = rawHttps ? validateProxyUrl(rawHttps) : { ok: true as const, normalized: '' }
  const httpProxy = vHttp.ok && vHttp.normalized ? vHttp.normalized : undefined
  const httpsProxy = vHttps.ok && vHttps.normalized ? vHttps.normalized : undefined
  if (!httpProxy && !httpsProxy) return undefined
  return {
    ...(httpProxy ? { httpProxy } : {}),
    ...(httpsProxy ? { httpsProxy } : {}),
    noProxy: mergeLoopbackNoProxy(noProxy),
  }
}

function writeProcessProxyEnv(effective: { httpProxy?: string; httpsProxy?: string; noProxy?: string } | undefined): void {
  const proc = getProc()
  if (!proc?.env) return
  if (!effective || (!effective.httpProxy && !effective.httpsProxy)) {
    for (const k of PROXY_ENV_KEYS) delete proc.env[k]
    return
  }
  delete proc.env.all_proxy
  delete proc.env.ALL_PROXY
  if (effective.httpProxy) {
    proc.env.http_proxy = effective.httpProxy
    proc.env.HTTP_PROXY = effective.httpProxy
  } else {
    delete proc.env.http_proxy
    delete proc.env.HTTP_PROXY
  }
  if (effective.httpsProxy) {
    proc.env.https_proxy = effective.httpsProxy
    proc.env.HTTPS_PROXY = effective.httpsProxy
  } else {
    delete proc.env.https_proxy
    delete proc.env.HTTPS_PROXY
  }
  const np = mergeLoopbackNoProxy(effective.noProxy ?? '')
  proc.env.no_proxy = np
  proc.env.NO_PROXY = np
}

function isLoopbackOrBypassed(hostname: string, noProxyList: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true
  for (const rawEntry of noProxyList.split(',')) {
    const entry = rawEntry.trim().toLowerCase()
    if (!entry) continue
    if (entry === '*') return true
    if (host === entry) return true
    if (entry.startsWith('.') && (host.endsWith(entry) || host === entry.slice(1))) return true
    if (!entry.startsWith('.') && host.endsWith('.' + entry)) return true
  }
  return false
}

export function installHostProxyManager(
  ctx: ProxyHostContext,
  store: HostStateStore,
  options?: { resolveSystemRegistryProxy?: () => Promise<{ httpProxy?: string; httpsProxy?: string; noProxy: string } | undefined> },
): {
  applySettings: (settings: ProxySettings) => Promise<EffectiveProxyState>
  getEffective: () => EffectiveProxyState
  dispose: () => Promise<void>
} {
  const initialEnv: Record<string, string | undefined> = {}
  const proc = getProc()
  if (proc?.env) {
    for (const k of PROXY_ENV_KEYS) initialEnv[k] = proc.env[k]
  }

  let initialDispatcher: unknown
  let activeAgent: { close?: () => Promise<void> } | undefined
  let disposed = false
  let effective: EffectiveProxyState = {
    mode: 'system',
    source: 'direct',
    noProxy: LOOPBACK_ENTRIES.join(','),
  }

  const resolveEffective = async (settings: ProxySettings): Promise<EffectiveProxyState> => {
    if (settings.mode === 'direct') {
      return {
        mode: 'direct',
        source: 'direct',
        noProxy: '',
      }
    }
    if (settings.mode === 'manual') {
      const httpCheck = validateProxyUrl(settings.httpProxy)
      const httpsCheck = validateProxyUrl(settings.httpsProxy || settings.httpProxy)
      const httpProxy = httpCheck.ok && httpCheck.normalized ? httpCheck.normalized : undefined
      const httpsProxy = httpsCheck.ok && httpsCheck.normalized ? httpsCheck.normalized : httpProxy
      const noProxy = mergeLoopbackNoProxy(settings.noProxy)
      if (!httpProxy && !httpsProxy) {
        return { mode: 'manual', source: 'direct', noProxy }
      }
      return {
        mode: 'manual',
        source: 'manual',
        ...(httpProxy ? { httpProxy } : {}),
        ...(httpsProxy ? { httpsProxy } : {}),
        noProxy,
      }
    }
    // System mode
    const envProxy = readSnapshotEnvProxy(initialEnv)
    if (envProxy) {
      return {
        mode: 'system',
        source: 'system-env',
        ...envProxy,
      }
    }
    const regProxy = await (options?.resolveSystemRegistryProxy ?? queryWindowsInternetProxy)()
    if (regProxy && (regProxy.httpProxy || regProxy.httpsProxy)) {
      return {
        mode: 'system',
        source: 'system-registry',
        ...regProxy,
      }
    }
    return {
      mode: 'system',
      source: 'direct',
      noProxy: LOOPBACK_ENTRIES.join(','),
    }
  }

  const applySettings = async (settings: ProxySettings): Promise<EffectiveProxyState> => {
    if (disposed) return effective
    const next = await resolveEffective(settings)
    if (disposed) return effective
    writeProcessProxyEnv(next)
    try {
      const undici = await loadNodeModule<any>('undici')
      if (typeof undici?.setGlobalDispatcher === 'function' && typeof undici?.Agent === 'function') {
        if (initialDispatcher === undefined && typeof undici.getGlobalDispatcher === 'function') {
          initialDispatcher = undici.getGlobalDispatcher()
        }
        const prevAgent = activeAgent
        let nextAgent: any
        if (!next.httpProxy && !next.httpsProxy) {
          nextAgent = new undici.Agent()
        } else if (typeof undici.ProxyAgent === 'function' && typeof undici.Pool === 'function') {
          const noProxyStr = next.noProxy
          nextAgent = new undici.Agent({
            factory(origin: unknown, poolOpts: Record<string, unknown>) {
              try {
                const UrlCtor = getUrlCtor()
                const u = new UrlCtor(String(origin))
                if (isLoopbackOrBypassed(u.hostname, noProxyStr)) {
                  return new undici.Pool(origin, poolOpts)
                }
                const proxyUrl = u.protocol === 'https:' ? (next.httpsProxy || next.httpProxy) : next.httpProxy
                if (proxyUrl) {
                  return new undici.ProxyAgent({ ...poolOpts, uri: proxyUrl })
                }
              } catch {}
              return new undici.Pool(origin, poolOpts)
            },
          })
        } else {
          nextAgent = new undici.Agent()
        }
        undici.setGlobalDispatcher(nextAgent)
        activeAgent = nextAgent
        if (prevAgent && prevAgent !== nextAgent) {
          void prevAgent.close?.().catch(() => {})
        }
      }
    } catch {
      // Env-only fallback if runtime lacks undici dynamic import
    }
    effective = next
    return next
  }

  // Initialize from saved state asynchronously only inside a real Host runtime
  if (typeof ctx.inject === 'function') {
    void store.read().then(st => {
      if (!disposed) return applySettings(st.proxy)
      return effective
    }).catch(() => {})
  }

  let unregisterHttp: (() => void) | undefined
  if (typeof ctx.inject === 'function') {
    try {
      unregisterHttp = ctx.inject(['connection'], (scope: {
        connection?: {
          fetch?: {
            register?: (spec: {
              path: string
              methods?: string[]
              requestBody?: string
              fetch: (req: { url?: string; method?: string; json?: () => Promise<unknown>; text?: () => Promise<string> }) => Promise<unknown>
            }) => () => void
          }
        }
      }) => {
        if (typeof scope?.connection?.fetch?.register !== 'function') return () => {}
        return scope.connection.fetch.register({
          path: DELTA_PROXY_PATH,
          methods: ['GET', 'POST'],
          requestBody: 'buffered',
          fetch: async (request) => {
            const method = (request?.method ?? 'GET').toUpperCase()
            if (method === 'GET') {
              const st = await store.read()
              const eff = await applySettings(st.proxy)
              return makeJsonResponse(200, { ok: true, proxy: st.proxy, effective: eff })
            }
            const body = await readRequestJson(request)
            const mode: ProxyMode = body.mode === 'direct' || body.mode === 'manual' ? body.mode : 'system'
            const rawHttp = typeof body.httpProxy === 'string' ? body.httpProxy.trim() : ''
            const rawHttps = typeof body.httpsProxy === 'string' ? body.httpsProxy.trim() : ''
            const rawNo = typeof body.noProxy === 'string' ? body.noProxy.trim() : ''

            let nextHttp = rawHttp
            let nextHttps = rawHttps
            if (mode === 'manual') {
              const cHttp = validateProxyUrl(rawHttp)
              if (!cHttp.ok) {
                return makeJsonResponse(400, { ok: false, error: 'INVALID_PROXY_URL', reason: cHttp.reason, field: 'httpProxy' })
              }
              const cHttps = validateProxyUrl(rawHttps)
              if (!cHttps.ok) {
                return makeJsonResponse(400, { ok: false, error: 'INVALID_PROXY_URL', reason: cHttps.reason, field: 'httpsProxy' })
              }
              nextHttp = cHttp.normalized
              nextHttps = cHttps.normalized
            }

            const updated = await store.update(cur => ({
              ...cur,
              proxy: {
                mode,
                httpProxy: nextHttp,
                httpsProxy: nextHttps,
                noProxy: rawNo,
              },
            }))
            const eff = await applySettings(updated.proxy)
            return makeJsonResponse(200, { ok: true, proxy: updated.proxy, effective: eff })
          },
        })
      })
    } catch {}
  }

  const dispose = async (): Promise<void> => {
    disposed = true
    try { unregisterHttp?.() } catch {}
    unregisterHttp = undefined
    if (proc?.env) {
      for (const k of PROXY_ENV_KEYS) {
        if (initialEnv[k] === undefined) delete proc.env[k]
        else proc.env[k] = initialEnv[k]
      }
    }
    try {
      const undici = await loadNodeModule<any>('undici')
      if (initialDispatcher !== undefined && typeof undici?.setGlobalDispatcher === 'function') {
        undici.setGlobalDispatcher(initialDispatcher)
      }
      if (activeAgent) {
        await activeAgent.close?.().catch(() => {})
        activeAgent = undefined
      }
    } catch {}
  }

  return {
    applySettings,
    getEffective: () => effective,
    dispose,
  }
}

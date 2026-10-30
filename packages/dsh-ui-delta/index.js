/**
 * Host half of Delta UI (DSH host, Node). It runs the two features that need a
 * server: the vision bridge and web search. The browser sends the request and
 * inserts the text it gets back; the API key is read here, sent only to the
 * endpoint the user configured, and never returned to the page.
 *
 * Config: ~/.dsh-ui-delta/config.json (directory 0700, file 0600). API keys are
 * encrypted with the Windows user's DPAPI (ConvertFrom-SecureString), so the file
 * holds ciphertext plus a masked hint, never the key. Where DPAPI is unavailable,
 * a key is kept in this process's memory only and is lost on restart.
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PLUGIN_DIR = join(import.meta.dirname || __dirname)

export const name = 'dsh-ui-delta'
export const inject = ['webServer']

const CONFIG_DIR = join(homedir(), '.dsh-ui-delta')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_CONFIG_BYTES = 64 * 1024
const ROUTE_REFUSAL = 'dsh-ui-delta: request refused'
const memoryKeys = new Map()

const readConfig = () => {
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {} } catch { return {} }
}

const writeConfig = (cfg) => {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 })
  try { chmodSync(CONFIG_FILE, 0o600) } catch { /* filesystem without POSIX modes */ }
}

const dpapiAvailable = () => process.platform === 'win32'

// Runs a PowerShell script with the input on stdin, so a key never appears on a
// command line or in a process listing.
const runPowerShell = (script, input) => new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
  let out = ''
  let err = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { err += d })
  child.on('error', reject)
  child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `exit ${code}`))))
  child.stdin.end(input)
})

const ENCRYPT = '$in=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $in -AsPlainText -Force | ConvertFrom-SecureString'
const DECRYPT = '$in=[Console]::In.ReadToEnd().Trim(); $s=ConvertTo-SecureString -String $in; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))'

const maskOf = (key) => (key ? `••••${key.slice(-4)}` : '')

// Cache key is per provider, not per feature: several providers can hold a key
// at once, and a plain per-section key would leak one provider's key into another.
const keySlot = (section, provider) => `${section}:${(provider && provider.id) || 'default'}`

// Returns the ciphertext to store, or null when the key went to memory instead.
const sealKey = async (slot, key) => {
  if (!dpapiAvailable()) { memoryKeys.set(slot, key); return null }
  memoryKeys.delete(slot)
  return runPowerShell(ENCRYPT, key)
}

const openKey = async (section, provider) => {
  const slot = keySlot(section, provider)
  if (memoryKeys.has(slot)) return memoryKeys.get(slot)
  if (!provider || !provider.apiKeyEnc || !dpapiAvailable()) return ''
  try {
    // decrypt once per process; the plaintext stays in memory only
    const key = await runPowerShell(DECRYPT, provider.apiKeyEnc)
    memoryKeys.set(slot, key)
    return key
  } catch { return '' }
}

const safeUrl = (value) => {
  const text = String(value || '').trim()
  if (text === '') return ''
  const url = new URL(text)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL must be http(s)')
  return text.replace(/\/+$/, '')
}

const providerId = () => Math.random().toString(36).slice(2, 10)

// Each feature holds a list, so several providers can be configured at once.
// The legacy single-provider shape is migrated in place on first read.
const normalizeProviders = (section, cur) => {
  const legacy = section === 'vision' ? (cur.baseUrl || cur.model || cur.apiKeyEnc)
    : (cur.endpoint || cur.apiKeyEnc)
  if (legacy && !Array.isArray(cur.providers)) {
    const p = { id: providerId(), label: '', active: true }
    if (section === 'vision') {
      p.baseUrl = cur.baseUrl || ''
      p.model = cur.model || ''
    } else {
      p.endpoint = cur.endpoint || ''
    }
    p.keyHint = cur.keyHint || ''
    if (cur.apiKeyEnc) p.apiKeyEnc = cur.apiKeyEnc
    cur.providers = [p]
  }
  delete cur.baseUrl
  delete cur.model
  delete cur.endpoint
  delete cur.apiKeyEnc
  delete cur.keyHint
  if (!Array.isArray(cur.providers)) cur.providers = []
  return cur.providers
}

const publicView = () => {
  const cfg = readConfig()
  const vision = normalizeProviders('vision', cfg.vision || {})
  const search = normalizeProviders('search', cfg.search || {})
  return {
    vision: { providers: vision.map((p) => ({ ...p, apiKeyEnc: undefined })) },
    search: { providers: search.map((p) => ({ ...p, apiKeyEnc: undefined })) },
    secureStorage: dpapiAvailable(),
  }
}

const updateConfig = async (body) => {
  const section = body.section === 'vision' || body.section === 'search' ? body.section : null
  if (!section) throw new Error('unknown section')
  const cfg = readConfig()
  const cur = { ...(cfg[section] || {}) }
  const prov = normalizeProviders(section, cur)

  if (body.addProvider === true) {
    prov.push({ id: providerId(), label: '', active: prov.length === 0 })
    cfg[section] = { providers: prov }
    writeConfig(cfg)
    return publicView()
  }
  if (body.removeProvider) {
    const idx = prov.findIndex((p) => p.id === body.removeProvider)
    if (idx >= 0) {
      prov.splice(idx, 1)
      // if the active one was removed, activate the first remaining
      if (!prov.some((p) => p.active) && prov.length) prov[0].active = true
    }
    cfg[section] = { providers: prov }
    writeConfig(cfg)
    return publicView()
  }
  if (body.provider && body.provider.id) {
    const idx = prov.findIndex((p) => p.id === body.provider.id)
    if (idx >= 0) {
      const p = prov[idx]
      if (typeof body.provider.label === 'string') p.label = body.provider.label.trim().slice(0, 80)
      if (section === 'vision') {
        if (typeof body.provider.baseUrl === 'string') p.baseUrl = safeUrl(body.provider.baseUrl)
        if (typeof body.provider.model === 'string') p.model = body.provider.model.trim().slice(0, 200)
      } else if (typeof body.provider.endpoint === 'string') {
        p.endpoint = safeUrl(body.provider.endpoint)
      }
      if (body.provider.active === true) {
        prov.forEach((pp, i) => { pp.active = i === idx })
      }
    }
    cfg[section] = { providers: prov }
    writeConfig(cfg)
    return publicView()
  }
  if (body.clearKey === true) {
    prov.forEach((p) => { p.apiKeyEnc = ''; p.keyHint = '' })
    memoryKeys.delete(section)
    cfg[section] = { providers: prov }
    writeConfig(cfg)
    return publicView()
  }
  if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') {
    const key = body.apiKey.trim()
    // write to the provider the caller named, else the active one, else the first
    const target = (body.provider && prov.find((p) => p.id === body.provider.id))
      || prov.find((p) => p.active) || prov[0]
    if (!target) throw new Error('no provider to attach the key to')
    const sealed = await sealKey(keySlot(section, target), key)
    if (sealed !== null) target.apiKeyEnc = sealed
    target.keyHint = maskOf(key)
    cfg[section] = { providers: prov }
    writeConfig(cfg)
    return publicView()
  }
  throw new Error('no-op')
}

const recognizeImage = async (bytes, mime) => {
  const cfg = readConfig().vision || {}
  const prov = normalizeProviders('vision', cfg)
  const active = prov.find((p) => p.active) || prov[0]
  if (!active || !active.baseUrl || !active.model) throw new Error('vision model is not configured')
  const key = await openKey('vision', active)

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  const res = await fetch(`${active.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: active.model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: '请描述这张图片的内容，并逐字转写其中的文字。只输出识别结果。' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

const searchWeb = async (query) => {
  const cfg = readConfig().search || {}
  const prov = normalizeProviders('search', cfg)
  const active = prov.find((p) => p.active) || prov[0]
  if (!active || !active.endpoint) throw new Error('search endpoint is not configured')
  const key = await openKey('search', active)
  const res = await fetch(active.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const list = Array.isArray(data?.results) ? data.results : []
  return list.slice(0, 5).map((x) => ({
    title: String(x.title || ''),
    url: String(x.url || ''),
    content: String(x.content || '').slice(0, 300),
  }))
}

// Same fence as the modlens routes: loopback host only, and no cross-site request.
const isLoopbackHost = (hostname) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)

const isTrustedRequest = (req) => {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try { hostUrl = new URL(`http://${host}`) } catch { return false }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch { return false }
}

const readBody = async (req, limit) => {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function apply(ctx) {
  // without a web server there is nowhere to serve the routes; the plugin stays inert
  if (!ctx?.webServer) return
  const route = (path, handler) => {
    try {
      ctx.webServer.register({
        name: `dsh-ui-delta${path.replace(/\//g, '-')}`,
        kind: 'exact',
        path,
        handler: async (req, res) => {
          if (!isTrustedRequest(req)) {
            sendJson(res, 403, { error: ROUTE_REFUSAL })
            return
          }
          try {
            await handler(req, res)
          } catch (err) {
            // errors carry no key and no request body
            sendJson(res, 500, { error: String(err?.message || err) })
          }
        },
      })
    } catch (err) {
      if (String(err?.message || err).includes('duplicate')) {
        return
      }
      throw err
    }
  }

  route('/dsh-ui-delta/config', async (req, res) => {
    if (req.method === 'GET') return sendJson(res, 200, publicView())
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
      return sendJson(res, 200, await updateConfig(body))
    }
    return sendJson(res, 405, { error: 'method not allowed' })
  })

  route('/dsh-ui-delta/vision', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const mime = String(req.headers['content-type'] || '')
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) return sendJson(res, 415, { error: 'image required' })
    const bytes = await readBody(req, MAX_IMAGE_BYTES)
    return sendJson(res, 200, { text: await recognizeImage(bytes, mime) })
  })

  route('/dsh-ui-delta/search', async (req, res) => {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
    const body = JSON.parse((await readBody(req, MAX_CONFIG_BYTES)).toString('utf8') || '{}')
    const query = String(body.query || '').trim().slice(0, 500)
    if (query === '') return sendJson(res, 400, { error: 'query required' })
    return sendJson(res, 200, { results: await searchWeb(query) })
  })

  // version endpoint: client polls once on load to detect if a new version is on disk
  route('/dsh-ui-delta/version', async (req, res) => {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
    try {
      const { version } = JSON.parse(await readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'))
      return sendJson(res, 200, { version })
    } catch {
      return sendJson(res, 500, { error: 'version unreadable' })
    }
  })
}

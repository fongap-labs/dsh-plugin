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
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional host web server; without it the plugin stays inert. */
    webServer?: WebServerService
  }
}

/** Route registration accepted by the host web server. */
interface WebServerRoute {
  name: string
  kind: 'exact'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The subset of the host web server service this plugin relies on. */
interface WebServerService {
  register(route: WebServerRoute): unknown
}

/** One configured provider. Several can be stored per feature. */
interface ProviderRecord {
  id: string
  label: string
  active: boolean
  baseUrl?: string
  model?: string
  endpoint?: string
  apiKeyEnc?: string
  keyHint?: string
}

/** One feature section, including the single-provider shape it migrates from. */
interface SectionConfig {
  providers?: ProviderRecord[]
  baseUrl?: string
  model?: string
  endpoint?: string
  apiKeyEnc?: string
  keyHint?: string
}

/** Whole config file. */
interface ConfigFile {
  vision?: SectionConfig
  search?: SectionConfig
}

/** Feature section name. */
type Section = 'vision' | 'search'

/** Provider fields a client may update. */
interface ProviderInput {
  id?: string
  label?: string
  baseUrl?: string
  model?: string
  endpoint?: string
  active?: boolean
}

/** Config update posted by the browser. */
interface UpdateConfigBody {
  section?: string
  addProvider?: boolean
  removeProvider?: string
  provider?: ProviderInput
  clearKey?: boolean
  apiKey?: string
}

/** Config view returned to the page: ciphertext is never included. */
interface PublicView {
  vision: { providers: ProviderRecord[] }
  search: { providers: ProviderRecord[] }
  secureStorage: boolean
}

// `lib/index.js` sits one level below the package root, which holds package.json.
const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))

export const name = 'dsh-ui-delta'
export const inject = ['webServer']

const CONFIG_DIR = join(homedir(), '.dsh-ui-delta')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_CONFIG_BYTES = 64 * 1024
const ROUTE_REFUSAL = 'dsh-ui-delta: request refused'
const memoryKeys = new Map<string, string>()

/** Render an unknown thrown value as a message. */
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const readConfig = (): ConfigFile => {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}
  } catch {
    return {}
  }
}

const writeConfig = (config: ConfigFile): void => {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  try {
    chmodSync(CONFIG_FILE, 0o600)
  } catch {
    /* filesystem without POSIX modes */
  }
}

const dpapiAvailable = (): boolean => process.platform === 'win32'

// Runs a PowerShell script with the input on stdin, so a key never appears on a
// command line or in a process listing.
const runPowerShell = (script: string, input: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (data) => {
      out += data
    })
    child.stderr.on('data', (data) => {
      err += data
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `exit ${code}`)),
    )
    child.stdin.end(input)
  })

const ENCRYPT =
  '$in=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $in -AsPlainText -Force | ConvertFrom-SecureString'
const DECRYPT =
  '$in=[Console]::In.ReadToEnd().Trim(); $s=ConvertTo-SecureString -String $in; [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))'

const maskOf = (key: string): string => (key ? `••••${key.slice(-4)}` : '')

// Cache key is per provider, not per feature: several providers can hold a key
// at once, and a plain per-section key would leak one provider's key into another.
const keySlot = (section: Section, provider: ProviderRecord | undefined): string =>
  `${section}:${provider?.id || 'default'}`

// Returns the ciphertext to store, or null when the key went to memory instead.
const sealKey = async (slot: string, key: string): Promise<string | null> => {
  if (!dpapiAvailable()) {
    memoryKeys.set(slot, key)
    return null
  }
  memoryKeys.delete(slot)
  return runPowerShell(ENCRYPT, key)
}

const openKey = async (section: Section, provider: ProviderRecord | undefined): Promise<string> => {
  const slot = keySlot(section, provider)
  const cached = memoryKeys.get(slot)
  if (cached !== undefined) return cached
  if (!provider || !provider.apiKeyEnc || !dpapiAvailable()) return ''
  try {
    // decrypt once per process; the plaintext stays in memory only
    const key = await runPowerShell(DECRYPT, provider.apiKeyEnc)
    memoryKeys.set(slot, key)
    return key
  } catch {
    return ''
  }
}

const safeUrl = (value: string): string => {
  const text = String(value || '').trim()
  if (text === '') return ''
  const url = new URL(text)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('URL must be http(s)')
  return text.replace(/\/+$/, '')
}

const providerId = (): string => Math.random().toString(36).slice(2, 10)

// Each feature holds a list, so several providers can be configured at once.
// The legacy single-provider shape is migrated in place on first read.
const normalizeProviders = (section: Section, current: SectionConfig): ProviderRecord[] => {
  const legacy =
    section === 'vision'
      ? current.baseUrl || current.model || current.apiKeyEnc
      : current.endpoint || current.apiKeyEnc
  if (legacy && !Array.isArray(current.providers)) {
    const provider: ProviderRecord = { id: providerId(), label: '', active: true }
    if (section === 'vision') {
      provider.baseUrl = current.baseUrl || ''
      provider.model = current.model || ''
    } else {
      provider.endpoint = current.endpoint || ''
    }
    provider.keyHint = current.keyHint || ''
    if (current.apiKeyEnc) provider.apiKeyEnc = current.apiKeyEnc
    current.providers = [provider]
  }
  delete current.baseUrl
  delete current.model
  delete current.endpoint
  delete current.apiKeyEnc
  delete current.keyHint
  if (!Array.isArray(current.providers)) current.providers = []
  return current.providers
}

const publicView = (): PublicView => {
  const cfg = readConfig()
  const vision = normalizeProviders('vision', cfg.vision || {})
  const search = normalizeProviders('search', cfg.search || {})
  return {
    vision: { providers: vision.map((provider) => ({ ...provider, apiKeyEnc: undefined })) },
    search: { providers: search.map((provider) => ({ ...provider, apiKeyEnc: undefined })) },
    secureStorage: dpapiAvailable(),
  }
}

const updateConfig = async (body: UpdateConfigBody): Promise<PublicView> => {
  const section: Section | null =
    body.section === 'vision' || body.section === 'search' ? body.section : null
  if (!section) throw new Error('unknown section')
  const cfg = readConfig()
  const current: SectionConfig = { ...(cfg[section] || {}) }
  const providers = normalizeProviders(section, current)

  if (body.addProvider === true) {
    providers.push({ id: providerId(), label: '', active: providers.length === 0 })
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  if (body.removeProvider) {
    const index = providers.findIndex((provider) => provider.id === body.removeProvider)
    if (index >= 0) {
      providers.splice(index, 1)
      // if the active one was removed, activate the first remaining
      if (!providers.some((provider) => provider.active) && providers.length) {
        providers[0]!.active = true
      }
    }
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  const input = body.provider
  if (input && input.id) {
    const index = providers.findIndex((provider) => provider.id === input.id)
    if (index >= 0) {
      const provider = providers[index]!
      if (typeof input.label === 'string') provider.label = input.label.trim().slice(0, 80)
      if (section === 'vision') {
        if (typeof input.baseUrl === 'string') provider.baseUrl = safeUrl(input.baseUrl)
        if (typeof input.model === 'string') provider.model = input.model.trim().slice(0, 200)
      } else if (typeof input.endpoint === 'string') {
        provider.endpoint = safeUrl(input.endpoint)
      }
      if (input.active === true) {
        providers.forEach((candidate, position) => {
          candidate.active = position === index
        })
      }
    }
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  if (body.clearKey === true) {
    providers.forEach((provider) => {
      provider.apiKeyEnc = ''
      provider.keyHint = ''
    })
    memoryKeys.delete(section)
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  if (typeof body.apiKey === 'string' && body.apiKey.trim() !== '') {
    const key = body.apiKey.trim()
    // write to the provider the caller named, else the active one, else the first
    const target =
      (input && providers.find((provider) => provider.id === input.id)) ||
      providers.find((provider) => provider.active) ||
      providers[0]
    if (!target) throw new Error('no provider to attach the key to')
    const sealed = await sealKey(keySlot(section, target), key)
    if (sealed !== null) target.apiKeyEnc = sealed
    target.keyHint = maskOf(key)
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  throw new Error('no-op')
}

const recognizeImage = async (bytes: Buffer, mime: string): Promise<string> => {
  const cfg = readConfig().vision || {}
  const providers = normalizeProviders('vision', cfg)
  const active = providers.find((provider) => provider.active) || providers[0]
  if (!active || !active.baseUrl || !active.model) {
    throw new Error('vision model is not configured')
  }
  const key = await openKey('vision', active)

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
  const response = await fetch(`${active.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: active.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '请描述这张图片的内容，并逐字转写其中的文字。只输出识别结果。' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return String(data?.choices?.[0]?.message?.content || '').trim()
}

/** One search hit as returned by a Tavily-compatible endpoint. */
interface SearchHit {
  title?: unknown
  url?: unknown
  content?: unknown
}

const searchWeb = async (query: string): Promise<Array<{ title: string; url: string; content: string }>> => {
  const cfg = readConfig().search || {}
  const providers = normalizeProviders('search', cfg)
  const active = providers.find((provider) => provider.active) || providers[0]
  if (!active || !active.endpoint) throw new Error('search endpoint is not configured')
  const key = await openKey('search', active)
  const response = await fetch(active.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 5 }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as { results?: SearchHit[] }
  const list: SearchHit[] = Array.isArray(data?.results) ? data.results : []
  return list.slice(0, 5).map((hit) => ({
    title: String(hit.title || ''),
    url: String(hit.url || ''),
    content: String(hit.content || '').slice(0, 300),
  }))
}

// Same fence as the modlens routes: loopback host only, and no cross-site request.
const isLoopbackHost = (hostname: string): boolean =>
  ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname)

const isTrustedRequest = (req: IncomingMessage): boolean => {
  const host = req.headers?.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHost(hostUrl.hostname)) return false
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

const readBody = async (req: IncomingMessage, limit: number): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('payload too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

export function apply(ctx: Context): void {
  // without a web server there is nowhere to serve the routes; the plugin stays inert
  const webServer = ctx?.webServer
  if (!webServer) return

  const route = (
    path: string,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
  ): void => {
    try {
      webServer.register({
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
          } catch (error) {
            // errors carry no key and no request body
            sendJson(res, 500, { error: errorMessage(error) })
          }
        },
      })
    } catch (error) {
      if (errorMessage(error).includes('duplicate')) {
        return
      }
      throw error
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
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mime)) {
      return sendJson(res, 415, { error: 'image required' })
    }
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
      const manifest = JSON.parse(
        readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'),
      ) as { version?: string }
      return sendJson(res, 200, { version: manifest.version })
    } catch {
      return sendJson(res, 500, { error: 'version unreadable' })
    }
  })
}

import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** One configured provider. Several can be stored per feature. */
export interface ProviderRecord {
  id: string
  label: string
  active: boolean
  baseUrl?: string
  model?: string
  endpoint?: string
  apiKeyEnc?: string
  keyHint?: string
}

/** One service section, including the single-provider shape it migrates from. */
export interface SectionConfig {
  fallbackToKeyless?: boolean
  providers?: ProviderRecord[]
  baseUrl?: string
  model?: string
  endpoint?: string
  apiKeyEnc?: string
  keyHint?: string
}

/** Whole config file. */
export interface ConfigFile {
  vision?: SectionConfig
  visionModel?: string
  visionOptions?: { temperature?: number; maxTokens?: number }
  search?: SectionConfig
  imageGen?: ImageGenConfig
}

/** Optional model-name override for image generation. */
export interface ImageGenConfig {
  model?: string
}

/** Feature section name. */
export type Section = 'search'

/** Provider fields a client may update. */
export interface ProviderInput {
  id?: string
  label?: string
  baseUrl?: string
  model?: string
  endpoint?: string
  active?: boolean
  apiKey?: string
}

/** Config update posted by the browser. */
export interface UpdateConfigBody {
  section?: string
  addProvider?: boolean
  removeProvider?: string
  provider?: ProviderInput
  clearKey?: boolean
  fallbackToKeyless?: boolean
  apiKey?: string
  baseUrl?: string
  model?: string
  temperature?: unknown
  maxTokens?: unknown
}

/** Config view returned to the page: ciphertext is never included. */
export interface PublicView {
  visionModel: string
  visionOptions: { temperature?: number; maxTokens?: number }
  search: { providers: ProviderRecord[]; fallbackToKeyless: boolean }
  imageGen: { model: string }
  secureStorage: boolean
}


const CONFIG_DIR = join(homedir(), '.dsh-ui-delta')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const memoryKeys = new Map<string, string>()

export const readConfig = (): ConfigFile => {
  try {
    const config: ConfigFile = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}
    if (config.visionModel === undefined) {
      const legacy = config.vision
      config.visionModel = legacy?.providers?.find(provider => provider.active)?.model
        || legacy?.providers?.[0]?.model || legacy?.model || ''
    }
    return config
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

export const openKey = async (section: Section, provider: ProviderRecord | undefined): Promise<string> => {
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

// Search can hold several providers. The legacy single-provider shape is
// migrated in place on first read.
export const normalizeProviders = (section: Section, current: SectionConfig): ProviderRecord[] => {
  const legacy = current.endpoint || current.apiKeyEnc
  if (legacy && !Array.isArray(current.providers)) {
    const provider: ProviderRecord = { id: providerId(), label: '', active: true }
    provider.endpoint = current.endpoint || ''
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

export const publicView = (): PublicView => {
  const cfg = readConfig()
  const search = normalizeProviders('search', cfg.search || {})
  return {
    visionModel: cfg.visionModel || '',
    visionOptions: cfg.visionOptions || {},
    search: { providers: search.map((provider) => ({ ...provider, apiKeyEnc: undefined })), fallbackToKeyless: cfg.search?.fallbackToKeyless === true },
    imageGen: {
      model: cfg.imageGen?.model || '',
    },
    secureStorage: dpapiAvailable(),
  }
}

export const updateConfig = async (body: UpdateConfigBody): Promise<PublicView> => {
  const section: Section | 'visionModel' | 'imageGen' | null =
    body.section === 'visionModel' ? 'visionModel' :
    body.section === 'imageGen' ? 'imageGen' :
    body.section === 'search' ? body.section : null
  if (!section) throw new Error('unknown section')
  const cfg = readConfig()
  if (section === 'visionModel') {
    cfg.visionModel = typeof body.model === 'string' ? body.model.trim().slice(0, 200) : cfg.visionModel || ''
    const options = { ...cfg.visionOptions }
    for (const [name, min, max] of [['temperature', 0, 2], ['maxTokens', 1, 65536]] as const) {
      const value = body[name]
      if (value === undefined) continue
      if (value === '' || value === null) { delete options[name]; continue }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
        || (name === 'maxTokens' && !Number.isInteger(value))) throw new Error(`invalid ${name}`)
      options[name] = value
    }
    cfg.visionOptions = options
    writeConfig(cfg)
    return publicView()
  }
  if (section === 'imageGen') {
    cfg.imageGen = {
      model: typeof body.model === 'string' ? body.model.trim().slice(0, 200) : cfg.imageGen?.model || '',
    }
    writeConfig(cfg)
    return publicView()
  }
  const current: SectionConfig = { ...(cfg[section] || {}) }
  const providers = normalizeProviders(section, current)
  if (typeof body.fallbackToKeyless === 'boolean') {
    current.fallbackToKeyless = body.fallbackToKeyless
    cfg[section] = current
    writeConfig(cfg)
    return publicView()
  }

  if (body.addProvider === true) {
    providers.push({ id: providerId(), label: '', active: providers.length === 0 })
    cfg[section] = { providers }
    writeConfig(cfg)
    return publicView()
  }
  if (body.removeProvider) {
    const index = providers.findIndex((provider) => provider.id === body.removeProvider)
    if (index >= 0) {
      memoryKeys.delete(keySlot(section, providers[index]))
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
      if (typeof input.endpoint === 'string') {
        provider.endpoint = safeUrl(input.endpoint)
      }
      if (typeof input.apiKey === 'string' && input.apiKey.trim() !== '') {
        const key = input.apiKey.trim()
        const sealed = await sealKey(keySlot(section, provider), key)
        if (sealed !== null) provider.apiKeyEnc = sealed
        provider.keyHint = maskOf(key)
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
    for (const provider of providers) memoryKeys.delete(keySlot(section, provider))
    memoryKeys.delete(keySlot(section, undefined))
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

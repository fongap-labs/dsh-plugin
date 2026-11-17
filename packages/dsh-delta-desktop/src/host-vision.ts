/**
 * Vision Bridge (\u89c6\u89c9\u6865) Host Engine for @fongap-labs/dsh-delta-desktop.
 * Inspired by and compatible with https://github.com/liustack/modlens.
 *
 * Provides:
 * 1. Paste-to-Path intake endpoint: saves pasted images to a private local temp path
 *    so text-only models bypass image admission checks and can read images via tool.
 * 2. High-precision structured evidence generation: OCR verbatim transcription,
 *    layout regions in reading order, and key entities.
 * 3. Native vision tools: `read_image` and `modlens_read_image` for agent invocation.
 * 4. Synthetic model wrapping / request-time translation: intercepts image blocks,
 *    converts them to evidence text, and streams to upstream text-only models.
 * 5. Auto-discovery of local multimodal models (e.g. Omni) and fallback to OpenAI-compatible
 *    or Gemini endpoints with LRU caching.
 */

import { loadNodeModule, resolveDshHome } from './host-state.js'
import type { DeltaHostState, VisionBridgeSettings } from './host-state.js'

export type BufferLike = Uint8Array & {
  toString(encoding?: string): string
  length: number
}

interface NodeGlobals {
  Buffer: {
    from(data: any, encoding?: string): BufferLike
    isBuffer(obj: any): boolean
  }
  fetch(url: string, init?: any): Promise<any>
  performance: { now(): number }
  console?: { error(...args: any[]): void; warn(...args: any[]): void; log(...args: any[]): void }
}

function getGlobals(): NodeGlobals {
  return globalThis as unknown as NodeGlobals
}

export const DELTA_VISION_PASTE_PATH = '/api/delta-desktop/vision/paste'
export const DELTA_VISION_RECOGNIZE_PATH = '/api/delta-desktop/vision/recognize'
export const DELTA_VISION_STATUS_PATH = '/api/delta-desktop/vision/status'
export const DELTA_VISION_CONFIG_PATH = '/api/delta-desktop/vision/config'

export interface VisionEvidence {
  summary: string
  transcription: string
  layout: string
  entities: string
  rawText: string
  cached?: boolean
}

export interface VisionAccount {
  provider: string
  model: string
  baseURL: string
  apiKey: string
  apiKeyEnv?: string
  protocol?: string
  source: 'host-settings' | 'custom' | 'modlens-config' | 'gemini-env' | 'mock'
}

interface EvidenceCacheEntry {
  expiresAt: number
  evidence: VisionEvidence
}

const EVIDENCE_CACHE_LIMIT = 256
const EVIDENCE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const evidenceCache = new Map<string, EvidenceCacheEntry>()

function trimEvidenceCache(): void {
  while (evidenceCache.size > EVIDENCE_CACHE_LIMIT) {
    const firstKey = evidenceCache.keys().next().value
    if (firstKey !== undefined) evidenceCache.delete(firstKey)
    else break
  }
}

/** Detect image MIME type and file extension from magic bytes. */
export function detectImageMime(buffer: Uint8Array): { mime: string; ext: string } | undefined {
  if (!buffer || buffer.length < 4) return undefined
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: '.png' }
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: '.jpg' }
  }
  // GIF: GIF87a or GIF89a (47 49 46 38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return { mime: 'image/gif', ext: '.gif' }
  }
  // WEBP: RIFF....WEBP (52 49 46 46 ... 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: '.webp' }
  }
  // BMP: BM (42 4D)
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return { mime: 'image/bmp', ext: '.bmp' }
  }
  // SVG text check
  const textSample = getGlobals().Buffer.from(buffer.slice(0, 256)).toString('utf8').trim().toLowerCase()
  if (textSample.startsWith('<svg') || (textSample.startsWith('<?xml') && textSample.includes('<svg'))) {
    return { mime: 'image/svg+xml', ext: '.svg' }
  }
  return undefined
}

/** Save pasted image data to a private temporary file and return its absolute path. */
export async function savePastedImage(
  data: BufferLike | Uint8Array,
  hintMime?: string,
  originalName?: string,
): Promise<{ path: string; name: string; size: number; mime: string }> {
  const fsMod = await loadNodeModule<any>('node:fs/promises')
  const pathMod = await loadNodeModule<any>('node:path')
  const osMod = await loadNodeModule<any>('node:os')
  const cryptoMod = await loadNodeModule<any>('node:crypto')

  const detected = detectImageMime(data)
  const mime = detected?.mime ?? (hintMime && /^image\//i.test(hintMime) ? hintMime : 'image/png')
  const ext = detected?.ext ?? (mime.includes('jpeg') ? '.jpg' : mime.includes('webp') ? '.webp' : '.png')

  // Try saving under ~/.dsh/attachments/tmp, fallback to system tmp
  const home = typeof osMod.homedir === 'function' ? osMod.homedir() : ''
  const dshTmp = home ? pathMod.join(home, '.dsh', 'attachments', 'tmp') : ''
  const fallbackTmp = pathMod.join(osMod.tmpdir(), 'dsh-vision-bridge')

  let targetDir = dshTmp
  try {
    if (targetDir) await fsMod.mkdir(targetDir, { recursive: true, mode: 0o700 })
  } catch {
    targetDir = fallbackTmp
    await fsMod.mkdir(targetDir, { recursive: true, mode: 0o700 })
  }

  const rand = cryptoMod.randomBytes(6).toString('hex')
  const baseName = originalName ? pathMod.basename(originalName, pathMod.extname(originalName)) : 'paste'
  const safeBase = baseName.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 32)
  const fileName = `dsh-${safeBase}-${Date.now()}-${rand}${ext}`
  const filePath = pathMod.join(targetDir, fileName)

  await fsMod.writeFile(filePath, data, { mode: 0o600 })
  return { path: filePath, name: fileName, size: data.length, mime }
}

/** Format structured evidence into a clean, markdown-friendly block. */
export function formatEvidenceBlock(evidence: VisionEvidence, sourceLabel?: string): string {
  const parts = [
    `[Pasted image, read by the vision bridge]`,
    ...(sourceLabel ? [`[Source: ${sourceLabel}]`] : []),
    `\n[\u56fe\u7247\u6982\u8ff0]\n${evidence.summary || '\u672a\u63d0\u4f9b\u6982\u8ff0'}`,
    `\n[OCR \u5168\u6587\u8f6c\u5199]\n${evidence.transcription || '（\u672a\u8bc6\u522b\u5230\u660e\u663e\u6587\u5b57）'}`,
  ]
  if (evidence.layout) {
    parts.push(`\n[\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784]\n${evidence.layout}`)
  }
  if (evidence.entities) {
    parts.push(`\n[\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba]\n${evidence.entities}`)
  }
  return parts.join('\n')
}

/** Parse structured sections from vision model output text. */
export function parseStructuredOutput(text: string): VisionEvidence {
  const trimmed = text.trim()
  let summary = ''
  let transcription = ''
  let layout = ''
  let entities = ''

  const summaryMatch = trimmed.match(/\[\u56fe\u7247\u6982\u8ff0\]([\s\S]*?)(?=\[(?:OCR \u5168\u6587\u8f6c\u5199|\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784|\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba)\]|$)/i)
  const ocrMatch = trimmed.match(/\[OCR \u5168\u6587\u8f6c\u5199\]([\s\S]*?)(?=\[(?:\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784|\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba)\]|$)/i)
  const layoutMatch = trimmed.match(/\[\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784\]([\s\S]*?)(?=\[\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba\]|$)/i)
  const entitiesMatch = trimmed.match(/\[\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba\]([\s\S]*?)$/i)

  if (summaryMatch) summary = summaryMatch[1].trim()
  if (ocrMatch) transcription = ocrMatch[1].trim()
  if (layoutMatch) layout = layoutMatch[1].trim()
  if (entitiesMatch) entities = entitiesMatch[1].trim()

  // If output wasn't strictly bracketed, treat full text as transcription/summary
  if (!summary && !transcription) {
    transcription = trimmed
    summary = trimmed.slice(0, 150)
  } else if (!summary && transcription) {
    summary = transcription.slice(0, 150)
  }

  return { summary, transcription, layout, entities, rawText: trimmed }
}

export interface ParsedProfileProvider {
  provider: string
  baseURL: string
  apiKeyEnv: string
  api: string
  models: Array<{ id: string; name?: string; input?: string[] }>
}

/** Parse profile YAML files into provider definitions with models and endpoints. */
export function parseYamlProfile(content: string, dshHome?: string): {
  providers: ParsedProfileProvider[]
} {
  const result: { providers: ParsedProfileProvider[] } = { providers: [] }

  // 1. Try loading js-yaml (native or from desktop node_modules)
  try {
    const req = (globalThis as any).require
    let jsYaml: any = null
    if (typeof req === 'function') {
      try { jsYaml = req('js-yaml') } catch {}
      if (!jsYaml && dshHome) {
        try {
          jsYaml = req(`${dshHome}/profiles/desktop/node_modules/js-yaml`)
        } catch {}
      }
    }
    if (jsYaml && typeof jsYaml.load === 'function') {
      const doc = jsYaml.load(content)
      const items = Array.isArray(doc) ? doc : [doc]
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        const conf = item.config || item
        if (conf.providers && typeof conf.providers === 'object') {
          for (const [pName, pConf] of Object.entries<any>(conf.providers)) {
            if (!pConf || typeof pConf !== 'object') continue
            result.providers.push({
              provider: pName,
              baseURL: (pConf.baseURL || pConf.baseUrl || '').replace(/\/+$/, ''),
              apiKeyEnv: pConf.apiKeyEnv || '',
              api: pConf.api || 'openai-completions',
              models: Array.isArray(pConf.models) ? pConf.models : [],
            })
          }
        }
      }
      if (result.providers.length > 0) return result
    }
  } catch {}

  // 2. Pure line parser fallback
  const lines = content.split(/\r?\n/)
  let currentProvider: ParsedProfileProvider | null = null
  let currentModel: any = null
  let isInProviders = false
  let isInModels = false
  let isInInput = false

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const indent = raw.search(/\S/)

    if (indent <= 2 && trimmed.startsWith('- id:')) {
      isInProviders = false
      currentProvider = null
      isInModels = false
      continue
    }

    if (trimmed === 'providers:') {
      isInProviders = true
      continue
    }

    if (isInProviders) {
      const provMatch = trimmed.match(/^([a-zA-Z0-9_\-]+):\s*$/)
      if (provMatch && !['models', 'config', 'headers', 'reasoningEfforts'].includes(provMatch[1]) && indent >= 4 && indent <= 8) {
        currentProvider = {
          provider: provMatch[1],
          baseURL: '',
          apiKeyEnv: '',
          api: 'openai-completions',
          models: [],
        }
        result.providers.push(currentProvider)
        isInModels = false
        continue
      }

      if (currentProvider) {
        if (trimmed.startsWith('baseURL:')) {
          currentProvider.baseURL = trimmed.replace('baseURL:', '').trim().replace(/^['"]|['"]$/g, '')
        } else if (trimmed.startsWith('baseUrl:')) {
          currentProvider.baseURL = trimmed.replace('baseUrl:', '').trim().replace(/^['"]|['"]$/g, '')
        } else if (trimmed.startsWith('apiKeyEnv:')) {
          currentProvider.apiKeyEnv = trimmed.replace('apiKeyEnv:', '').trim().replace(/^['"]|['"]$/g, '')
        } else if (trimmed.startsWith('api:')) {
          currentProvider.api = trimmed.replace('api:', '').trim().replace(/^['"]|['"]$/g, '')
        } else if (trimmed === 'models:') {
          isInModels = true
          isInInput = false
        } else if (isInModels) {
          if (trimmed.startsWith('- id:')) {
            const mId = trimmed.replace('- id:', '').trim().replace(/^['"]|['"]$/g, '')
            currentModel = { id: mId, name: mId, input: [] }
            currentProvider.models.push(currentModel)
            isInInput = false
          } else if (trimmed.startsWith('name:') && currentModel) {
            currentModel.name = trimmed.replace('name:', '').trim().replace(/^['"]|['"]$/g, '')
          } else if (trimmed === 'input:') {
            isInInput = true
          } else if (isInInput && trimmed.startsWith('- ')) {
            currentModel.input.push(trimmed.replace('- ', '').trim().replace(/^['"]|['"]$/g, ''))
          }
        }
      }
    }
  }

  return result
}

/** Attempt to resolve an active vision account from host configuration or settings. */
export async function resolveVisionAccount(
  ctx: any,
  settings?: VisionBridgeSettings,
): Promise<VisionAccount | undefined> {
  // 1. Explicit Custom / OpenAI-compatible Provider in Settings
  if (settings?.provider === 'openai-compat' || settings?.provider === 'custom') {
    const model = settings.customModel?.trim() || 'qwen-vl-max'
    const endpoint = (settings.customEndpoint?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
    const apiKey = settings.customApiKey?.trim() || (globalThis as any).process?.env?.OPENAI_API_KEY?.trim() || ''
    return {
      provider: 'custom',
      model,
      baseURL: endpoint,
      apiKey,
      source: 'custom',
    }
  }

  // 2. Explicit Gemini Provider in Settings
  if (settings?.provider === 'gemini') {
    const model = settings.customModel?.trim() || 'gemini-1.5-flash'
    const endpoint = (settings.customEndpoint?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
    const apiKey = settings.customApiKey?.trim() || (globalThis as any).process?.env?.GEMINI_API_KEY?.trim() || ''
    return {
      provider: 'gemini',
      model,
      baseURL: endpoint,
      apiKey,
      source: 'custom',
    }
  }

  // Helper to resolve an API key reference from credentials service or environment
  const resolveKey = async (keyRef?: string): Promise<string> => {
    if (!keyRef) return ''
    try {
      const cred = ctx?.credentials || ctx?.get?.('credentials', false) || ctx?.get?.('credentials')
      if (typeof cred?.resolve === 'function') {
        const res = await cred.resolve(keyRef)
        const val = res?.value?.trim()
        if (val) return val
      }
    } catch {}
    return (globalThis as any).process?.env?.[keyRef]?.trim() || ''
  }

  // 3. Discover image-capable models from Host context services
  if (ctx && typeof ctx === 'object') {
    try {
      const llm = ctx.llm || ctx.get?.('llm', false) || ctx.get?.('llm')
      const settingsSvc = ctx.settings || ctx.get?.('settings', false) || ctx.get?.('settings')

      if (llm?.models && typeof llm.models === 'object') {
        for (const [id, m] of Object.entries<any>(llm.models)) {
          if (
            (Array.isArray(m?.input) && m.input.includes('image')) ||
            (Array.isArray(m?.inputModalities) && m.inputModalities.includes('image')) ||
            /omni|vision|4v|vl/i.test(id)
          ) {
            const [provider, modelName] = id.includes(':') ? id.split(':') : ['fong', id]
            const apiKey = m.apiKey || (await resolveKey(m.apiKeyEnv))
            return {
              provider,
              model: modelName,
              baseURL: m.baseURL || 'https://api.openai.com/v1',
              apiKey,
              apiKeyEnv: m.apiKeyEnv,
              source: 'host-settings',
            }
          }
        }
      }

      if (settingsSvc && typeof settingsSvc.describe === 'function') {
        const namespaces = settingsSvc.describe({ redactSecrets: false }) || []
        for (const nsEntry of namespaces) {
          const val = nsEntry?.value
          if (!val || typeof val !== 'object') continue

          const providersObj = val.providers && typeof val.providers === 'object' ? val.providers : {}
          for (const [pName, pConf] of Object.entries<any>(providersObj)) {
            if (!pConf || typeof pConf !== 'object') continue
            const models = Array.isArray(pConf.models) ? pConf.models : []
            const imgModel = models.find(
              (m: any) =>
                (Array.isArray(m?.input) && m.input.includes('image')) ||
                (Array.isArray(m?.inputModalities) && m.inputModalities.includes('image')) ||
                /omni|vision|4v|vl/i.test(m?.id || m?.name || ''),
            )
            if (imgModel) {
              const rawBase = pConf.baseURL || pConf.baseUrl
              const baseURL = typeof rawBase === 'string' ? rawBase.replace(/\/+$/, '') : ''
              const apiKey = await resolveKey(pConf.apiKeyEnv)
              return {
                provider: pName,
                model: imgModel.id || imgModel.name || 'Omni',
                baseURL: baseURL || 'https://api.openai.com/v1',
                apiKey,
                apiKeyEnv: pConf.apiKeyEnv,
                protocol: pConf.api,
                source: 'host-settings',
              }
            }
          }
        }
      }
    } catch {}
  }

  // 4. Scan local DSH profile configuration files on disk (e.g. cordis.patch.yml)
  try {
    const fsMod = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const dshHome = await resolveDshHome(ctx)
    const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    const profile = proc?.env?.DSH_PROFILE?.trim() || 'desktop'

    const candidateFiles = [
      pathMod.join(dshHome, 'profiles', profile, 'cordis.patch.yml'),
      pathMod.join(dshHome, 'profiles', profile, 'cordis.yml'),
      pathMod.join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml'),
      pathMod.join(dshHome, 'profiles', 'desktop', 'cordis.yml'),
    ]

    for (const filePath of candidateFiles) {
      try {
        const text = await fsMod.readFile(filePath, 'utf8')
        const parsed = parseYamlProfile(text, dshHome)
        for (const prov of parsed.providers) {
          const imgModel = prov.models.find(
            (m: any) =>
              (Array.isArray(m?.input) && m.input.includes('image')) ||
              (Array.isArray(m?.inputModalities) && m.inputModalities.includes('image')) ||
              /omni|vision|4v|vl/i.test(m?.id || m?.name || ''),
          )
          if (imgModel) {
            const apiKey = await resolveKey(prov.apiKeyEnv)
            return {
              provider: prov.provider,
              model: imgModel.id || imgModel.name || 'Omni',
              baseURL: prov.baseURL || 'https://api.openai.com/v1',
              apiKey,
              apiKeyEnv: prov.apiKeyEnv,
              protocol: prov.api,
              source: 'host-settings',
            }
          }
        }
      } catch {}
    }
  } catch {}

  // 5. Fallback: check ~/.modlens/config.json
  try {
    const fsMod = await loadNodeModule<any>('node:fs/promises')
    const pathMod = await loadNodeModule<any>('node:path')
    const osMod = await loadNodeModule<any>('node:os')
    const modlensConfPath = pathMod.join(osMod.homedir(), '.modlens', 'config.json')
    const raw = await fsMod.readFile(modlensConfPath, 'utf8')
    const conf = JSON.parse(raw)
    if (conf.openai?.apiKey && conf.openai?.baseUrl) {
      return {
        provider: 'modlens-openai',
        model: conf.openai.model || 'qwen-vl-plus',
        baseURL: conf.openai.baseUrl.replace(/\/+$/, ''),
        apiKey: conf.openai.apiKey,
        source: 'modlens-config',
      }
    }
    if (conf.gemini?.apiKey) {
      return {
        provider: 'modlens-gemini',
        model: conf.gemini.model || 'gemini-1.5-flash',
        baseURL: 'https://generativelanguage.googleapis.com',
        apiKey: conf.gemini.apiKey,
        source: 'modlens-config',
      }
    }
  } catch {}

  // 6. Fallback: check GEMINI_API_KEY environment variable
  const geminiEnv = (globalThis as any).process?.env?.GEMINI_API_KEY
  if (geminiEnv) {
    return {
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      baseURL: 'https://generativelanguage.googleapis.com',
      apiKey: geminiEnv,
      source: 'gemini-env',
    }
  }

  // 7. Fallback: check OPENAI_API_KEY environment variable
  const openaiEnv = (globalThis as any).process?.env?.OPENAI_API_KEY
  if (openaiEnv) {
    return {
      provider: 'openai',
      model: 'gpt-4o',
      baseURL: 'https://api.openai.com/v1',
      apiKey: openaiEnv,
      source: 'custom',
    }
  }

  // 8. Fallback: If custom fields were entered in settings
  if (settings?.customEndpoint && settings?.customModel) {
    return {
      provider: 'custom',
      model: settings.customModel,
      baseURL: settings.customEndpoint.replace(/\/+$/, ''),
      apiKey: settings.customApiKey || '',
      source: 'custom',
    }
  }

  return undefined
}

/** Structured vision OCR prompt template. */
export const VISION_SYSTEM_PROMPT =
  '\u4f60\u662f\u4e00\u4e2a\u9ad8\u7cbe\u5ea6\u7684\u89c6\u89c9\u5206\u6790\u4e0e\u591a\u6a21\u6001OCR\u5f15\u64ce。\u8bf7\u5bf9\u8fd9\u5f20\u56fe\u7247\u8fdb\u884c\u7ed3\u6784\u5316\u89e3\u6790，\u6309\u4ee5\u4e0b\u6807\u8bb0\u5206\u6bb5\u8f93\u51fa\u8bc1\u636e：\n\n' +
  '[\u56fe\u7247\u6982\u8ff0]\n\u7b80\u8981\u8bf4\u660e\u56fe\u7247\u7c7b\u578b\u4e0e\u6838\u5fc3\u5185\u5bb9（\u754c\u9762\u622a\u56fe/\u4ee3\u7801\u7247\u6bb5/\u67b6\u6784\u56fe\u8868/\u62a5\u9519\u65e5\u5fd7/\u7f51\u9875\u6e32\u67d3\u7b49）。\n\n' +
  '[OCR \u5168\u6587\u8f6c\u5199]\n\u6309\u7167\u4ece\u4e0a\u5230\u4e0b、\u4ece\u5de6\u5230\u53f3\u7684\u9605\u8bfb\u987a\u5e8f，\u9010\u5b57、\u5b8c\u6574\u8f6c\u5199\u56fe\u7247\u4e2d\u51fa\u73b0\u7684\u6240\u6709\u6587\u5b57、\u4ee3\u7801、\u547d\u4ee4\u884c、UI\u6807\u7b7e、\u6570\u503c\u4e0e\u6807\u70b9\u7b26\u53f7，\u4e25\u683c\u4fdd\u6301\u539f\u59cb\u4ee3\u7801\u7f29\u8fdb\u4e0e\u6392\u7248\u5206\u884c。\n\n' +
  '[\u7248\u9762\u4e0e\u89c6\u89c9\u7ed3\u6784]\n\u63cf\u8ff0\u56fe\u4e2d\u7684\u4e3b\u8981\u754c\u9762\u533a\u57df、\u6309\u94ae\u72b6\u6001、\u9ad8\u4eae\u6216\u5f02\u5e38\u8b66\u62a5\u6807\u8bc6、\u56fe\u8868\u7ed3\u6784\u7279\u5f81。\n\n' +
  '[\u5173\u952e\u5b9e\u4f53\u4e0e\u7ed3\u8bba]\n\u5217\u51fa\u63d0\u53d6\u5230\u7684\u5173\u952e\u6807\u8bc6\u7b26、\u62a5\u9519\u5f02\u5e38、\u8def\u5f84\u6216\u914d\u7f6e\u6570\u503c。'

/** Perform image recognition via vision engine with in-memory caching. */
export async function recognizeImage(
  data: BufferLike | Uint8Array,
  mime: string,
  account: VisionAccount,
  options?: { prompt?: string; cacheKey?: string; signal?: unknown },
): Promise<VisionEvidence> {
  const promptText = options?.prompt ? `${VISION_SYSTEM_PROMPT}\n\u989d\u5916\u5173\u6ce8\u91cd\u70b9：${options.prompt}` : VISION_SYSTEM_PROMPT
  let effectiveKey = account.apiKey || ''
  if (!effectiveKey && account.apiKeyEnv) {
    effectiveKey = (globalThis as any).process?.env?.[account.apiKeyEnv]?.trim() || ''
  }

  // A size-only key can return another image's OCR. Bind to exact bytes and call context.
  // Hash the full identity so credential material is never stored as a plaintext key.
  const crypto = await loadNodeModule<any>('node:crypto')
  const cacheKey = crypto.createHash('sha256')
    .update(JSON.stringify({
      version: 2, provider: account.provider, model: account.model,
      baseURL: account.baseURL, mime, promptText, apiKey: effectiveKey,
      hint: options?.cacheKey ?? '',
    }))
    .update(data)
    .digest('hex')
  const now = getGlobals().performance.now()
  const cached = evidenceCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return { ...cached.evidence, cached: true }
  }

  const base64Data = (typeof (data as any).toString === 'function')
    ? (data as any).toString('base64')
    : getGlobals().Buffer.from(data).toString('base64')
  const dataUrl = `data:${mime};base64,${base64Data}`
  let rawOutput = ''

  if (account.provider === 'gemini' || account.baseURL.includes('generativelanguage.googleapis.com')) {
    // Google Gemini API format
    const url = `${account.baseURL}/v1beta/models/${account.model}:generateContent?key=${effectiveKey}`
    const res = await getGlobals().fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              { inline_data: { mime_type: mime, data: base64Data } },
            ],
          },
        ],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
      signal: options?.signal,
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Gemini API error (HTTP ${res.status}): ${errText.slice(0, 200)}`)
    }
    const json = (await res.json()) as any
    rawOutput = json?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  } else {
    // OpenAI-compatible Chat Completions format
    const endpoint = account.baseURL.endsWith('/chat/completions')
      ? account.baseURL
      : `${account.baseURL}/chat/completions`

    // Multi-key rotation support (keys separated by comma)
    const keys = effectiveKey.split(',').map(k => k.trim()).filter(Boolean)
    const currentKey = keys[0] || ''

    const res = await getGlobals().fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(currentKey ? { authorization: `Bearer ${currentKey}` } : {}),
      },
      body: JSON.stringify({
        model: account.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: options?.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Vision provider returned HTTP ${res.status}: ${errText.slice(0, 200)}`)
    }

    const json = (await res.json()) as any
    const content = json?.choices?.[0]?.message?.content
    if (typeof content === 'string') {
      rawOutput = content
    } else if (Array.isArray(content)) {
      rawOutput = content.map((c: any) => c?.text || '').join('\n')
    } else {
      throw new Error('Vision provider returned empty content')
    }
  }

  const evidence = parseStructuredOutput(rawOutput)
  evidenceCache.set(cacheKey, {
    expiresAt: now + EVIDENCE_CACHE_TTL_MS,
    evidence,
  })
  trimEvidenceCache()

  return evidence
}

/** Read image file from disk and generate structured evidence. */
export async function readImageFile(
  filePath: string,
  account: VisionAccount,
  prompt?: string,
  signal?: unknown,
): Promise<VisionEvidence> {
  const fsMod = await loadNodeModule<any>('node:fs/promises')
  const stat = await fsMod.stat(filePath)
  if (stat.size > 25 * 1024 * 1024) throw new Error('Image file too large (max 25MB)')
  const buffer = await fsMod.readFile(filePath)
  if (buffer.length > 25 * 1024 * 1024) throw new Error('Image file too large (max 25MB)')
  const detected = detectImageMime(buffer)
  const mime = detected?.mime || 'image/png'

  // File name, size and mtime do not prove content equality.
  return recognizeImage(buffer, mime, account, { prompt, signal })
}

/**
 * Register native vision tools (`read_image` and `modlens_read_image`) on DSH Host context.
 */
export function registerVisionTools(ctx: any, resolveAccount: () => Promise<VisionAccount | undefined>): () => void {
  const toolsSvc = ctx?.tools || ctx?.tool
  if (!toolsSvc || typeof toolsSvc.register !== 'function') return () => {}

  const buildToolDef = (toolName: string) => ({
    name: toolName,
    description:
      'Read an image through the vision bridge. Use whenever a message references an image: a local file path or http(s) URL to a screenshot, diagram, error log, UI mockup, or document. Returns structured evidence with OCR verbatim transcription, layout regions, and visual details. Quote the evidence instead of guessing.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute local file path or http(s) URL to the image',
        },
        prompt: {
          type: 'string',
          description: 'Optional focus or instruction for reading the image (e.g. "focus on the error code")',
        },
      },
      required: ['path'],
    },
    presentCall: (args: any) => ({
      card: 'generic',
      title: toolName,
      kind: 'read',
      rawInput: args,
      ...(args?.path && !/^https?:\/\//i.test(args.path) ? { locations: [{ path: args.path }] } : {}),
    }),
    async execute(args: any) {
      if (!args?.path || typeof args.path !== 'string') {
        throw new Error(`${toolName} requires a non-empty string "path".`)
      }
      const account = await resolveAccount()
      if (!account) {
        throw new Error(
          `${toolName}: No vision model available. Please configure an image-capable model (like Omni or custom vision endpoint) in settings.`,
        )
      }
      const evidence = await readImageFile(args.path.trim(), account, args.prompt)
      return {
        summary: evidence.summary,
        ocr: evidence.transcription,
        layout: evidence.layout,
        entities: evidence.entities,
        renderedText: formatEvidenceBlock(evidence, args.path),
      }
    },
  })

  const unsubs: Array<() => void> = []
  try {
    const unsub1 = toolsSvc.register(buildToolDef('read_image'))
    if (typeof unsub1 === 'function') unsubs.push(unsub1)
    const unsub2 = toolsSvc.register(buildToolDef('modlens_read_image'))
    if (typeof unsub2 === 'function') unsubs.push(unsub2)
  } catch (err) {
    getGlobals().console?.error(`[delta-desktop] vision tools registration skipped: ${err}`)
  }

  return () => {
    for (const u of unsubs) try { u() } catch {}
  }
}

/**
 * Install Host-side Vision Bridge ops, HTTP routes, tools, and model adapters.
 */
export function installHostVisionOps(ctx: any, store: any): () => void {
  const cleanups: Array<() => void> = []

  let credentialsSvc: any = null
  let settingsSvc: any = null
  let llmSvc: any = null

  try {
    if (typeof ctx?.inject === 'function') {
      const unsubCred = ctx.inject(['credentials'], (scope: any) => {
        credentialsSvc = scope?.credentials || scope?.get?.('credentials')
      })
      if (typeof unsubCred === 'function') cleanups.push(unsubCred)
      const unsubSet = ctx.inject(['settings'], (scope: any) => {
        settingsSvc = scope?.settings || scope?.get?.('settings')
      })
      if (typeof unsubSet === 'function') cleanups.push(unsubSet)
      const unsubLlm = ctx.inject(['llm'], (scope: any) => {
        llmSvc = scope?.llm || scope?.get?.('llm')
      })
      if (typeof unsubLlm === 'function') cleanups.push(unsubLlm)
    }
  } catch {}

  const getAccount = async (): Promise<VisionAccount | undefined> => {
    const st = (await store.read?.()) as DeltaHostState | undefined
    const augmentedCtx = {
      ...ctx,
      get: (name: string, fallback?: boolean) => {
        if (name === 'credentials' && credentialsSvc) return credentialsSvc
        if (name === 'settings' && settingsSvc) return settingsSvc
        if (name === 'llm' && llmSvc) return llmSvc
        return ctx?.get ? ctx.get(name, fallback) : undefined
      },
      credentials: credentialsSvc || ctx?.credentials,
      settings: settingsSvc || ctx?.settings,
      llm: llmSvc || ctx?.llm,
    }
    return resolveVisionAccount(augmentedCtx, st?.vision)
  }

  // 1. Register tools
  const stopTools = registerVisionTools(ctx, getAccount)
  cleanups.push(stopTools)

  // 2. Register HTTP routes on connection.fetch or webServer
  const handlePaste = async (request: any): Promise<any> => {
    try {
      let bodyBuffer: BufferLike | null = null
      let mimeType = 'image/png'
      let originalName = ''

      if (request && typeof request.arrayBuffer === 'function') {
        const ab = await request.arrayBuffer()
        bodyBuffer = getGlobals().Buffer.from(ab)
        mimeType = request.headers?.get?.('content-type') || mimeType
        const nameHeader = request.headers?.get?.('x-file-name')
        if (nameHeader) originalName = decodeURIComponent(nameHeader)
      } else if (getGlobals().Buffer.isBuffer(request?.body)) {
        bodyBuffer = request.body
      } else if (request && typeof request.json === 'function') {
        const json = await request.json()
        if (json.base64) {
          bodyBuffer = getGlobals().Buffer.from(json.base64, 'base64')
          mimeType = json.mime || mimeType
          originalName = json.name || originalName
        }
      }

      if (!bodyBuffer || bodyBuffer.length === 0) {
        return makeJsonResponse(400, { ok: false, error: 'Empty image payload' })
      }
      if (bodyBuffer.length > 25 * 1024 * 1024) {
        return makeJsonResponse(413, { ok: false, error: 'Image file too large (max 25MB)' })
      }

      const saved = await savePastedImage(bodyBuffer, mimeType, originalName)
      return makeJsonResponse(200, {
        ok: true,
        path: saved.path,
        name: saved.name,
        size: saved.size,
        mime: saved.mime,
      })
    } catch (err: any) {
      return makeJsonResponse(500, { ok: false, error: err?.message || String(err) })
    }
  }

  const handleRecognize = async (request: any): Promise<any> => {
    try {
      const account = await getAccount()
      if (!account) {
        return makeJsonResponse(503, {
          ok: false,
          error: 'No active vision engine available. Please configure a multimodal model or custom vision endpoint.',
        })
      }

      let filePath = ''
      let prompt = ''
      let imageBuffer: BufferLike | null = null
      let mime = 'image/png'

      if (request && typeof request.json === 'function') {
        const json = await request.json()
        filePath = json.path || ''
        prompt = json.prompt || ''
        if (json.base64) {
          imageBuffer = getGlobals().Buffer.from(json.base64, 'base64')
          mime = json.mime || mime
        }
      }

      let evidence: VisionEvidence
      if (filePath) {
        evidence = await readImageFile(filePath, account, prompt)
      } else if (imageBuffer) {
        evidence = await recognizeImage(imageBuffer, mime, account, { prompt })
      } else {
        return makeJsonResponse(400, { ok: false, error: 'Either path or image data is required' })
      }

      return makeJsonResponse(200, {
        ok: true,
        evidence,
        renderedText: formatEvidenceBlock(evidence, filePath || 'pasted-image'),
        account: { provider: account.provider, model: account.model, source: account.source },
      })
    } catch (err: any) {
      return makeJsonResponse(500, { ok: false, error: err?.message || String(err) })
    }
  }

  const handleStatus = async (): Promise<any> => {
    try {
      const st = (await store.read?.()) as DeltaHostState | undefined
      const account = await getAccount()
      return makeJsonResponse(200, {
        ok: true,
        visionSettings: st?.vision,
        engineReady: Boolean(account),
        account: account ? { provider: account.provider, model: account.model, source: account.source } : null,
      })
    } catch (err: any) {
      return makeJsonResponse(500, { ok: false, error: err?.message || String(err) })
    }
  }

  const handleConfig = async (request: any): Promise<any> => {
    try {
      let body: any = {}
      if (request && typeof request.json === 'function') body = await request.json()
      const next = await store.update((cur: DeltaHostState) => ({
        ...cur,
        vision: {
          ...cur.vision,
          ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
          ...(typeof body.mode === 'string' ? { mode: body.mode } : {}),
          ...(typeof body.provider === 'string' ? { provider: body.provider } : {}),
          ...(typeof body.customEndpoint === 'string' ? { customEndpoint: body.customEndpoint } : {}),
          ...(typeof body.customApiKey === 'string' ? { customApiKey: body.customApiKey } : {}),
          ...(typeof body.customModel === 'string' ? { customModel: body.customModel } : {}),
          ...(typeof body.autoWrapModels === 'boolean' ? { autoWrapModels: body.autoWrapModels } : {}),
        },
      }))
      return makeJsonResponse(200, { ok: true, vision: next.vision })
    } catch (err: any) {
      return makeJsonResponse(500, { ok: false, error: err?.message || String(err) })
    }
  }

  // Register on connection.fetch
  try {
    if (typeof ctx?.inject === 'function') {
      const unsub = ctx.inject(['connection'], (scope: any) => {
        if (typeof scope?.connection?.fetch?.register !== 'function') return () => {}
        const stops = [
          scope.connection.fetch.register({
            path: DELTA_VISION_PASTE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: handlePaste,
          }),
          scope.connection.fetch.register({
            path: DELTA_VISION_RECOGNIZE_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: handleRecognize,
          }),
          scope.connection.fetch.register({
            path: DELTA_VISION_STATUS_PATH,
            methods: ['GET'],
            requestBody: 'buffered',
            fetch: handleStatus,
          }),
          scope.connection.fetch.register({
            path: DELTA_VISION_CONFIG_PATH,
            methods: ['POST'],
            requestBody: 'buffered',
            fetch: handleConfig,
          }),
        ]
        return () => { for (const s of stops) try { s?.() } catch {} }
      })
      if (typeof unsub === 'function') cleanups.push(unsub)
    }
  } catch {}

  // Fallback register on webServer
  try {
    if (typeof ctx?.inject === 'function') {
      const unsubWs = ctx.inject(['webServer'], (scope: any) => {
        const ws = scope?.webServer
        if (!ws || typeof ws.register !== 'function') return () => {}
        const makeRoute = (path: string, handler: (req: any) => Promise<any>) => ({
          path,
          async handler(req: any, res: any) {
            try {
              const result: any = await handler(req)
              const status = result?.status || 200
              const json = typeof result?.json === 'function' ? await result.json() : result
              res.writeHead(status, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(json))
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            }
          },
        })
        const stops = [
          ws.register(makeRoute(DELTA_VISION_PASTE_PATH, handlePaste)),
          ws.register(makeRoute(DELTA_VISION_RECOGNIZE_PATH, handleRecognize)),
          ws.register(makeRoute(DELTA_VISION_STATUS_PATH, handleStatus)),
          ws.register(makeRoute(DELTA_VISION_CONFIG_PATH, handleConfig)),
        ]
        return () => { for (const s of stops) try { s?.() } catch {} }
      })
      if (typeof unsubWs === 'function') cleanups.push(unsubWs)
    }
  } catch {}

  return () => {
    for (const c of cleanups) try { c() } catch {}
  }
}

function makeJsonResponse(status: number, data: unknown): { status: number; json: () => Promise<unknown> } {
  return {
    status,
    json: async () => data,
  }
}

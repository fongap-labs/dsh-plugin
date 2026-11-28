import Schema from '@deepseek-ai/schemastery'
import type { BridgeConfig, NormalizedBridgeConfig, ProviderConfig } from './types.js'

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000
const DEFAULT_BEHAVIOR_PROMPT = [
  'Follow the user instructions and the model capabilities declared by the request.',
  'Do not claim that an unavailable tool, modality, or source was used.',
  'When supplied with external evidence, distinguish observations from inferences and uncertainty.',
].join(' ')

/** Cordis configuration contract. Secrets are references, never secret values. */
export const Config: Schema<Record<string, unknown>> = Schema.object({
  enabled: Schema.boolean().default(true).volatile(),
  modules: Schema.object({
    duckai: Schema.boolean().default(true),
    chatgpt: Schema.boolean().default(true),
    customApi: Schema.boolean().default(true),
    vision: Schema.boolean().default(true),
    modelDiscovery: Schema.boolean().default(true),
    capabilityProbe: Schema.boolean().default(false),
    apiService: Schema.boolean().default(true),
    behaviorEnhancement: Schema.boolean().default(true),
  }).volatile(),
  providers: Schema.array(Schema.object({
    id: Schema.string().required(),
    kind: Schema.union(['duckai', 'chatgpt', 'custom-api']).required(),
    enabled: Schema.boolean().default(true),
    endpoint: Schema.string().default(''),
    auth: Schema.object({
      mode: Schema.union(['none', 'bearer', 'host-secret']).default('host-secret'),
      credentialRef: Schema.string().default(''),
      headerName: Schema.string().default(''),
    }).default({}),
    headers: Schema.dict(Schema.string()).default({}),
    requestDefaults: Schema.dict(Schema.any()).default({}),
    timeoutMs: Schema.number().default(60000),
  })).default([]).volatile(),
  discovery: Schema.object({
    refreshOnStart: Schema.boolean().default(true),
    refreshIntervalMs: Schema.number().default(DEFAULT_REFRESH_INTERVAL_MS),
  }).volatile(),
  api: Schema.object({
    enabled: Schema.boolean().default(true),
    pathPrefix: Schema.string().default('/delta-suite/v1'),
    exposeExternally: Schema.boolean().default(false),
  }).volatile(),
  vision: Schema.object({
    allowFallback: Schema.boolean().default(false),
    primaryProvider: Schema.string().default(''),
    fallbackProvider: Schema.string().default(''),
    cacheTtlMs: Schema.number().default(DEFAULT_CACHE_TTL_MS),
  }).volatile(),
  behavior: Schema.object({
    enabled: Schema.boolean().default(true),
    instructionMode: Schema.union(['prepend', 'append']).default('prepend'),
    systemPrompt: Schema.string().default(DEFAULT_BEHAVIOR_PROMPT),
    maxPromptLength: Schema.number().default(4000),
  }).volatile(),
  permissions: Schema.object({
    providerRequests: Schema.boolean().default(true),
    capabilityExecution: Schema.boolean().default(true),
    localApi: Schema.boolean().default(true),
  }).volatile(),
})

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const normalized = positiveInteger(value, fallback)
  return Math.min(maximum, Math.max(minimum, normalized))
}

function normalizeProvider(input: ProviderConfig): ProviderConfig {
  const id = nonEmpty(input.id)
  if (!id) throw new Error('providers[].id must be a non-empty string')
  if (!['duckai', 'chatgpt', 'custom-api'].includes(input.kind)) {
    throw new Error(`provider ${id}: unsupported kind ${String(input.kind)}`)
  }
  const endpoint = nonEmpty(input.endpoint)
  if (input.enabled !== false && !endpoint) {
    throw new Error(`provider ${id}: endpoint is required when enabled`)
  }
  if (endpoint && !/^https?:\/\//i.test(endpoint)) {
    throw new Error(`provider ${id}: endpoint must use http or https`)
  }
  const credentialRef = nonEmpty(input.auth?.credentialRef)
  const headerName = nonEmpty(input.auth?.headerName)
  const mode = input.auth?.mode ?? (credentialRef ? 'host-secret' : 'none')
  if (mode === 'host-secret' && input.enabled !== false && !credentialRef) {
    throw new Error(`provider ${id}: auth.credentialRef is required for host-secret auth`)
  }
  return {
    ...input,
    id,
    endpoint: endpoint ?? '',
    enabled: input.enabled !== false,
    auth: { mode, credentialRef, headerName },
    headers: { ...(input.headers ?? {}) },
    requestDefaults: { ...(input.requestDefaults ?? {}) },
    timeoutMs: positiveInteger(input.timeoutMs, 60_000),
  }
}

export function normalizeConfig(input: BridgeConfig | undefined): NormalizedBridgeConfig {
  const providers = (input?.providers ?? []).map(normalizeProvider)
  const ids = new Set<string>()
  for (const provider of providers) {
    if (ids.has(provider.id)) throw new Error(`providers: duplicate id ${provider.id}`)
    ids.add(provider.id)
  }
  const pathPrefix = nonEmpty(input?.api?.pathPrefix) ?? '/delta-suite/v1'
  if (!pathPrefix.startsWith('/')) throw new Error('api.pathPrefix must start with /')
  const exposeExternally = input?.api?.exposeExternally === true
  if (exposeExternally) {
    throw new Error('api.exposeExternally is refused until the Host supplies an authenticated public route contract')
  }
  const modules = input?.modules ?? {}
  const behavior = input?.behavior ?? {}
  const permissions = input?.permissions ?? {}
  const maxPromptLength = boundedInteger(behavior.maxPromptLength, 4000, 256, 8000)
  const systemPrompt = (nonEmpty(behavior.systemPrompt) ?? DEFAULT_BEHAVIOR_PROMPT).slice(0, maxPromptLength)
  return {
    enabled: input?.enabled !== false,
    modules: {
      duckai: modules.duckai !== false,
      chatgpt: modules.chatgpt !== false,
      customApi: modules.customApi !== false,
      vision: modules.vision !== false,
      modelDiscovery: modules.modelDiscovery !== false,
      capabilityProbe: modules.capabilityProbe === true,
      apiService: modules.apiService !== false,
      behaviorEnhancement: modules.behaviorEnhancement !== false,
    },
    providers,
    discovery: {
      refreshOnStart: input?.discovery?.refreshOnStart !== false,
      refreshIntervalMs: positiveInteger(input?.discovery?.refreshIntervalMs, DEFAULT_REFRESH_INTERVAL_MS),
    },
    api: {
      enabled: input?.api?.enabled !== false,
      pathPrefix,
      exposeExternally,
    },
    vision: {
      allowFallback: input?.vision?.allowFallback === true,
      primaryProvider: nonEmpty(input?.vision?.primaryProvider),
      fallbackProvider: nonEmpty(input?.vision?.fallbackProvider),
      cacheTtlMs: positiveInteger(input?.vision?.cacheTtlMs, DEFAULT_CACHE_TTL_MS),
    },
    behavior: {
      enabled: behavior.enabled !== false,
      instructionMode: behavior.instructionMode === 'append' ? 'append' : 'prepend',
      systemPrompt,
      maxPromptLength,
    },
    permissions: {
      providerRequests: permissions.providerRequests !== false,
      capabilityExecution: permissions.capabilityExecution !== false,
      localApi: permissions.localApi !== false,
    },
  }
}

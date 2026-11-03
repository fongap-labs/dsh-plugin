import type { Context } from '@deepseek-ai/cordis'

interface ConfigurableProvider {
  provider: string
  settingsNs: string
  settingsPath: readonly string[]
  defaultBaseURL?: string
  nativeAuth?: { env: readonly string[]; oauth: boolean }
}

interface ModelSelection {
  provider: string
  model: string
}

interface MainModelAccount extends ModelSelection {
  baseURL: string
  apiKey: string
  protocol?: string
  imageInputSupported?: boolean
}

interface RuntimeContext {
  get?(name: string): unknown
  agentDefaultModel?: { currentSelection(): ModelSelection }
  llm?: {
    listConfigurableProviders(): ConfigurableProvider[]
    resolveModelInfo(provider: string, model: string): Promise<{ inputModalities?: readonly string[] }>
  }
  settings?: { describe(options?: { redactSecrets?: boolean }): Array<{ ns: string; value?: unknown }> }
  credentials?: { resolve(ref: string): Promise<{ value?: string } | undefined> }
}

const runtimeOf = (ctx: Context): RuntimeContext => ctx as unknown as RuntimeContext

const serviceOf = <T>(runtime: RuntimeContext, name: string, property: T | undefined): T | undefined => {
  try {
    const value = runtime.get?.(name)
    if (value !== undefined && value !== null) return value as T
  } catch {
    // Older Host contexts may not expose every optional service.
  }
  return property
}

const unwrap = (value: unknown): unknown => {
  if (value && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function') {
    try { return (value as { get(): unknown }).get() } catch { return undefined }
  }
  return value
}

const objectOf = (value: unknown): Record<string, unknown> | undefined => {
  const plain = unwrap(value)
  return plain && typeof plain === 'object' && !Array.isArray(plain) ? plain as Record<string, unknown> : undefined
}

const stringOf = (value: unknown): string | undefined => {
  const plain = unwrap(value)
  return typeof plain === 'string' && plain.trim() ? plain.trim() : undefined
}

const providerProfile = (value: unknown, path: readonly string[]): Record<string, unknown> | undefined => {
  let current = value
  for (const key of path) current = objectOf(current)?.[key]
  return objectOf(current)
}

const safeBaseURL = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username || url.password || url.search || url.hash
    ) return undefined
    return value.replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

const readSelection = (runtime: RuntimeContext): ModelSelection => {
  const service = serviceOf(runtime, 'agentDefaultModel', runtime.agentDefaultModel)
  const current = service?.currentSelection()
  if (!current || typeof current.provider !== 'string' || typeof current.model !== 'string') {
    throw new Error('main model is not configured')
  }
  return { provider: current.provider, model: current.model }
}

const accountFrom = async (ctx: Context, modelOverride?: string): Promise<MainModelAccount> => {
  const runtime = runtimeOf(ctx)
  const currentSelection = readSelection(runtime)
  const selection = { ...currentSelection, model: modelOverride?.trim() || currentSelection.model }
  const llm = serviceOf(runtime, 'llm', runtime.llm)
  const settings = serviceOf(runtime, 'settings', runtime.settings)
  const credentials = serviceOf(runtime, 'credentials', runtime.credentials)
  if (!llm || !settings || !credentials) throw new Error('main model account services are unavailable')

  const provider = llm.listConfigurableProviders().find((entry) => entry.provider === selection.provider)
  if (!provider) throw new Error('main model provider settings are unavailable')
  const namespace = settings.describe({ redactSecrets: true }).find((entry) => entry.ns === provider.settingsNs)?.value
  const profile = providerProfile(namespace, provider.settingsPath) || {}
  const baseURL = safeBaseURL(stringOf(profile.baseURL) || stringOf(profile.baseUrl) || provider.defaultBaseURL)
  if (!baseURL) throw new Error('main model provider does not expose a compatible API endpoint')

  // The credential reference is not secret. The credential value is resolved
  // only inside the Host and never crosses the loopback route to the browser.
  const keyRef = stringOf(profile.apiKeyEnv) || provider.nativeAuth?.env.map((env) => env.trim()).find(Boolean)
  if (!keyRef) throw new Error('main model provider has no reusable API key')
  let hit: { value?: string } | undefined
  try {
    hit = await credentials.resolve(keyRef)
  } catch {
    throw new Error('main model credential could not be resolved')
  }
  const apiKey = hit?.value?.trim() || process.env[keyRef]?.trim() || ''
  if (!apiKey) throw new Error('main model API key is not configured')

  let imageInputSupported: boolean | undefined
  try {
    const model = await llm.resolveModelInfo(selection.provider, selection.model)
    imageInputSupported = model.inputModalities === undefined
      ? undefined
      : model.inputModalities.includes('image')
  } catch {
    imageInputSupported = undefined
  }

  return {
    ...selection,
    baseURL,
    apiKey,
    protocol: stringOf(profile.api),
    imageInputSupported,
  }
}

export interface MainModelView {
  provider: string
  model: string
  ready: boolean
  openAICompatible?: boolean
  imageInputSupported?: boolean
}

const isOpenAICompatible = (account: MainModelAccount): boolean => {
  const protocol = account.protocol?.toLowerCase() || ''
  const route = account.provider.toLowerCase()
  if (/(responses|anthropic|gemini)/.test(protocol)) return false
  if (protocol) return /(openai|deepseek)/.test(protocol)
  return /(openai|deepseek)/.test(route)
}

/** Safe profile summary; credential values are never included. */
export const mainModelView = async (ctx: Context): Promise<MainModelView> => {
  const runtime = runtimeOf(ctx)
  let selection: ModelSelection | undefined
  try { selection = readSelection(runtime) } catch { /* report unavailable below */ }
  try {
    const account = await accountFrom(ctx)
    return {
      provider: account.provider,
      model: account.model,
      ready: true,
      openAICompatible: isOpenAICompatible(account),
      ...(account.imageInputSupported === undefined ? {} : { imageInputSupported: account.imageInputSupported }),
    }
  } catch {
    return {
      provider: selection?.provider || '',
      model: selection?.model || '',
      ready: false,
    }
  }
}

const assertOpenAICompatible = (account: MainModelAccount): void => {
  if (!isOpenAICompatible(account)) {
    throw new Error('main model account must use an OpenAI-compatible API for image features')
  }
}

export const resolveMainImageAccount = async (ctx: Context, modelOverride?: string): Promise<MainModelAccount> => {
  const account = await accountFrom(ctx, modelOverride)
  assertOpenAICompatible(account)
  return account
}

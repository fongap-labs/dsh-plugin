/** Public, Host-independent contracts for Delta Suite. */

export type ModuleId = string
export type ProviderKind = 'duckai' | 'chatgpt' | 'custom-api'
export type ModuleState = 'registered' | 'starting' | 'running' | 'degraded' | 'stopped' | 'failed'
export type CapabilityValue = boolean | number | string | readonly string[] | 'unknown'
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file'
export type PermissionKey = 'provider-request' | 'capability-execution' | 'local-api'

export interface ProviderAuthConfig {
  mode?: 'none' | 'bearer' | 'host-secret'
  credentialRef?: string
  headerName?: string
}

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  enabled?: boolean
  endpoint?: string
  auth?: ProviderAuthConfig
  headers?: Record<string, string>
  requestDefaults?: Record<string, unknown>
  timeoutMs?: number
}

export interface BridgeModuleConfig {
  duckai?: boolean
  chatgpt?: boolean
  customApi?: boolean
  vision?: boolean
  modelDiscovery?: boolean
  capabilityProbe?: boolean
  apiService?: boolean
  behaviorEnhancement?: boolean
}

export interface BridgeConfig {
  enabled?: boolean
  modules?: BridgeModuleConfig
  providers?: ProviderConfig[]
  discovery?: {
    refreshOnStart?: boolean
    refreshIntervalMs?: number
  }
  api?: {
    enabled?: boolean
    pathPrefix?: string
    exposeExternally?: boolean
  }
  vision?: {
    allowFallback?: boolean
    primaryProvider?: string
    fallbackProvider?: string
    cacheTtlMs?: number
  }
  behavior?: {
    enabled?: boolean
    instructionMode?: 'prepend' | 'append'
    systemPrompt?: string
    maxPromptLength?: number
  }
  permissions?: {
    providerRequests?: boolean
    capabilityExecution?: boolean
    localApi?: boolean
  }
}

export interface NormalizedBridgeConfig {
  enabled: boolean
  modules: Required<BridgeModuleConfig>
  providers: ProviderConfig[]
  discovery: {
    refreshOnStart: boolean
    refreshIntervalMs: number
  }
  api: {
    enabled: boolean
    pathPrefix: string
    exposeExternally: boolean
  }
  vision: {
    allowFallback: boolean
    primaryProvider?: string
    fallbackProvider?: string
    cacheTtlMs: number
  }
  behavior: {
    enabled: boolean
    instructionMode: 'prepend' | 'append'
    systemPrompt: string
    maxPromptLength: number
  }
  permissions: {
    providerRequests: boolean
    capabilityExecution: boolean
    localApi: boolean
  }
}

export interface ModelCapabilities {
  input?: {
    text?: CapabilityValue
    image?: CapabilityValue
    audio?: CapabilityValue
    video?: CapabilityValue
    file?: CapabilityValue
  }
  output?: {
    text?: CapabilityValue
    image?: CapabilityValue
    audio?: CapabilityValue
    structured?: CapabilityValue
  }
  reasoning?: CapabilityValue
  toolCalling?: CapabilityValue
  parallelToolCalling?: CapabilityValue
  streaming?: CapabilityValue
  jsonSchema?: CapabilityValue
  contextWindow?: number | 'unknown'
  maxOutputTokens?: number | 'unknown'
  extensions?: Record<string, unknown>
}

export interface ModelRecord {
  id: string
  upstreamId: string
  name?: string
  providerId: string
  providerKind: ProviderKind
  status: 'available' | 'unavailable' | 'unknown'
  service: 'free' | 'subscription' | 'paid' | 'unknown'
  protocols: readonly string[]
  capabilities: ModelCapabilities
  source: 'metadata' | 'probe' | 'configured'
  updatedAt: number
}

export interface ChatTextPart {
  type: 'text'
  text: string
}

export interface ChatImagePart {
  type: 'image_url' | 'input_image'
  image_url?: { url: string; detail?: string }
  image?: { url: string; detail?: string }
}

export type ChatContent = string | readonly (ChatTextPart | ChatImagePart)[]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: ChatContent
  name?: string
  tool_call_id?: string
  [key: string]: unknown
}

export interface ChatRequest {
  model: string
  messages: readonly ChatMessage[]
  stream?: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  max_completion_tokens?: number
  reasoning_effort?: string
  response_format?: Record<string, unknown>
  tools?: readonly Record<string, unknown>[]
  tool_choice?: unknown
  [key: string]: unknown
}

export interface ChatUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  [key: string]: unknown
}

export interface ChatResponse {
  id: string
  model: string
  choices: readonly Record<string, unknown>[]
  usage?: ChatUsage
  [key: string]: unknown
}

export interface ChatChunk {
  id: string
  model: string
  choices: readonly Record<string, unknown>[]
  usage?: ChatUsage
  [key: string]: unknown
}

export interface ProviderModelMetadata {
  id: string
  name?: string
  ownedBy?: string
  capabilities?: ModelCapabilities
  service?: ModelRecord['service']
  protocols?: readonly string[]
  contextWindow?: number
  maxOutputTokens?: number
  [key: string]: unknown
}

export interface CredentialResolver {
  resolve(reference: string): Promise<string | undefined>
}

export interface ProviderClient {
  readonly id: string
  readonly kind: ProviderKind
  listModels(signal?: AbortSignal): Promise<readonly ProviderModelMetadata[]>
  chat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>
  streamChat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>
}

export interface CapabilityMatchRequest {
  model: ModelRecord
  request: ChatRequest
  messages: readonly ChatMessage[]
}

export interface CapabilityInvokeRequest extends CapabilityMatchRequest {
  signal?: AbortSignal
}

export interface CapabilityResult {
  messages?: readonly ChatMessage[]
  metadata?: Record<string, unknown>
}

/** Provider-independent extension point for request/response enhancement. */
export interface CapabilityModule {
  readonly id: string
  readonly version: string
  readonly description: string
  readonly inputModalities: readonly Modality[]
  readonly priority?: number
  readonly dependencies?: readonly string[]
  readonly optionalDependencies?: readonly string[]
  canHandle(request: CapabilityMatchRequest): boolean | Promise<boolean>
  invoke(request: CapabilityInvokeRequest): Promise<CapabilityResult>
  dispose?(): void | Promise<void>
}

export interface CapabilitySnapshot {
  id: string
  version: string
  description: string
  inputModalities: readonly Modality[]
  priority: number
  state: 'registered' | 'running' | 'failed' | 'stopped'
  error?: string
}

export interface CapabilityRegistry {
  register(capability: CapabilityModule): () => void
  unregister(id: string): void
  get(id: string): CapabilityModule | undefined
  list(): readonly CapabilityModule[]
  snapshots(): readonly CapabilitySnapshot[]
}

export interface PipelineRequest {
  model: ModelRecord
  request: ChatRequest
  messages: readonly ChatMessage[]
  signal?: AbortSignal
}

export interface PipelineResult {
  messages: readonly ChatMessage[]
  appliedCapabilities: readonly string[]
  metadata: Readonly<Record<string, unknown>>
}

export interface RequestPipeline {
  prepare(request: PipelineRequest): Promise<PipelineResult>
}

export interface PermissionPolicy {
  allows(permission: PermissionKey): boolean
  snapshot(): Readonly<Record<PermissionKey, boolean>>
}

export interface RuntimeStatus {
  modules: readonly ModuleSnapshot[]
  capabilities: readonly CapabilitySnapshot[]
  updatedAt: number
}

export interface RuntimeStatusRegistry {
  updateModules(snapshots: readonly ModuleSnapshot[]): void
  updateCapabilities(snapshots: readonly CapabilitySnapshot[]): void
  snapshot(): RuntimeStatus
}

export interface ModelRegistry {
  registerModel(model: ModelRecord): () => void
  removeProvider(providerId: string): void
  listModels(): readonly ModelRecord[]
  resolveModel(id: string): ModelRecord | undefined
  findByCapability(predicate: (model: ModelRecord) => boolean): readonly ModelRecord[]
}

export interface BridgeRuntime {
  readonly config: NormalizedBridgeConfig
  readonly models: ModelRegistry
  readonly providers: Map<string, ProviderClient>
  readonly capabilities: CapabilityRegistry
  readonly pipeline: RequestPipeline
  readonly permissions: PermissionPolicy
  readonly status: RuntimeStatusRegistry
  readonly logger: BridgeLogger
  readonly fetch: typeof globalThis.fetch
  readonly credentials: CredentialResolver
  readonly events: BridgeEventBus
  readonly host?: {
    registerApi?(api: unknown): () => void
  }
}

export interface BridgeLogger {
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface BridgeEventBus {
  emit(event: string, payload?: unknown): void
  on(event: string, listener: (payload: unknown) => void): () => void
  clear(): void
}

export interface ModuleContext {
  readonly runtime: BridgeRuntime
}

export interface BridgeModule {
  readonly id: ModuleId
  readonly version: string
  readonly description: string
  readonly dependencies?: readonly ModuleId[]
  readonly optionalDependencies?: readonly ModuleId[]
  readonly capabilities: readonly string[]
  start(context: ModuleContext): Promise<(() => void) | void> | (() => void) | void
}

export interface ModuleSnapshot {
  id: ModuleId
  version: string
  state: ModuleState
  error?: string
  capabilities: readonly string[]
}

export interface BridgeHostContext {
  logger?: BridgeLogger
  inject?: (dependencies: string[], callback: (scope: unknown) => unknown) => unknown
  effect?: (effect: () => (() => void) | void, name?: string) => unknown
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown
  credentials?: CredentialResolver
  fetch?: typeof globalThis.fetch
}

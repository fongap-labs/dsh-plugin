/** On-demand Gateway Effort discovery: secrets stay in official Host services.
 * An expiring one-use approval is bound to the resolved credential and the
 * revisioned Host settings profile. Nothing runs on startup or in the browser.
 */
import { loadNodeModule, makeJsonResponse } from './host-state.js'
import { decodeGatewayReasoningCatalog, previewGatewayReasoningSync,
  type GatewayReasoningChoice, type GatewayReasoningSyncPreview } from './delta-suite-adapter/gateway-reasoning.js'
import { applyApprovedGatewayReasoningSync,
  type GatewaySettingsRemote } from './delta-suite-adapter/gateway-reasoning-apply.js'

export const DELTA_GATEWAY_EFFORT_PREVIEW_PATH = '/api/delta-suite/gateway-effort/preview'
export const DELTA_GATEWAY_EFFORT_APPLY_PATH = '/api/delta-suite/gateway-effort/apply'
const MAX_CATALOG_BYTES = 256 * 1024
const TTL_MS = 120_000
/** Bound on concurrent, user-triggered credential-bearing Gateway HTTP requests. */
const MAX_ACTIVE_DISCOVERIES = 2

type HostSettings = {
  writable: boolean
  describe(options?: { redactSecrets?: boolean }): { ns: string; revision: number; value: unknown }[]
  mutate(ns: string, ops: { op: 'set'; path: string[]; value: unknown }[], revision: number): Promise<void>
}
type HostCreds = { resolve(ref: string): Promise<{ value?: string } | undefined> }
type HostLlm = { listConfigurableProviders(): { provider: string; settingsNs: string;
  settingsPath: readonly string[] }[] }
type HostConnection = { fetch: { register(spec: { path: string; methods: string[];
  requestBody: 'buffered'; fetch(request: unknown): Promise<unknown> }): () => void } }
type HostScope = { settings?: HostSettings; credentials?: HostCreds; llm?: HostLlm;
  connection?: HostConnection }
type HostContext = { inject?(deps: string[], fn: (scope: HostScope) =>
  void | (() => void)): unknown }
type Draft = { at: number; namespace: string; providerId: string; modelId: string;
  credentialRef: string; keyHash: string; revision: number;
  selection: GatewayReasoningChoice; catalog: unknown; preview: GatewayReasoningSyncPreview }
export interface GatewayHostOptions {
  /** Test-only injection, production uses Host global fetch. */
  fetch?: typeof fetch
  now?: () => number
}
function rec(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}
function safeId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 160 &&
    v === v.trim() && !/[\u0000-\u001F\u007F/\\]/.test(v) &&
    !['__proto__', 'prototype', 'constructor'].includes(v)
}
function deny(code: string, status = 409): unknown {
  return makeJsonResponse(status, { ok: false, reason: code })
}
async function parseBody(req: unknown): Promise<Record<string, unknown> | undefined> {
  if (!rec(req) || typeof req.text !== 'function') return undefined
  const headers = req.headers as { get?(key: string): string | null } | undefined
  if (headers?.get?.('sec-fetch-site') === 'cross-site') return undefined
  const origin = headers?.get?.('origin')
  if (origin) {
    try { if (new URL(origin).origin !== new URL(String(req.url)).origin) return undefined }
    catch { return undefined }
  }
  if (Number(headers?.get?.('content-length')) > 4096) return undefined
  const raw: string = await (req.text as () => Promise<string>)()
  if (raw.length > 4096) return undefined
  try { const data: unknown = JSON.parse(raw); return rec(data) ? data : undefined }
  catch { return undefined }
}
function endpoint(baseURL: unknown): string | undefined {
  if (typeof baseURL !== 'string') return undefined
  try {
    const url = new URL(baseURL)
    const host = url.hostname.toLowerCase()
    // Only a route already configured for LLM traffic; reject loopback, IPs,
    // credentials and redirects as a defense against accidental key disclosure.
    if (url.protocol !== 'https:' || url.username || url.password || url.search ||
        url.hash || url.port && url.port !== '443' || !host.includes('.') ||
        host.endsWith('.local') || host.endsWith('.internal') ||
        host.endsWith('.localhost') || host.endsWith('.test') ||
        host.endsWith('.invalid') || /^[0-9.]+$/.test(host) ||
        host.startsWith('[')) return undefined
    return url.origin + url.pathname.replace(/\/+$/, '') + '/models'
  } catch { return undefined }
}
async function readCatalog(res: Response): Promise<unknown> {
  const length = Number(res.headers.get('content-length'))
  if (length > MAX_CATALOG_BYTES) throw Error('large-catalog')
  if (!res.body) {
    const text = await res.text()
    if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) throw Error('large-catalog')
    return JSON.parse(text) as unknown
  }
  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.byteLength
    if (size > MAX_CATALOG_BYTES) {
      await reader.cancel()
      throw Error('large-catalog')
    }
    parts.push(next.value)
  }
  const data = new Uint8Array(size)
  let offset = 0
  for (const part of parts) { data.set(part, offset); offset += part.byteLength }
  return JSON.parse(new TextDecoder().decode(data)) as unknown
}
/** Optional Host-only extension; missing official services retain native UI. */
export function installHostGatewayEffortSync(
  ctx: HostContext, options: GatewayHostOptions = {},
): () => void {
  const drafts = new Map<string, Draft>()
  const aborts = new Set<AbortController>()
  const activeDiscoveries = new Set<string>()
  const stops: (() => void)[] = []
  let isDisposed = false
  let serviceGeneration = 0
  const now = options.now ?? Date.now
  const stop = (): void => {
    isDisposed = true
    ++serviceGeneration
    drafts.clear()
    for (const abort of aborts) abort.abort()
    aborts.clear()
    activeDiscoveries.clear()
    for (const off of stops.splice(0)) { try { off() } catch {} }
  }
  if (typeof ctx?.inject !== 'function') return stop
  try {
    const off = ctx.inject(['settings', 'credentials', 'llm', 'connection'], scope => {
      if (isDisposed) return () => {}
      const generation = ++serviceGeneration
      // A removed/replaced Host service must not leave credential-bearing
      // discovery requests or its preview grants alive in the next generation.
      for (const abort of aborts) abort.abort()
      aborts.clear()
      activeDiscoveries.clear()
      drafts.clear()
      const isCurrent = () => !isDisposed && serviceGeneration === generation
      const settings = scope.settings, credentials = scope.credentials, llm = scope.llm
      const registry = scope.connection?.fetch
      if (!settings || !credentials || !llm || !registry ||
          typeof registry.register !== 'function' ||
          typeof settings.describe !== 'function' || typeof settings.mutate !== 'function' ||
          typeof credentials.resolve !== 'function' ||
          typeof llm.listConfigurableProviders !== 'function') return () => {}
      const read = () => settings.describe({ redactSecrets: true })
      const lookup = (namespace: string, providerId: string, modelId: string) => {
        if (!llm.listConfigurableProviders().some(entry =>
          entry.provider === providerId && entry.settingsNs === namespace &&
          entry.settingsPath.length === 2 && entry.settingsPath[0] === 'providers' &&
          entry.settingsPath[1] === providerId)) return undefined
        const ns = read().filter(item => item.ns === namespace)
        if (ns.length !== 1 || !rec(ns[0].value) || !rec(ns[0].value.providers)) return undefined
        const profiles = ns[0].value.providers
        if (!Object.hasOwn(profiles, providerId)) return undefined
        const provider = profiles[providerId]
        if (!rec(provider) || !safeId(provider.apiKeyEnv) ||
            !['openai-completions', 'openai-responses'].includes(String(provider.api)) ||
            !Array.isArray(provider.models) ||
            provider.models.filter(item => rec(item) && item.id === modelId).length !== 1) {
          return undefined
        }
        return { descriptor: ns[0], credentialRef: provider.apiKeyEnv,
          url: endpoint(provider.baseURL), models: provider.models }
      }
      const key = async (ref: string): Promise<string | undefined> => {
        const credential = await credentials.resolve(ref)
        return typeof credential?.value === 'string' && credential.value.length
          ? credential.value : undefined
      }
      const crypto = () => loadNodeModule<any>('node:crypto')
      const hmacSalt = crypto().then(impl => impl.randomBytes(32) as Uint8Array)
      const hash = async (secret: string) => (await crypto())
        .createHmac('sha256', await hmacSalt).update(secret).digest('hex') as string
      const token = async () => (await crypto()).randomBytes(24).toString('hex') as string

      const preview = async (req: unknown): Promise<unknown> => {
        const input = await parseBody(req)
        if (!input || !safeId(input.namespace) || !safeId(input.providerId) ||
            !safeId(input.modelId) || typeof input.selectedEffort !== 'string' ||
            !['default', 'off', 'low', 'medium', 'high', 'max'].includes(input.selectedEffort)) {
          return deny('invalid-request', 400)
        }
        if (!isCurrent()) return deny('host-unavailable', 503)
        // A second click for the same Session must not cause a second
        // authenticated request; a bounded global limit protects the Host if
        // several distinct sessions request discovery at once.
        const requestScope = JSON.stringify([input.namespace, input.providerId, input.modelId])
        if (activeDiscoveries.has(requestScope)) return deny('discovery-in-progress', 429)
        if (activeDiscoveries.size >= MAX_ACTIVE_DISCOVERIES) return deny('discovery-busy', 429)
        activeDiscoveries.add(requestScope)
        try {
          if (!settings.writable) return deny('host-readonly', 403)
          const target = lookup(input.namespace, input.providerId, input.modelId)
          if (!target || !Number.isSafeInteger(target.descriptor.revision)) {
            return deny('missing-host-model')
          }
          if (!target.url) return deny('unsafe-endpoint', 400)
          const currentKey = await key(target.credentialRef)
          if (!currentKey) return deny('missing-credential')
          const initialHash = await hash(currentKey)
          const controller = new AbortController()
          aborts.add(controller)
          const timeout = setTimeout(() => controller.abort(), 8000)
          let catalog: unknown
          try {
            const response = await (options.fetch ?? globalThis.fetch)(target.url, {
              method: 'GET', headers: { authorization: 'Bearer ' + currentKey,
                accept: 'application/json' }, redirect: 'error', cache: 'no-store',
              signal: controller.signal,
            })
            if (!response.ok) return deny('gateway-discovery-refused', 502)
            catalog = await readCatalog(response)
          } finally { clearTimeout(timeout); aborts.delete(controller) }
          if (!isCurrent()) return deny('host-unavailable', 503)
          const currentCredential = await key(target.credentialRef)
          if (!currentCredential || await hash(currentCredential) !== initialHash) {
            return deny('credential-changed')
          }
          const latest = lookup(input.namespace, input.providerId, input.modelId)
          if (!latest || latest.descriptor.revision !== target.descriptor.revision ||
              latest.credentialRef !== target.credentialRef ||
              latest.url !== target.url) return deny('settings-changed')
          const matched = decodeGatewayReasoningCatalog(catalog)
            .find(item => item.modelId === input.modelId)
          if (!matched) return deny('gateway-model-unavailable')
          // Store only normalized single-model metadata, never raw response.
          const safeCatalog = { object: 'list', data: [{
            id: matched.modelId, reasoningEfforts: { ...matched.reasoningEfforts },
            ...matched.defaultPolicy === 'high-best-effort'
              ? { reasoning_policy: { default: 'high', mode: 'best_effort' } } : {},
          }] }
          const selection = input.selectedEffort as GatewayReasoningChoice
          const reviewed = previewGatewayReasoningSync(
            safeCatalog, target.models, input.modelId, selection)
          if (reviewed.status === 'blocked') return deny(reviewed.reason)
          if (reviewed.status === 'unchanged') {
            return makeJsonResponse(200, { ok: true, status: 'unchanged', preview: reviewed })
          }
          for (const [id, draft] of drafts) if (now() - draft.at > TTL_MS) drafts.delete(id)
          while (drafts.size >= 8) drafts.delete(drafts.keys().next().value!)
          const id = await token()
          if (!isCurrent()) return deny('host-unavailable', 503)
          drafts.set(id, { at: now(), namespace: input.namespace,
            providerId: input.providerId, modelId: input.modelId, credentialRef: target.credentialRef,
            keyHash: initialHash, revision: target.descriptor.revision,
            selection, catalog: safeCatalog, preview: reviewed })
          return makeJsonResponse(200, { ok: true, status: 'review',
            previewId: id, preview: reviewed })
        } catch { return deny('discovery-unavailable', 503) }
        finally { activeDiscoveries.delete(requestScope) }
      }
      const apply = async (req: unknown): Promise<unknown> => {
        const input = await parseBody(req)
        if (!input || input.approved !== true ||
            typeof input.previewId !== 'string' || !/^[a-f0-9]{48}$/.test(input.previewId)) {
          return deny('invalid-approval', 400)
        }
        const draft = drafts.get(input.previewId)
        drafts.delete(input.previewId) // one-use even on failure
        if (!draft || now() - draft.at > TTL_MS || !isCurrent()) return deny('expired-preview')
        try {
          const currentKey = await key(draft.credentialRef)
          if (!isCurrent()) return deny('host-unavailable', 503)
          if (!currentKey || await hash(currentKey) !== draft.keyHash) {
            return deny('credential-changed')
          }
          const live = lookup(draft.namespace, draft.providerId, draft.modelId)
          if (!live || live.descriptor.revision !== draft.revision ||
              live.credentialRef !== draft.credentialRef) return deny('settings-changed')
          const remote: GatewaySettingsRemote = {
            describe: async () => ({ ok: true, value: {
              writable: settings.writable, namespaces: read(),
            } }),
            mutate: async (ns, ops, rev) => {
              // Validate the specific credential again immediately before CAS.
              const fresh = await key(draft.credentialRef)
              if (!isCurrent()) {
                return { ok: false, error: { code: 'host-service-replaced' } }
              }
              if (!fresh || await hash(fresh) !== draft.keyHash) {
                return { ok: false, error: { code: 'credential-changed' } }
              }
              try {
                await settings.mutate(ns, ops, rev)
                if (!isCurrent()) {
                  return { ok: false, error: { code: 'host-service-replaced' } }
                }
                const committed = read().find(item => item.ns === ns)
                return committed ? { ok: true, value: committed }
                  : { ok: false, error: { code: 'unverified-write' } }
              } catch (error) {
                return { ok: false, error: {
                  code: rec(error) && error.code === 'SETTINGS_CONFLICT'
                    ? 'settings/conflict' : 'settings/rejected',
                } }
              }
            },
          }
          const result = await applyApprovedGatewayReasoningSync({
            approved: true, namespace: draft.namespace, providerId: draft.providerId,
            credentialRef: draft.credentialRef, reviewedRevision: draft.revision,
            authenticatedCatalog: draft.catalog, modelId: draft.modelId,
            selectedEffort: draft.selection, approvedPreview: draft.preview, settings: remote,
          })
          if (!isCurrent()) return deny('host-unavailable', 503)
          return makeJsonResponse(result.status === 'applied' ? 200 : 409,
            { ok: result.status === 'applied', ...result })
        } catch { return deny('host-unavailable', 503) }
      }
      const offPreview = registry.register({ path: DELTA_GATEWAY_EFFORT_PREVIEW_PATH,
        methods: ['POST'], requestBody: 'buffered', fetch: preview })
      let offApply: (() => void) | undefined
      try {
        offApply = registry.register({ path: DELTA_GATEWAY_EFFORT_APPLY_PATH,
          methods: ['POST'], requestBody: 'buffered', fetch: apply })
      } catch (error) {
        offPreview?.()
        throw error
      }
      return () => {
        if (serviceGeneration === generation) {
          ++serviceGeneration
          drafts.clear()
          for (const abort of aborts) abort.abort()
          aborts.clear()
          activeDiscoveries.clear()
        }
        offPreview?.()
        offApply?.()
      }
    })
    if (typeof off === 'function') stops.push(() => { off() })
  } catch { /* Missing public Host contracts keep native Settings untouched. */ }
  return stop
}

/** Approved Gateway Effort writes through the PUBLIC, revisioned Harness
 * `remote.settings.mutate` API. This module never reads keys, fetches a
 * catalog, patches a Host Store, or owns a Session selector.
 *
 * A trusted caller must first obtain a per-key authenticated model catalog,
 * read the official settings namespace, present the preview to the user, and
 * pass the exact reviewed revision and provider's credential reference here.
 * This is an executable write seam, NOT automatic credential discovery or a
 * replacement for official Settings → Models.
 */
import {
  previewGatewayReasoningSync,
  type GatewayReasoningChoice,
  type GatewayReasoningSyncPreview,
} from './gateway-reasoning.js'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type SettingsNamespace = Readonly<{ ns: string; revision: number; value: unknown }>
type SettingsDescribe = Readonly<{ writable: boolean; namespaces: readonly SettingsNamespace[] }>
type Result<T> = Readonly<{ ok: true; value: T } | { ok: false; error?: { code?: string; message?: string } }>

/** The same public Remote signatures used by the official Models settings page. */
export interface GatewaySettingsRemote {
  describe(): Promise<Result<SettingsDescribe>>
  mutate(ns: string, ops: { op: 'set'; path: string[]; value: JsonValue }[],
    expectedRevision: number): Promise<Result<SettingsNamespace>>
}

export type GatewaySyncWriteResult = Readonly<
  | { status: 'applied'; revision: number }
  | { status: 'blocked'; reason:
      'not-approved' | 'invalid-scope' | 'host-unavailable' | 'host-readonly' |
      'stale-review' | 'invalid-preview' | 'invalid-host-state' |
      'host-refused' | 'host-conflict' | 'unverified-write' }
>

export interface GatewaySyncWriteRequest {
  /** Never auto-approve a caller-provided preview. */
  approved: boolean
  /** Exact name of the mounted official llm-pi-ai plugin entry. */
  namespace: string
  /** Exact route ID in that entry; never use a fuzzy model/provider alias. */
  providerId: string
  /** The non-secret credential REFERENCE used to scope the reviewed catalog. */
  credentialRef: string
  /** Active namespace revision captured together with the user's approved preview. */
  reviewedRevision: number
  /** Only the current, authenticated per-Key Gateway model listing. */
  authenticatedCatalog: unknown
  modelId: string
  selectedEffort: GatewayReasoningChoice
  approvedPreview: GatewayReasoningSyncPreview
  /** Injected by the official Host client Remote, not a private HTTP endpoint. */
  settings: GatewaySettingsRemote
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value === value.trim() && value !== '__proto__' && value !== 'constructor' &&
    value !== 'prototype' && !/[\u0000-\u001F\u007F]/.test(value)
}
function samePreview(a: GatewayReasoningSyncPreview, b: GatewayReasoningSyncPreview): boolean {
  if (a.status !== 'review' || b.status !== 'review' || a.modelId !== b.modelId) return false
  const normalized = (v: Extract<GatewayReasoningSyncPreview, { status: 'review' | 'unchanged' }>) =>
    JSON.stringify([v.modelId, v.previous, v.proposed, v.added, v.removed, v.remapped])
  return normalized(a) === normalized(b)
}
function selectedProvider(value: unknown, providerId: string, modelId: string):
  { index: number; models: unknown[]; credentialRef: unknown } | undefined {
  if (!record(value) || !record(value.providers) ||
      !Object.prototype.hasOwnProperty.call(value.providers, providerId)) return undefined
  const provider = value.providers[providerId]
  if (!record(provider) || !Array.isArray(provider.models)) return undefined
  const matches = provider.models.flatMap((item: unknown, index: number) =>
    record(item) && item.id === modelId ? [index] : [])
  if (matches.length !== 1) return undefined
  return { index: matches[0], models: provider.models, credentialRef: provider.apiKeyEnv }
}

/** Execute ONE user-approved, exact-model change using the Host's CAS semantics.
 *
 * No retries: a failed or ambiguous Host acknowledgement may already have
 * committed and needs a fresh settings describe before the next user action.
 */
export async function applyApprovedGatewayReasoningSync(
  request: GatewaySyncWriteRequest,
): Promise<GatewaySyncWriteResult> {
  const blocked = (reason: Extract<GatewaySyncWriteResult, { status: 'blocked' }>['reason']) =>
    Object.freeze({ status: 'blocked' as const, reason })
  if (request.approved !== true) return blocked('not-approved')
  // A configured plugin entry may have a custom ID. The installed namespace
  // must still be provided explicitly; no arbitrary namespace discovery.
  if (!validId(request.namespace) || !validId(request.providerId) ||
      !validId(request.modelId) || !validId(request.credentialRef) ||
      !Number.isSafeInteger(request.reviewedRevision) || request.reviewedRevision < 0 ||
      !request.settings || typeof request.settings.describe !== 'function' ||
      typeof request.settings.mutate !== 'function') return blocked('invalid-scope')
  if (request.approvedPreview?.status !== 'review' ||
      request.approvedPreview.modelId !== request.modelId) return blocked('invalid-preview')

  let described: Result<SettingsDescribe>
  try { described = await request.settings.describe() }
  catch { return blocked('host-unavailable') }
  if (!described.ok || !record(described.value) ||
      !Array.isArray(described.value.namespaces)) return blocked('host-unavailable')
  if (described.value.writable !== true) return blocked('host-readonly')
  const matching = described.value.namespaces.filter(view => view?.ns === request.namespace)
  if (matching.length !== 1) return blocked('invalid-host-state')
  const view = matching[0]
  if (!Number.isSafeInteger(view.revision)) return blocked('invalid-host-state')
  if (view.revision !== request.reviewedRevision) return blocked('stale-review')
  const provider = selectedProvider(view.value, request.providerId, request.modelId)
  if (!provider || provider.credentialRef !== request.credentialRef) return blocked('invalid-host-state')

  const refreshed = previewGatewayReasoningSync(
    request.authenticatedCatalog, provider.models, request.modelId, request.selectedEffort)
  if (!samePreview(request.approvedPreview, refreshed)) return blocked('stale-review')
  if (refreshed.status !== 'review') return blocked('stale-review')

  // Only one path is sent: no provider credentials or sibling model fields.
  const path = ['providers', request.providerId, 'models', String(provider.index), 'reasoningEfforts']
  const proposedValues: Record<string, string> = {}
  for (const [level, wire] of Object.entries(refreshed.proposed)) {
    if (typeof wire === 'string') proposedValues[level] = wire
  }
  let written: Result<SettingsNamespace>
  try {
    written = await request.settings.mutate(request.namespace,
      [{ op: 'set', path, value: proposedValues }], view.revision)
  } catch { return blocked('host-unavailable') }
  if (!written.ok) {
    return blocked(written.error?.code === 'settings/conflict' ? 'host-conflict' : 'host-refused')
  }

  // Success is the *acknowledged* Host state, not simply HTTP 200.
  const confirmed = written.value
  if (confirmed?.ns !== request.namespace ||
      !Number.isSafeInteger(confirmed.revision) || confirmed.revision <= view.revision) {
    return blocked('unverified-write')
  }
  const stored = selectedProvider(confirmed.value, request.providerId, request.modelId)
  const profile = record(confirmed.value) && record(confirmed.value.providers)
    ? confirmed.value.providers[request.providerId] : undefined
  const current = record(profile) && Array.isArray(profile.models) && stored
    ? profile.models[stored.index] : undefined
  if (!record(current) || !record(current.reasoningEfforts) ||
      stored?.credentialRef !== request.credentialRef) return blocked('unverified-write')
  const received = current.reasoningEfforts
  const actualLevels = Object.keys(received).sort()
  const expectedLevels = Object.keys(proposedValues).sort()
  if (JSON.stringify(actualLevels) !== JSON.stringify(expectedLevels) ||
      expectedLevels.some(key => received[key] !== proposedValues[key])) {
    return blocked('unverified-write')
  }
  return Object.freeze({ status: 'applied' as const, revision: confirmed.revision })
}

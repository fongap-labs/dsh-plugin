/**
 * Data-only compatibility adapter for the authenticated AI Gateway /v1/models
 * response. No network requests, credentials, Host Store mutations or model
 * picker ownership live here.
 *
 * The official Harness model provider controls the actual catalog, native
 * effort menu and session.selectModel dispatch. This module produces an
 * explicit opt-in configuration mapping for that public provider contract.
 */
export type GatewayEffort = 'off' | 'low' | 'medium' | 'high' | 'max'
export type GatewayReasoningChoice = 'default' | GatewayEffort
export type GatewayReasoningProtocol = 'openai' | 'anthropic'

export type GatewayReasoningCapability = Readonly<{
  modelId: string
  /** Native provider reasoningEfforts keys/values; off is never an empty omission. */
  reasoningEfforts: Readonly<Partial<Record<GatewayEffort, string>>>
  /** Gateway may best-effort adapt across heterogeneous physical nodes. */
  defaultPolicy: 'high-best-effort' | 'unspecified'
  nativeConfirmed: boolean
}>

const LEVELS = ['low', 'medium', 'high', 'max'] as const
const SAFE_WIRE_VALUE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const validWire = (value: unknown): value is string =>
  typeof value === 'string' && SAFE_WIRE_VALUE.test(value)

function decodeModel(value: unknown): GatewayReasoningCapability | undefined {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim()) return undefined
  // A generic /v1/models list alone does not prove Gateway-specific semantics.
  const policy = isObject(value.reasoning_policy) ? value.reasoning_policy : null
  const bestEffort = policy?.mode === 'best_effort' && policy.default === 'high'
  const rawMap = isObject(value.reasoningEfforts) ? value.reasoningEfforts : null
  const rawArray = Array.isArray(value.reasoning_efforts) ? value.reasoning_efforts : null
  if (!bestEffort && !rawMap && !rawArray) return undefined

  const map: Partial<Record<GatewayEffort, string>> = {}
  for (const level of LEVELS) {
    const listed = rawArray?.includes(level) ?? false
    const declared = rawMap && Object.prototype.hasOwnProperty.call(rawMap, level)
    if (declared) {
      const wire = rawMap![level]
      if (!validWire(wire)) return undefined
      if (rawArray && !listed) return undefined // contradictory declarations
      map[level] = wire
    } else if (listed) {
      if (rawMap) return undefined // contradictory declarations
      map[level] = level
    }
  }
  // A best-effort policy is an explicit Gateway guarantee of the request
  // intent, not a guarantee that every physical node can honor it.
  // Explicit Off must not collapse to Default's omitted parameter.
  if (bestEffort) map.off = 'none'
  else if (rawMap && Object.prototype.hasOwnProperty.call(rawMap, 'off')) {
    if (!validWire(rawMap.off)) return undefined
    map.off = rawMap.off
  }
  // Don't publish a phantom Effort menu when only the policy is present.
  if (!LEVELS.some(level => map[level] !== undefined)) return undefined
  return Object.freeze({
    modelId: value.id,
    reasoningEfforts: Object.freeze(map),
    defaultPolicy: bestEffort ? 'high-best-effort' : 'unspecified',
    nativeConfirmed: policy?.native_confirmed === true,
  })
}

/**
 * Decode only caller-supplied, access-key-scoped Host response data.
 * Never fetch /v1/models from a browser, probe nodes or cache across keys.
 */
export function decodeGatewayReasoningCatalog(value: unknown): readonly GatewayReasoningCapability[] {
  if (!isObject(value) || value.object !== 'list' || !Array.isArray(value.data)) return []
  const out: GatewayReasoningCapability[] = []
  const seen = new Set<string>()
  for (const candidate of value.data) {
    const model = decodeModel(candidate)
    if (!model || seen.has(model.modelId)) continue
    seen.add(model.modelId)
    out.push(model)
  }
  return Object.freeze(out)
}

/**
 * A proposed value for a Harness custom model's official reasoningEfforts
 * configuration. Never mutate the Host form automatically.
 */
export function toHarnessReasoningEfforts(
  model: GatewayReasoningCapability,
): Readonly<Partial<Record<GatewayEffort, string>>> {
  return Object.freeze({ ...model.reasoningEfforts })
}

/**
 * Pure intent mapping for adapter tests; not a transport hook.
 * Default = omit reasoning fields so Gateway applies its soft High policy.
 * Explicit Off = a wire-level disable, never an omitted Default.
 */
export function mapGatewayReasoningChoice(
  model: GatewayReasoningCapability,
  choice: GatewayReasoningChoice,
  protocol: GatewayReasoningProtocol,
): Readonly<Record<string, unknown>> | undefined {
  if (choice === 'default') return Object.freeze({})
  const selected = model.reasoningEfforts[choice]
  if (!selected || !validWire(selected)) return undefined
  if (protocol === 'anthropic') {
    // No budget/adaptive inference is safe from model list metadata alone.
    return choice === 'off'
      ? Object.freeze({ thinking: Object.freeze({ type: 'disabled' }) })
      : undefined
  }
  return Object.freeze({ reasoning_effort: selected })
}

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
  /** Gateway wire-level intents, NOT a guarantee of the native Host adapter's Off serialization. */
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
  if (value.supports_reasoning === false) return undefined
  // Never accept a contradictory or invalid Off declaration, even if policy
  // would otherwise synthesize an Off intent and silently hide the bad data.
  const hasOff = rawMap !== null && Object.prototype.hasOwnProperty.call(rawMap, 'off')
  if (hasOff && (!validWire(rawMap!.off) ||
      (bestEffort && rawMap!.off !== 'none' && rawMap!.off !== 'off'))) return undefined

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
  if (bestEffort) map.off = hasOff ? rawMap!.off as string : 'none'
  else if (hasOff) map.off = rawMap!.off as string
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
  const ambiguous = new Set<string>()
  for (const candidate of value.data) {
    if (!isObject(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim()) continue
    // Duplicated IDs in one key-scoped response are ambiguous, even when one
    // entry is malformed. Never select the first and silently trust it.
    if (seen.has(candidate.id)) {
      ambiguous.add(candidate.id)
      continue
    }
    seen.add(candidate.id)
    const model = decodeModel(candidate)
    if (model) out.push(model)
  }
  return Object.freeze(out.filter(model => !ambiguous.has(model.modelId)))
}

/**
 * Only the levels which the CURRENT official Harness llm-pi-ai adapter can
 * serialize correctly for a Gateway model. Its `off` selection is translated
 * to an omitted reasoning option (see llm-pi-ai/src/adapter.ts profileOptions),
 * which is indistinguishable from Gateway Default and may trigger soft High.
 * Therefore never advertise Off to the native picker using this adapter.
 * A future, versioned Host seam must prove explicit Off wire serialization
 * before native Off can be enabled. The pure gateway request intent mapper
 * below still preserves explicit Off correctly for a capable adapter.
 * This helper never mutates the Host configuration.
 */
export function toHarnessReasoningEfforts(
  model: GatewayReasoningCapability,
): Readonly<Partial<Record<Exclude<GatewayEffort, 'off'>, string>>> {
  const safe: Partial<Record<Exclude<GatewayEffort, 'off'>, string>> = {}
  for (const level of LEVELS) {
    const wire = model.reasoningEfforts[level]
    if (wire !== undefined) safe[level] = wire
  }
  return Object.freeze(safe)
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
  // Unknown runtimes must not silently be treated as OpenAI-compatible.
  if (protocol !== 'openai' && protocol !== 'anthropic') return undefined
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

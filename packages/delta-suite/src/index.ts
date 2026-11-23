/** Public Host exports retained during the Delta Suite migration. */
export { Config } from './privacy-bridge.js'
export { DeltaFeatureRegistry, DELTA_FEATURE_OWNERS, DELTA_EXTENSION_SURFACES } from './delta-suite-kernel/feature-lifecycle-registry.js'
export type { DeltaSuiteFeature, DeltaExtensionSurface, DeltaFeatureOwner } from './delta-suite-kernel/feature-lifecycle-registry.js'

export const name = '@fongap-labs/delta-suite'
export const inject: string[] = []
export {
  DELTA_HOST_CAPABILITIES,
  DELTA_HOST_CONTRACT_VERSION,
  negotiateHostCapabilities,
} from './delta-suite-adapter/host-capability-contract.js'
export type { DeltaCapabilityManifest, DeltaCapabilityReport, DeltaHostCapability } from './delta-suite-adapter/host-capability-contract.js'
export {
  decodeGatewayReasoningCatalog,
  mapGatewayReasoningChoice,
  previewGatewayReasoningSync,
  toHarnessReasoningEfforts,
} from './delta-suite-adapter/gateway-reasoning.js'
export type {
  GatewayEffort,
  GatewayReasoningChoice,
  GatewayReasoningProtocol,
  GatewayReasoningCapability,
  GatewayReasoningSyncPreview,
} from './delta-suite-adapter/gateway-reasoning.js'
export {
  DELTA_GATEWAY_EFFORT_PREVIEW_PATH,
  DELTA_GATEWAY_EFFORT_APPLY_PATH,
  installHostGatewayEffortSync,
} from './host-gateway-effort.js'
export { applyApprovedGatewayReasoningSync } from './delta-suite-adapter/gateway-reasoning-apply.js'
export type {
  GatewaySettingsRemote,
  GatewaySyncWriteRequest,
  GatewaySyncWriteResult,
} from './delta-suite-adapter/gateway-reasoning-apply.js'
export { redactPathForUi, redactSensitiveText } from './redact.js'
export {
  installHostAuthCookiePruner,
  parseAuthCookieNames,
  selectStaleAuthCookieNames,
} from './host-auth-cookies.js'
export { installHostPrivacyGuards, shouldBlockPrivacyHttpRequest } from './host-privacy.js'
export { installGatewayRetryGuard, isDeferredGatewayExhaustion } from './host-gateway-retry-guard.js'
export {
  DELTA_SESSION_SEARCH_PATH,
  extractConversationBlocks,
  installHostSessionSearch,
  scoreAndExtractSessionHit,
} from './host-search.js'
export type { HostSearchResponsePayload, HostSessionSearchHit, SessionTextBlock } from './host-search.js'
export {
  DELTA_SESSION_DELETE_PATH,
  DELTA_SESSION_DELETE_UNGROUPED_PATH,
  DELTA_SESSION_LOCK_PATH,
  DELTA_SESSION_MOVE_PATH,
  DELTA_STATE_PATH,
  installHostSessionOps,
} from './host-sessions.js'
export {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  createHostStateStore,
  generateTotpCode,
  generateTotpSecret,
  hashPinSecret,
  isSixDigitCode,
  verifyPinSecret,
  verifyTotpCode,
} from './host-state.js'
export type {
  DeltaHostState,
  PublicDeltaHostState,
  SessionLockMode,
} from './host-state.js'

export { apply } from './delta-suite-composition.js'

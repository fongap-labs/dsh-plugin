/**
 * DSH host entry. UI integration is client-owned through documented slots.
 * Do not monkey-patch Host workspaceRegistry or override Host business services.
 */
import {
  installHostAuthCookiePruner,
  parseAuthCookieNames,
  selectStaleAuthCookieNames,
} from './host-auth-cookies.js'
import { installHostPrivacyGuards } from './host-privacy.js'
import type { PrivacyHostContext } from './host-privacy.js'
import { installHostProxyManager } from './host-proxy.js'
import { installHostSessionSearch } from './host-search.js'
import { installHostSessionOps } from './host-sessions.js'
import { createHostStateStore } from './host-state.js'
import { registerCompactionStatusProjection } from './context-projection.js'
import { registerPrivacyBridge, type DeltaPrivacyConfig } from './privacy-bridge.js'

export { Config } from './privacy-bridge.js'

export const name = '@fongap-labs/dsh-delta-desktop'
export const inject: string[] = []
export {
  DELTA_HOST_CAPABILITIES,
  DELTA_HOST_CONTRACT_VERSION,
  negotiateHostCapabilities,
} from './host-capabilities.js'
export type { DeltaCapabilityManifest, DeltaCapabilityReport, DeltaHostCapability } from './host-capabilities.js'
export { redactPathForUi, redactSensitiveText } from './redact.js'
export {
  installHostAuthCookiePruner,
  parseAuthCookieNames,
  selectStaleAuthCookieNames,
} from './host-auth-cookies.js'
export { installHostPrivacyGuards, shouldBlockPrivacyHttpRequest } from './host-privacy.js'
export {
  DELTA_SESSION_SEARCH_PATH,
  extractConversationBlocks,
  installHostSessionSearch,
  scoreAndExtractSessionHit,
} from './host-search.js'
export type { HostSearchResponsePayload, HostSessionSearchHit, SessionTextBlock } from './host-search.js'
export { DELTA_PROXY_PATH, installHostProxyManager, parseWindowsProxyServer, validateProxyUrl } from './host-proxy.js'
export type { EffectiveProxyState } from './host-proxy.js'
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
  ProxyMode,
  ProxySettings,
  PublicDeltaHostState,
  SessionLockMode,
} from './host-state.js'

export function apply(ctx?: PrivacyHostContext, config?: DeltaPrivacyConfig): () => void {
  // Until DSH publishes a versioned before-delete hook, deletion stays Host owned.
  if (!ctx || typeof ctx !== 'object') return () => {}
  // Preserve the existing model-redaction/vision and context-projection integrations.
  // The ZIP Host endpoints are additive, not replacements for those capabilities.
  let stopCompaction = () => {}
  let stopPrivacyBridge = () => {}
  if (typeof ctx.inject === 'function') {
    const legacyCtx = ctx as unknown as Parameters<typeof registerCompactionStatusProjection>[0] &
      Parameters<typeof registerPrivacyBridge>[0]
    stopCompaction = registerCompactionStatusProjection(legacyCtx)
    if (config) stopPrivacyBridge = registerPrivacyBridge(legacyCtx, config)
  }

  const store = createHostStateStore(ctx)
  let invalidateSearchCache: ((id: string) => void) | undefined

  const stopPrivacy = installHostPrivacyGuards(ctx)
  const stopAuthCookiePruner = installHostAuthCookiePruner(ctx)
  const stopSearch = installHostSessionSearch(ctx, {
    isExcluded: (sessionId) => {
      const st = store.getCached()
      return st.lockedSessionIds.includes(sessionId) || st.deletedSessionIds.includes(sessionId)
    },
    registerInvalidator: (fn) => { invalidateSearchCache = fn },
  })
  const stopSessionOps = installHostSessionOps(ctx, store, {
    onSessionChanged: (sessionId) => { invalidateSearchCache?.(sessionId) },
  })
  const proxyMgr = installHostProxyManager(ctx, store)

  return () => {
    void proxyMgr.dispose()
    stopSessionOps()
    stopSearch()
    stopAuthCookiePruner()
    stopPrivacy()
    stopPrivacyBridge()
    stopCompaction()
  }
}

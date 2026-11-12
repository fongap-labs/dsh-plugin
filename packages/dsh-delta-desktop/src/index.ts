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
import { DeltaFeatureRegistry } from './feature-registry.js'

export { Config } from './privacy-bridge.js'
export { DeltaFeatureRegistry, DELTA_FEATURE_OWNERS, DELTA_EXTENSION_SURFACES } from './feature-registry.js'
export type { DeltaDesktopFeature, DeltaExtensionSurface, DeltaFeatureOwner } from './feature-registry.js'

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
export { installGatewayRetryGuard, isDeferredGatewayExhaustion } from './host-gateway-retry-guard.js'
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
  // The Host retains authority for deletion, secrets, privacy and model access.
  // The registry orders extension lifecycles; it never grants privileges.
  if (!ctx || typeof ctx !== 'object') return () => {}

  const registry = new DeltaFeatureRegistry<PrivacyHostContext>()
  const store = createHostStateStore(ctx)
  const legacyCtx = ctx as unknown as Parameters<typeof registerCompactionStatusProjection>[0] &
    Parameters<typeof registerPrivacyBridge>[0]
  let invalidateSearchCache: ((id: string) => void) | undefined

  registry.register({
    id: 'context.compaction-status',
    owner: 'context',
    surfaces: ['right-sidebar'],
    optional: true,
    install: () => typeof ctx.inject === 'function'
      ? registerCompactionStatusProjection(legacyCtx) : () => {},
  })
  registry.register({
    id: 'security.model-stream-policy',
    owner: 'security',
    surfaces: ['settings'],
    install: () => {
      if (!config) return () => {}
      if (typeof ctx.inject !== 'function') {
        throw new Error('Delta privacy bridge requires the Host service injection contract')
      }
      return registerPrivacyBridge(legacyCtx, config)
    },
  })
  registry.register({
    id: 'security.privacy-guards',
    owner: 'security',
    install: () => installHostPrivacyGuards(ctx),
  })
  registry.register({
    id: 'security.auth-cookie-pruner',
    owner: 'security',
    install: () => installHostAuthCookiePruner(ctx),
  })
  registry.register({
    id: 'discovery.session-search',
    owner: 'discovery',
    surfaces: ['left-sidebar'],
    install: () => installHostSessionSearch(ctx, {
      isExcluded: sessionId => {
        const cached = store.getCached()
        return cached.lockedSessionIds.includes(sessionId) || cached.deletedSessionIds.includes(sessionId)
      },
      registerInvalidator: fn => { invalidateSearchCache = fn },
    }),
  })
  registry.register({
    id: 'sessions.session-operations',
    owner: 'sessions',
    surfaces: ['left-sidebar'],
    install: () => installHostSessionOps(ctx, store, {
      onSessionChanged: sessionId => { invalidateSearchCache?.(sessionId) },
    }),
  })
  // Gateway retry coordination belongs to Delta Code Worker; avoid a second Host listener.
  registry.register({
    id: 'integrations.proxy-settings',
    owner: 'integrations',
    surfaces: ['settings'],
    install: () => {
      const proxyMgr = installHostProxyManager(ctx, store)
      return () => { void proxyMgr.dispose() }
    },
  })

  const instance = registry.mount(ctx, new Set<string>())
  return () => instance.dispose()
}

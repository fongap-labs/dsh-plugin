/** Delta Suite composition; Cordis retains plugin lifecycle ownership. */
import {
  installHostAuthCookiePruner,
  parseAuthCookieNames,
  selectStaleAuthCookieNames,
} from './host-auth-cookies.js'
import { installHostPrivacyGuards } from './host-privacy.js'
import type { PrivacyHostContext } from './host-privacy.js'
import { installHostProxyManager } from './host-proxy.js'
import { installHostSessionSearch } from './host-search.js'
import { installHostSessionOps, readHostSearchExclusion } from './host-sessions.js'
import { installHostVisionOps } from './host-vision.js'
import { createHostStateStore } from './host-state.js'
import { registerCompactionStatusProjection } from './context-projection.js'
import { registerPrivacyBridge, type DeltaPrivacyConfig } from './privacy-bridge.js'
import { DeltaFeatureRegistry } from './delta-suite-kernel/feature-lifecycle-registry.js'

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
      prepareExclusion: () => store.read(),
      readExclusion: () => readHostSearchExclusion(store.getCached(), () => ctx.get?.('workspaceRegistry')),
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
  registry.register({
    id: 'integrations.vision-bridge',
    owner: 'integrations',
    surfaces: ['settings'],
    optional: true,
    install: () => installHostVisionOps(ctx, store),
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

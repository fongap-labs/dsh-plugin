/** Delta Suite composition; Cordis retains plugin lifecycle ownership. */
import { installHostPrivacyGuards } from './host-privacy.js'
import type { PrivacyHostContext } from './host-privacy.js'
import { installHostSessionSearch } from './host-search.js'
import { installHostSessionOps, readHostSearchExclusion } from './host-sessions.js'
import { createHostStateStore } from './host-state.js'
import { registerCompactionStatusProjection } from './context-projection.js'
import { installHostTaskIntent } from './host-task-intent.js'
import { DeltaFeatureRegistry } from './delta-suite-kernel/feature-lifecycle-registry.js'

export function apply(ctx?: PrivacyHostContext): () => void {
  // The Host retains authority for deletion, secrets, privacy and model access.
  // The registry orders extension lifecycles; it never grants privileges.
  if (!ctx || typeof ctx !== 'object') return () => {}

  const registry = new DeltaFeatureRegistry<PrivacyHostContext>()
  const store = createHostStateStore(ctx)
  const legacyCtx = ctx as unknown as Parameters<typeof registerCompactionStatusProjection>[0]
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
    id: 'context.task-intent',
    owner: 'context',
    optional: true,
    install: () => installHostTaskIntent(ctx),
  })
  registry.register({
    id: 'security.privacy-guards',
    owner: 'security',
    install: () => installHostPrivacyGuards(ctx),
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
  const instance = registry.mount(ctx, new Set<string>())
  return () => instance.dispose()
}

import { z } from 'zod'

export interface CompactionStatus {
  seq: number
  failed: boolean
}

export interface CompactionEvent {
  type: string
  seq: number
  data?: unknown
}

const CompactionStatusSchema = z.object({
  seq: z.number().int(),
  failed: z.boolean(),
})

export const EMPTY_COMPACTION_STATUS: CompactionStatus = Object.freeze({ seq: -1, failed: false })

/** Keep only the latest durable compaction outcome for a clear, recoverable UI signal. */
export function foldCompactionStatus(state: CompactionStatus, event: CompactionEvent): CompactionStatus {
  if (event.type !== 'compaction/end') return state
  const data = event.data && typeof event.data === 'object' ? event.data as Record<string, unknown> : undefined
  return { seq: event.seq, failed: typeof data?.error === 'string' && data.error.length > 0 }
}

export const compactionStatusProjection = {
  key: 'deltaContextCompactionStatus',
  stateSchema: CompactionStatusSchema,
  stateVersion: 1,
  init: () => EMPTY_COMPACTION_STATUS,
  apply: foldCompactionStatus,
  wire: {
    viewSchema: CompactionStatusSchema,
    view: (state: CompactionStatus) => state,
  },
}

interface ProjectionHandle { dispose(): Promise<void> }
interface ProjectionRegistry { register(definition: unknown): Promise<ProjectionHandle> }
interface ProjectionContext {
  sessionProjections?: ProjectionRegistry
  logger?: { warn?(message: string): void }
}

/** Register an optional client-readable projection; older Hosts keep working without it. */
export function registerCompactionStatusProjection(ctx: {
  inject(services: string[], callback: (child: ProjectionContext) => void): void
  logger?: { warn?(message: string): void }
}): () => void {
  let isActive = true
  let hasRegistrationStarted = false
  let handle: ProjectionHandle | undefined
  ctx.inject(['sessionProjections'], child => {
    if (!isActive || hasRegistrationStarted || typeof child.sessionProjections?.register !== 'function') return
    hasRegistrationStarted = true
    void Promise.resolve(child.sessionProjections.register(compactionStatusProjection)).then(async registered => {
      if (!isActive) { await registered.dispose(); return }
      handle = registered
    }).catch(() => {
      ;(child.logger || ctx.logger)?.warn?.('dsh-delta-desktop: compaction status projection registration failed')
    })
  })
  return () => {
    isActive = false
    const registered = handle
    handle = undefined
    if (registered) void registered.dispose().catch(() => {
      ctx.logger?.warn?.('dsh-delta-desktop: compaction status projection disposal failed')
    })
  }
}
